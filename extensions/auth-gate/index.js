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
  }
  return null;
}

function parseSessionKey(sessionKey) {
  if (!sessionKey || sessionKey === 'main') return { channel: null, peerId: null };
  const parts = sessionKey.split(':');
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin'];
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
    
    // Unregistered user — claim the event and send canned reply
    console.log(`[auth-gate] BLOCKED unregistered user ${channel}:${peerId}`);
    
    return {
      claimed: true,
      reply: "hey! to get started, download the app and create an account first, then come back and we'll talk."
    };
  });
}
