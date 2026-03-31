// ---------------------------------------------------------------------------
// Diji Gateway Router v2
// Routes incoming webhook messages to the correct companion instance
// based on hostname (companion) + user ID (instance selection).
//
// Architecture:
//   [Telegram webhook] → [Cloudflare] → [this router:4000]
//   → demi.dijicomp.com → Demi instance pool
//   → bryan.dijicomp.com → Bryan instance pool
//
// Redis keys:
//   diji:{companion}:instances (set of instance IDs)
//   diji:{companion}:instance:{id} (hash: host, port, userCount)
//   diji:{companion}:user:{channel}:{userId} (assigned instance ID)
// ---------------------------------------------------------------------------

import Redis from 'ioredis';
import http from 'http';

const ROUTER_PORT = parseInt(process.env.ROUTER_PORT || '4000');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_USERS_PER_INSTANCE = parseInt(process.env.MAX_USERS_PER_INSTANCE || '500');

const redis = new Redis(REDIS_URL);

// Hostname → companion mapping
const COMPANION_MAP = {
  'demi.dijicomp.com': 'demi',
  'bryan.dijicomp.com': 'bryan',
  'gateway.dijicomp.com': 'gateway', // admin/stats
};

function getCompanion(req) {
  const host = (req.headers.host || '').split(':')[0];
  return COMPANION_MAP[host] || null;
}

