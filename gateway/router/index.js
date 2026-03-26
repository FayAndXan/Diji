// ---------------------------------------------------------------------------
// Diji Gateway Router
// Routes incoming webhook messages to the correct OpenClaw instance
// based on user ID. Uses Redis for user-to-instance mapping.
//
// Architecture:
//   [Telegram/WhatsApp/WeChat webhook] → [nginx:443] → [this router:4000]
//   → [OpenClaw instance N on port 18809+N]
//
// Each OpenClaw instance handles a chunk of users.
// Redis tracks: userId → instanceId mapping
// New users get assigned to the least-loaded instance.
// ---------------------------------------------------------------------------

import Redis from 'ioredis';
import http from 'http';
import https from 'https';

const ROUTER_PORT = parseInt(process.env.ROUTER_PORT || '4000');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const MAX_USERS_PER_INSTANCE = parseInt(process.env.MAX_USERS_PER_INSTANCE || '500');

// Instance registry: each entry is { id, host, port, userCount }
// In production, instances self-register via Redis on startup
const redis = new Redis(REDIS_URL);

// ---------------------------------------------------------------------------
// Extract user ID from incoming webhook payload
// ---------------------------------------------------------------------------
function extractUserId(body, path) {
  try {
    const data = JSON.parse(body);
    
    // Telegram webhook
    if (data.message?.from?.id) {
      return { channel: 'telegram', userId: String(data.message.from.id) };
    }
    if (data.callback_query?.from?.id) {
      return { channel: 'telegram', userId: String(data.callback_query.from.id) };
    }
    
    // WhatsApp Cloud API webhook
    if (data.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from) {
      return { channel: 'whatsapp', userId: data.entry[0].changes[0].value.messages[0].from };
    }
    
    // WeChat webhook
    if (data.FromUserName) {
      return { channel: 'wechat', userId: data.FromUserName };
    }
    
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Get or assign instance for a user
// ---------------------------------------------------------------------------
async function getInstanceForUser(channel, userId) {
  const key = `diji:user:${channel}:${userId}`;
  
  // Check existing assignment
  let instanceId = await redis.get(key);
  if (instanceId) {
    const instance = await redis.hgetall(`diji:instance:${instanceId}`);
    if (instance && instance.host) {
      return instance;
    }
    // Instance gone, reassign
    await redis.del(key);
  }
  
  // Find least-loaded instance
  const instanceIds = await redis.smembers('diji:instances');
  let bestInstance = null;
  let minUsers = Infinity;
  
  for (const id of instanceIds) {
    const inst = await redis.hgetall(`diji:instance:${id}`);
    const count = parseInt(inst.userCount || '0');
    if (count < MAX_USERS_PER_INSTANCE && count < minUsers) {
      minUsers = count;
      bestInstance = { ...inst, id };
    }
  }
  
  if (!bestInstance) {
    console.error('[router] No available instances! All at capacity.');
    return null;
  }
  
  // Assign user to instance
  await redis.set(key, bestInstance.id);
  await redis.hincrby(`diji:instance:${bestInstance.id}`, 'userCount', 1);
  console.log(`[router] Assigned ${channel}:${userId} → instance ${bestInstance.id} (${minUsers + 1} users)`);
  
  return bestInstance;
}

// ---------------------------------------------------------------------------
// Forward request to the assigned OpenClaw instance
// ---------------------------------------------------------------------------
function forwardRequest(req, body, instance, res) {
  const options = {
    hostname: instance.host || '127.0.0.1',
    port: parseInt(instance.port),
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'host': `${instance.host}:${instance.port}`,
      'content-length': Buffer.byteLength(body),
      'x-diji-routed': 'true',
    },
  };
  
  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxy.on('error', (err) => {
    console.error(`[router] Forward error to instance ${instance.id}: ${err.message}`);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
  
  proxy.write(body);
  proxy.end();
}

// ---------------------------------------------------------------------------
// Instance self-registration (called by each OpenClaw instance on startup)
// ---------------------------------------------------------------------------
async function registerInstance(id, host, port) {
  await redis.sadd('diji:instances', id);
  await redis.hset(`diji:instance:${id}`, {
    id, host, port: String(port), userCount: '0',
    registeredAt: new Date().toISOString(),
  });
  console.log(`[router] Instance registered: ${id} at ${host}:${port}`);
}

async function deregisterInstance(id) {
  // Reassign users from this instance
  const keys = await redis.keys('diji:user:*');
  for (const key of keys) {
    const assignedTo = await redis.get(key);
    if (assignedTo === id) {
      await redis.del(key); // Will be reassigned on next message
    }
  }
  await redis.srem('diji:instances', id);
  await redis.del(`diji:instance:${id}`);
  console.log(`[router] Instance deregistered: ${id}`);
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  let body = '';
  
  // Health check
  if (req.url === '/health') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  
  // Instance registration API
  if (req.url === '/register' && req.method === 'POST') {
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { id, host, port } = JSON.parse(body);
        await registerInstance(id, host, port);
        res.writeHead(200);
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
        const { id } = JSON.parse(body);
        await deregisterInstance(id);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // Stats
  if (req.url === '/stats') {
    (async () => {
      const instanceIds = await redis.smembers('diji:instances');
      const instances = [];
      for (const id of instanceIds) {
        instances.push(await redis.hgetall(`diji:instance:${id}`));
      }
      const totalUsers = await redis.keys('diji:user:*');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ instances, totalUsers: totalUsers.length }));
    })();
    return;
  }
  
  // Webhook routing
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    // WhatsApp verification (GET request)
    if (req.method === 'GET' && req.url.includes('hub.verify_token')) {
      // Forward to first available instance for verification
      const instanceIds = await redis.smembers('diji:instances');
      if (instanceIds.length > 0) {
        const inst = await redis.hgetall(`diji:instance:${instanceIds[0]}`);
        forwardRequest(req, '', inst, res);
      } else {
        res.writeHead(503);
        res.end('No instances available');
      }
      return;
    }
    
    const userInfo = extractUserId(body, req.url);
    
    if (!userInfo) {
      // Can't identify user, forward to first instance (registration, etc.)
      const instanceIds = await redis.smembers('diji:instances');
      if (instanceIds.length > 0) {
        const inst = await redis.hgetall(`diji:instance:${instanceIds[0]}`);
        forwardRequest(req, body, inst, res);
      } else {
        res.writeHead(503);
        res.end('No instances available');
      }
      return;
    }
    
    const instance = await getInstanceForUser(userInfo.channel, userInfo.userId);
    
    if (!instance) {
      res.writeHead(503);
      res.end('All instances at capacity');
      return;
    }
    
    forwardRequest(req, body, instance, res);
  });
});

server.listen(ROUTER_PORT, () => {
  console.log(`[diji-router] Listening on port ${ROUTER_PORT}`);
  console.log(`[diji-router] Redis: ${REDIS_URL}`);
  console.log(`[diji-router] Max users per instance: ${MAX_USERS_PER_INSTANCE}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[diji-router] Shutting down...');
  server.close();
  redis.quit();
});
