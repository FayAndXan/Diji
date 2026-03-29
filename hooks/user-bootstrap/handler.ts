import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const USER_DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data/users';
const LOG_FILE = '/tmp/user-bootstrap.log';

function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
  console.log(`[user-bootstrap] ${msg}`);
}

function parseSessionKey(sessionKey: string | undefined): { channel: string | null; peerId: string | null } {
  if (!sessionKey || sessionKey === 'main') {
    return { channel: null, peerId: null };
  }
  
  // Format: agent:main:telegram:direct:PEER_ID
  // or: agent:main:whatsapp-cloud:direct:PHONE_NUMBER
  // or: agent:main:openclaw-weixin:direct:wxid_xxx
  const parts = sessionKey.split(':');
  
  // Look for known channel names in the parts
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const channel = parts[i];
      // peerId is typically the last part
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== channel && peerId !== 'direct' && peerId !== 'group') {
        return { channel, peerId };
      }
    }
  }
  
  // Fallback: dm:channel:peerId format
  if (parts.length >= 3 && parts[0] === 'dm') {
    return { channel: parts[1], peerId: parts.slice(2).join(':') };
  }
  
  return { channel: null, peerId: null };
}

async function lookupUser(channel: string, peerId: string): Promise<any | null> {
  try {
    const res = await fetch(`http://localhost:3950/api/internal/user-by-channel/${channel}/${peerId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function tryReadFile(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

export default async (event: any) => {
  log(`Hook fired! event.type=${event.type} event.action=${event.action}`);
  
  if (!(event.type === 'agent:bootstrap' || (event.type === 'agent' && event.action === 'bootstrap'))) {
    log(`Skipping — not agent:bootstrap (got type=${event.type} action=${event.action})`);
    return;
  }
  
  const context = event.context;
  const sessionKey = context?.sessionKey;
  log(`sessionKey=${sessionKey}`);
  
  const { channel, peerId } = parseSessionKey(sessionKey);
  if (!channel || !peerId) {
    log('Main session or unknown key, skipping per-user injection');
    return;
  }
  
  // Check if this is a /start deep link with a link token
  const inboundText = event.text || event.message || '';
  const linkMatch = typeof inboundText === 'string' ? inboundText.match(/^\/start\s+link_(\w+)/) : null;
  
  if (linkMatch && linkMatch[1]) {
    const linkToken = linkMatch[1];
    log(`Deep link detected: link token=${linkToken} from ${channel}:${peerId}`);
    
    try {
      const linkRes = await fetch('http://localhost:3950/api/internal/link-by-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkToken, channel, peerId }),
      });
      
      if (linkRes.ok) {
        const linkData = await linkRes.json() as any;
        log(`Channel linked successfully: ${channel}:${peerId} → ${linkData.userId}`);
        
        // Send welcome via Telegram API
        if (channel === 'telegram') {
          try {
            const cfgRaw = readFileSync(process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw-companion/openclaw.json', 'utf-8');
            const cfg = JSON.parse(cfgRaw);
            const botToken = cfg?.channels?.telegram?.accounts?.default?.botToken || cfg?.channels?.telegram?.accounts?.default?.token;
            if (botToken) {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: peerId, text: "hey, you're all set. i can see your health data now. how are you feeling?" }),
              });
              log(`Sent welcome message to ${peerId}`);
            }
          } catch (err) {
            log(`Failed to send welcome: ${err}`);
          }
        }
        return; // Don't run agent for the /start command
      } else {
        log(`Link token invalid or expired: ${linkToken}`);
      }
    } catch (err) {
      log(`Failed to link channel: ${err}`);
    }
  }
  
  const user = await lookupUser(channel, peerId);
  if (!user) {
    log(`No user found for ${channel}:${peerId} — guest user, rule-injector will handle reply`);
    
    // Don't send a message here — rule-injector injects a guest SOUL that makes the agent
    // send the gate reply. Sending here too would cause double messages.
    // Just wipe bootstrap files so the agent has minimal context.
    if (context.bootstrapFiles) {
      context.bootstrapFiles = [];
    }
    return;
  }
  
  const userId = user.id;
  log(`User resolved: ${userId} (${channel}:${peerId})`);
  
  const userDir = join(USER_DATA_DIR, userId);
  
  // Replace USER.md
  const userMdContent = tryReadFile(join(userDir, 'USER.md'));
  if (userMdContent && context.bootstrapFiles) {
    const idx = context.bootstrapFiles.findIndex((f: any) => f.name === 'USER.md');
    if (idx >= 0) {
      context.bootstrapFiles[idx] = {
        ...context.bootstrapFiles[idx],
        content: userMdContent,
      };
      log(`Replaced USER.md for ${userId}`);
    } else {
      context.bootstrapFiles.push({ name: 'USER.md', content: userMdContent });
      log(`Added USER.md for ${userId}`);
    }
  }
  
  // Replace MEMORY.md
  const memoryContent = tryReadFile(join(userDir, 'MEMORY.md'));
  if (memoryContent && context.bootstrapFiles) {
    const idx = context.bootstrapFiles.findIndex((f: any) => f.name === 'MEMORY.md');
    if (idx >= 0) {
      context.bootstrapFiles[idx] = {
        ...context.bootstrapFiles[idx],
        content: memoryContent,
      };
      log(`Replaced MEMORY.md for ${userId}`);
    } else {
      context.bootstrapFiles.push({ name: 'MEMORY.md', content: memoryContent });
      log(`Added MEMORY.md for ${userId}`);
    }
  }
  
  log('Bootstrap injection complete');
};