// ---------------------------------------------------------------------------
// Extract user ID from incoming webhook payload
// ---------------------------------------------------------------------------
function extractUserId(body) {
  try {
    const data = JSON.parse(body);
    
    // Telegram
    if (data.message?.from?.id) return { channel: 'telegram', userId: String(data.message.from.id) };
    if (data.callback_query?.from?.id) return { channel: 'telegram', userId: String(data.callback_query.from.id) };
    if (data.edited_message?.from?.id) return { channel: 'telegram', userId: String(data.edited_message.from.id) };
    if (data.channel_post?.from?.id) return { channel: 'telegram', userId: String(data.channel_post.from.id) };
    if (data.inline_query?.from?.id) return { channel: 'telegram', userId: String(data.inline_query.from.id) };
    
    // WhatsApp Cloud API
    if (data.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from) {
      return { channel: 'whatsapp', userId: data.entry[0].changes[0].value.messages[0].from };
    }
    
    // WeChat
    if (data.FromUserName) return { channel: 'wechat', userId: data.FromUserName };
    
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Instance management (companion-namespaced)
// ---------------------------------------------------------------------------
async function getInstanceForUser(companion, channel, userId) {
  const userKey = `diji:${companion}:user:${channel}:${userId}`;
  
  let instanceId = await redis.get(userKey);
  if (instanceId) {
    const instance = await redis.hgetall(`diji:${companion}:instance:${instanceId}`);
    if (instance && instance.host) return instance;
    await redis.del(userKey);
  }
  
  // Least-loaded assignment
  const instanceIds = await redis.smembers(`diji:${companion}:instances`);
  let best = null;
  let minUsers = Infinity;
  
  for (const id of instanceIds) {
    const inst = await redis.hgetall(`diji:${companion}:instance:${id}`);
    const count = parseInt(inst.userCount || '0');
    if (count < MAX_USERS_PER_INSTANCE && count < minUsers) {
      minUsers = count;
      best = { ...inst, id };
    }
  }
  
  if (!best) return null;
  
  await redis.set(userKey, best.id);
  await redis.hincrby(`diji:${companion}:instance:${best.id}`, 'userCount', 1);
  console.log(`[router] ${companion}: ${channel}:${userId} → instance ${best.id} (${minUsers + 1} users)`);
  return best;
}

async function registerInstance(companion, id, host, port) {
  await redis.sadd(`diji:${companion}:instances`, id);
  await redis.hset(`diji:${companion}:instance:${id}`, {
    id, host, port: String(port), userCount: '0',
    registeredAt: new Date().toISOString(),
  });
  console.log(`[router] Registered: ${companion}/${id} at ${host}:${port}`);
}

async function deregisterInstance(companion, id) {
  const keys = await redis.keys(`diji:${companion}:user:*`);
  for (const key of keys) {
    if (await redis.get(key) === id) await redis.del(key);
  }
  await redis.srem(`diji:${companion}:instances`, id);
  await redis.del(`diji:${companion}:instance:${id}`);
  console.log(`[router] Deregistered: ${companion}/${id}`);
}

// ---------------------------------------------------------------------------
// Forward request
// ---------------------------------------------------------------------------
function forwardRequest(req, body, instance, res) {
  const options = {
    hostname: instance.host || '127.0.0.1',
    port: parseInt(instance.port),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'content-length': Buffer.byteLength(body),
      'x-diji-routed': 'true',
      'x-diji-instance': instance.id || 'unknown',
    },
  };
  
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxy.on('error', (err) => {
    console.error(`[router] Forward error ${instance.id}: ${err.message}`);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
  
  proxy.write(body);
  proxy.end();
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let body = '';
  
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }
  
  const companion = getCompanion(req);
  
  // Stats (accessible from any hostname)
  if (req.url === '/stats') {
    (async () => {
      const stats = {};
      for (const comp of Object.values(COMPANION_MAP)) {
        if (comp === 'gateway') continue;
        const ids = await redis.smembers(`diji:${comp}:instances`);
        const instances = [];
        for (const id of ids) instances.push(await redis.hgetall(`diji:${comp}:instance:${id}`));
        const users = await redis.keys(`diji:${comp}:user:*`);
        stats[comp] = { instances, totalUsers: users.length };
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
    })();
    return;
  }
  
  // Instance registration
  if (req.url === '/register' && req.method === 'POST') {
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { companion: comp, id, host, port } = JSON.parse(body);
        await registerInstance(comp, id, host, port);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // Instance deregistration
  if (req.url === '/deregister' && req.method === 'POST') {
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { companion: comp, id } = JSON.parse(body);
        await deregisterInstance(comp, id);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  if (!companion || companion === 'gateway') {
    // Gateway hostname: only admin endpoints above, webhook traffic needs companion hostname
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ service: 'diji-router', version: '2.0.0' }));
      return;
    }
    res.writeHead(404);
    res.end('Use companion-specific hostname for webhooks');
    return;
  }
  
  // Webhook routing
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    // WhatsApp GET verification
    if (req.method === 'GET') {
      const ids = await redis.smembers(`diji:${companion}:instances`);
      if (ids.length > 0) {
        const inst = await redis.hgetall(`diji:${companion}:instance:${ids[0]}`);
        forwardRequest(req, '', inst, res);
      } else {
        res.writeHead(503);
        res.end('No instances');
      }
      return;
    }
    
    const userInfo = extractUserId(body);
    
    if (!userInfo) {
      // Unknown user, forward to first instance
      const ids = await redis.smembers(`diji:${companion}:instances`);
      if (ids.length > 0) {
        const inst = await redis.hgetall(`diji:${companion}:instance:${ids[0]}`);
        forwardRequest(req, body, inst, res);
      } else {
        res.writeHead(503);
        res.end('No instances');
      }
      return;
    }
    
    const instance = await getInstanceForUser(companion, userInfo.channel, userInfo.userId);
    if (!instance) {
      res.writeHead(503);
      res.end('All instances at capacity');
      return;
    }
    
    forwardRequest(req, body, instance, res);
  });
});

server.listen(ROUTER_PORT, () => {
  console.log(`[diji-router] v2 listening on port ${ROUTER_PORT}`);
  console.log(`[diji-router] Redis: ${REDIS_URL}`);
  console.log(`[diji-router] Max users/instance: ${MAX_USERS_PER_INSTANCE}`);
  console.log(`[diji-router] Companions: ${Object.entries(COMPANION_MAP).map(([h,c]) => `${h} → ${c}`).join(', ')}`);
});

process.on('SIGTERM', () => {
  console.log('[diji-router] Shutting down...');
  server.close();
  redis.quit();
});
