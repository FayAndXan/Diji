// DIJI Auth Gate — Shared Extension
// Zero-cost blocking via inbound_claim hook.
// Works for any DIJI companion (Demi, Bryan, etc).
//
// Config (in openclaw.json plugins.entries.diji-auth-gate):
//   mode: "invite-code" | "companion-server" | "open"
//   gateMessage: custom canned reply text (optional)
//
// invite-code mode: checks invite-codes.json + authorized-users.json
// companion-server mode: checks users.json from companion-server (Bryan pattern)
// open mode: no gate (disabled)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || '/root/.openclaw';
const DATA_DIR = join(STATE_DIR, 'data');

const DEFAULT_GATE_MSG = "hey! 👋 i'm in invite-only mode right now. if you have an invite code, just send it to me and i'll let you in! ✨";

function loadJSON(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

function saveJSON(path, data) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}

// ─── Invite-code auth ───
function isAuthorizedInvite(peerId) {
  return !!loadJSON(join(DATA_DIR, 'authorized-users.json'))[String(peerId)];
}

function tryRedeemCode(peerId, content) {
  const codesFile = join(DATA_DIR, 'invite-codes.json');
  const codes = loadJSON(codesFile);
  const text = (content || '').toUpperCase();
  
  // Match any CODE-XXXXXXXX pattern
  const codeMatch = text.match(/[A-Z]+-[A-F0-9]{6,10}/);
  if (!codeMatch) return false;
  
  const code = codeMatch[0];
  if (codes[code] && !codes[code].used) {
    codes[code] = { ...codes[code], used: true, usedBy: String(peerId), usedAt: new Date().toISOString() };
    saveJSON(codesFile, codes);
    
    const usersFile = join(DATA_DIR, 'authorized-users.json');
    const users = loadJSON(usersFile);
    users[String(peerId)] = { authorizedAt: new Date().toISOString(), code };
    saveJSON(usersFile, users);
    
    console.log(`[diji-auth-gate] Code ${code} redeemed by ${peerId}`);
    return true;
  }
  return false;
}

// ─── Companion-server auth (Bryan pattern) ───
function isAuthorizedCompanion(channel, peerId) {
  // Check companion-server users.json
  const paths = [
    join(DATA_DIR, 'users.json'),
    join(STATE_DIR, 'server', 'data', 'users.json'),
    '/app/data/users.json'
  ];
  
  for (const p of paths) {
    const users = loadJSON(p);
    for (const [id, user] of Object.entries(users)) {
      if (user.channelLinks) {
        for (const link of user.channelLinks) {
          if (link.channel === channel && String(link.peerId) === String(peerId)) return true;
        }
      }
      if (channel === 'telegram' && String(user.telegramChatId) === String(peerId)) return true;
      if (id === peerId) return true;
    }
  }
  return false;
}

// ─── Telegram direct reply ───
async function sendTelegramReply(chatId, text) {
  try {
    const cfg = JSON.parse(readFileSync(join(STATE_DIR, 'openclaw.json'), 'utf-8'));
    const token = cfg?.channels?.telegram?.accounts?.default?.botToken
      || cfg?.channels?.telegram?.botToken;
    if (!token) return;
    
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    if (!resp.ok) console.log(`[diji-auth-gate] Telegram reply failed: ${resp.status}`);
  } catch (e) {
    console.log(`[diji-auth-gate] Reply error: ${e.message}`);
  }
}

// ─── Plugin config ───
function getConfig() {
  try {
    const cfg = JSON.parse(readFileSync(join(STATE_DIR, 'openclaw.json'), 'utf-8'));
    return cfg?.plugins?.entries?.['diji-auth-gate']?.config || {};
  } catch { return {}; }
}

export default function register(api) {
  const config = getConfig();
  const mode = config.mode || 'invite-code';
  const gateMessage = config.gateMessage || DEFAULT_GATE_MSG;
  
  if (mode === 'open') {
    console.log('[diji-auth-gate] mode=open — gate disabled');
    return;
  }
  
  console.log(`[diji-auth-gate] loaded (mode=${mode})`);

  api.on('inbound_claim', async (event, ctx) => {
    const senderId = event.senderId || ctx?.senderId;
    if (!senderId) return;
    
    const channel = event.channel || ctx?.channelId || 'telegram';
    const content = event.content || event.body || '';
    
    // ─── Check authorization ───
    let authorized = false;
    
    if (mode === 'invite-code') {
      authorized = isAuthorizedInvite(senderId);
      
      // Try redeem code before blocking
      if (!authorized && tryRedeemCode(senderId, content)) {
        return; // Code accepted — let through for welcome
      }
    } else if (mode === 'companion-server') {
      authorized = isAuthorizedCompanion(channel, senderId);
    }
    
    if (authorized) return; // Let through
    
    // ─── Not authorized — block ───
    const userDir = join(DATA_DIR, 'users', `${channel}_${senderId}`);
    mkdirSync(userDir, { recursive: true });
    const gateFlag = join(userDir, '.gate-responded');
    
    if (!existsSync(gateFlag)) {
      // First contact — send canned reply
      writeFileSync(gateFlag, new Date().toISOString());
      
      if (channel === 'telegram') {
        await sendTelegramReply(senderId, gateMessage);
      }
      // TODO: add WhatsApp, Signal reply methods
      
      console.log(`[diji-auth-gate] FIRST BLOCK + reply: ${channel}:${senderId}`);
    } else {
      console.log(`[diji-auth-gate] SILENT DROP: ${channel}:${senderId}`);
    }
    
    return { handled: true }; // Zero LLM cost
  });
}
