// Auth Gate Plugin
// Intercepts inbound messages from unregistered users BEFORE the LLM runs.
// Zero LLM cost — sends canned reply directly.

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.COMPANION_DATA_DIR || '/app/data';

function loadUsers() {
  const path = join(DATA_DIR, 'users.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function findUserByPeer(channel, peerId) {
  const users = loadUsers();
  for (const [id, user] of Object.entries(users)) {
    if (user.channelLinks) {
      for (const link of user.channelLinks) {
        if (link.channel === channel && String(link.peerId) === String(peerId)) {
          return { ...user, id };
        }
      }
    }
    if (channel === 'telegram' && String(user.telegramChatId) === String(peerId)) {
      return { ...user, id };
    }
    if (channel === 'app' && id === peerId) {
      return { ...user, id };
    }
    // identityLinks rewrites peerId to canonical user ID
    if (id === peerId) {
      return { ...user, id };
    }
  }
  return null;
}

function parseSessionKey(sessionKey) {
  if (!sessionKey || sessionKey === 'main') return { channel: null, peerId: null };
  const parts = sessionKey.split(':');
  
  // per-peer format: agent:main:direct:UUID (identityLinks resolved)
  if (parts.length === 4 && parts[2] === 'direct') {
    return { channel: 'identity', peerId: parts[3] };
  }
  
  // per-channel-peer format
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin', 'app'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== parts[i] && peerId !== 'direct' && peerId !== 'group') {
        return { channel: parts[i], peerId };
      }
    }
  }
  return { channel: null, peerId: null };
}

export default function register(api) {
  api.on('inbound_claim', (event, ctx) => {
    const sessionKey = event.sessionKey || ctx?.sessionKey;
    const { channel, peerId } = parseSessionKey(sessionKey);
    
    if (!channel || !peerId) return; // main session, let through
    
    const user = findUserByPeer(channel, peerId);
    if (user) return; // registered user, let through
    
    // Unregistered user — claim the event so LLM doesn't run (zero cost)
    // Gate reply is sent by user-bootstrap hook via raw Telegram/WhatsApp API
    console.log(`[auth-gate] BLOCKED unregistered user ${channel}:${peerId}`);
    
    return {
      claimed: true
    };
  });
}
