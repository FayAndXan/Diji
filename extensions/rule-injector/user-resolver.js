/**
 * Multi-tenant user resolver for Bryan
 * 
 * Resolves the current user from OpenClaw session context.
 * With dmScope: per-channel-peer, each user gets their own session.
 * The sessionKey format is: dm:<channel>:<peerId>
 * 
 * This module:
 * 1. Extracts channel + peerId from sessionKey
 * 2. Looks up the user in companion server
 * 3. Returns user profile data for rule injection
 * 4. Creates a new user record if first contact
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.COMPANION_DATA_DIR || '/app/data';
const USER_DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data/users';

/**
 * Parse session key to extract channel and peer info
 * Format examples:
 * - "dm:telegram:PEER_ID" 
 * - "dm:whatsapp-cloud:PHONE_NUMBER"
 * - "dm:openclaw-weixin:wxid_xxx"
 * - "main" (legacy single-user)
 */
export function parseSessionKey(sessionKey) {
  if (!sessionKey || sessionKey === 'main') {
    return { channel: null, peerId: null, isMain: true };
  }
  
  const parts = sessionKey.split(':');
  
  // Format: agent:main:telegram:direct:PEER_ID
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin', 'app'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const channel = parts[i];
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== channel && peerId !== 'direct' && peerId !== 'group') {
        return { channel, peerId, isMain: false };
      }
    }
  }
  
  // Fallback: dm:channel:peerId format
  if (parts.length >= 3 && parts[0] === 'dm') {
    return { channel: parts[1], peerId: parts.slice(2).join(':'), isMain: false };
  }
  
  return { channel: null, peerId: null, isMain: true };
}

/**
 * Load all users from companion server data
 */
function loadUsers() {
  const path = join(DATA_DIR, 'users.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save users back
 */
function saveUsers(users) {
  writeFileSync(join(DATA_DIR, 'users.json'), JSON.stringify(users, null, 2));
}

/**
 * Find user by channel + peerId
 */
export function findUserByPeer(channel, peerId) {
  const users = loadUsers();
  
  for (const [id, user] of Object.entries(users)) {
    // Check channelLinks
    if (user.channelLinks) {
      for (const link of user.channelLinks) {
        if (link.channel === channel && link.peerId === peerId) {
          return { ...user, id };
        }
      }
    }
    
    // Legacy: check telegramChatId for telegram users
    if (channel === 'telegram' && user.telegramChatId === peerId) {
      return { ...user, id };
    }
    
    // Legacy: check telegramUsername
    if (channel === 'telegram' && user.telegramUsername && user.telegramChatId === peerId) {
      return { ...user, id };
    }
    
    // App sessions: peerId IS the userId
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

/**
 * Find user by email (for cross-channel linking)
 */
export function findUserByEmail(email) {
  if (!email) return null;
  const users = loadUsers();
  for (const [id, user] of Object.entries(users)) {
    if (user.email && user.email.toLowerCase() === email.toLowerCase()) {
      return { ...user, id };
    }
  }
  return null;
}

/**
 * Link a new channel to an existing user
 */
export function linkChannelToUser(userId, channel, peerId) {
  const users = loadUsers();
  const user = users[userId];
  if (!user) return false;
  
  if (!user.channelLinks) user.channelLinks = [];
  
  const exists = user.channelLinks.some(l => l.channel === channel && l.peerId === peerId);
  if (!exists) {
    user.channelLinks.push({ channel, peerId, linkedAt: new Date().toISOString() });
    users[userId] = user;
    saveUsers(users);
    console.log(`[user-resolver] Linked ${channel}:${peerId} to existing user ${userId}`);
  }
  return true;
}

/**
 * Try to find existing user by checking companion server for app-registered users
 * who picked this channel but haven't messaged yet
 */
async function findUserByAppRegistration(channel, peerId) {
  try {
    // Check if the companion server knows about this peer from app onboarding
    const res = await fetch(`http://localhost:3950/api/internal/user-by-channel/${channel}/${peerId}`);
    if (res.ok) {
      const user = await res.json();
      return user;
    }
  } catch {}
  return null;
}

/**
 * Create a new user from first contact
 */
export function createUserFromPeer(channel, peerId) {
  const users = loadUsers();
  const id = crypto.randomUUID();
  
  const user = {
    id,
    token: crypto.randomUUID(),
    companionName: 'Bryan',
    telegramUsername: channel === 'telegram' ? '' : '',
    telegramChatId: channel === 'telegram' ? peerId : undefined,
    deviceId: '',
    createdAt: new Date().toISOString(),
    creatureState: 'glowing',
    channelLinks: [{ channel, peerId, linkedAt: new Date().toISOString() }],
    healthProfile: {
      language: 'en',
      companionGender: 'male',
      companionName: 'Bryan',
      timezone: 'UTC'
    }
  };
  
  users[id] = user;
  saveUsers(users);
  
  // Create user data directory
  const userDir = join(USER_DATA_DIR, id);
  mkdirSync(join(userDir, 'health'), { recursive: true });
  
  console.log(`[user-resolver] New user created: ${id} (${channel}:${peerId})`);
  return user;
}

/**
 * Get user's data directory path
 */
export function getUserDataDir(userId) {
  return join(USER_DATA_DIR, userId);
}

/**
 * Resolve user from session context
 * Returns user object with profile + data paths
 */
export function resolveUser(ctx) {
  const { channel, peerId, isMain } = parseSessionKey(ctx?.sessionKey);
  
  if (isMain) {
    // Legacy main session — assume Fay
    return {
      id: process.env.DEFAULT_USER_ID || 'default',
      isNew: false,
      channel: 'telegram',
      peerId: process.env.DEFAULT_PEER_ID || '0',
      healthProfile: { language: 'en', companionGender: 'male', timezone: 'UTC' },
      dataDir: join(USER_DATA_DIR, process.env.DEFAULT_USER_ID || 'default')
    };
  }
  
  // Try to find existing user
  let user = findUserByPeer(channel, peerId);
  
  if (!user) {
    // Unregistered user — DON'T auto-create. Auth gate in bootstrap hook handles this.
    console.log(`[user-resolver] Unregistered user ${channel}:${peerId} — returning guest profile`);
    return {
      id: 'guest',
      isNew: true,
      isGuest: true,
      channel,
      peerId,
      healthProfile: { language: 'en', companionGender: 'male', companionName: 'Bryan', timezone: 'UTC' },
      dataDir: null
    };
  }
  
  return {
    ...user,
    isNew: false,
    channel,
    peerId,
    dataDir: getUserDataDir(user.id)
  };
}
