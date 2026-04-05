/**
 * Companion Memory Flush
 * 
 * Hooks into before_reset and before_compaction to persist conversation
 * memories to per-user MEMORY.md before they're lost.
 * 
 * before_reset: receives full message array from transcript
 * before_compaction: reads transcript JSONL from disk
 * 
 * Also auto-sets onboardingComplete when sufficient user data exists.
 */

import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const USER_DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/data/users';
const DATA_DIR = process.env.COMPANION_DATA_DIR || '/app/data';
const LOG_FILE = '/tmp/companion-memory-flush.log';

function log(msg) {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// --- Session key parsing (same logic as user-resolver) ---

function resolveUserIdFromSessionKey(sessionKey) {
  if (!sessionKey || sessionKey === 'main') return null;
  const parts = sessionKey.split(':');

  // agent:main:direct:UUID (identityLinks resolved)
  if (parts.length === 4 && parts[2] === 'direct') return parts[3];

  // agent:main:telegram:direct:PEER_ID — need to look up user by peer
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin', 'app'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const channel = parts[i];
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== channel && peerId !== 'direct' && peerId !== 'group') {
        return lookupUserByPeer(channel, peerId);
      }
    }
  }

  return null;
}

function lookupUserByPeer(channel, peerId) {
  try {
    const usersPath = join(DATA_DIR, 'users.json');
    if (!existsSync(usersPath)) return null;
    const users = JSON.parse(readFileSync(usersPath, 'utf-8'));

    for (const [id, user] of Object.entries(users)) {
      // Check channelLinks
      if (user.channelLinks) {
        for (const link of user.channelLinks) {
          if (link.channel === channel && link.peerId === peerId) return id;
        }
      }
      // Legacy telegram
      if (channel === 'telegram' && user.telegramChatId === peerId) return id;
      // App or identity match
      if (id === peerId) return id;
    }
  } catch (e) {
    log(`lookupUserByPeer error: ${e.message}`);
  }
  return null;
}

// --- Extract facts from messages ---

function extractFacts(messages) {
  const facts = [];
  const seen = new Set();

  for (const msg of messages) {
    const role = msg.role;
    let content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter(p => p.type === 'text').map(p => p.text || '').join(' ')
        : '';

    if (!content || content.length < 5) continue;

    if (role === 'user') {
      // Strip everything before the actual user message:
      // Rule-injector prepends ~19KB of rules + OC appends envelope metadata.
      // User's real text is AFTER the last ``` (closing Sender block).
      const lastFence = content.lastIndexOf('```');
      if (lastFence !== -1 && lastFence < content.length - 5) {
        content = content.substring(lastFence + 3);
      }
      // Fallback: if no fence but starts with rules, skip
      if (content.startsWith('## ⚡') || content.startsWith('A new session was started')) continue;
      content = content.trim();
      if (!content || content.length < 5) continue;

      // Extract user-stated facts
      const patterns = [
        { re: /(?:my name is|i'm|i am)\s+(\w+)/i, tag: 'name' },
        { re: /(?:i(?:'m| am)|i weigh)\s+(\d+)\s*(?:kg|lbs|pounds)/i, tag: 'weight' },
        { re: /(?:i(?:'m| am)\s+(\d+)\s*(?:years?\s*old|yo))/i, tag: 'age' },
        { re: /(?:allergic|allergy|intolerant|can't eat|don't eat)\s*(?:to)?\s+(.+?)(?:\.|,|$)/i, tag: 'allergy' },
        { re: /(?:i(?:'m| am) (?:vegetarian|vegan|pescatarian|keto|carnivore|gluten.free|dairy.free))/i, tag: 'diet' },
        { re: /(?:i take|taking|my (?:supplements?|medication))\s+(.+?)(?:\.|,|$)/i, tag: 'supplements' },
        { re: /(?:i (?:like|love|prefer|enjoy))\s+(.+?)(?:\.|,|!|$)/i, tag: 'preference' },
        { re: /(?:i (?:hate|dislike|can't stand|don't like))\s+(.+?)(?:\.|,|!|$)/i, tag: 'dislike' },
        { re: /(?:i (?:work out|exercise|train|go to (?:the )?gym))\s*(.*?)(?:\.|,|$)/i, tag: 'exercise' },
        { re: /(?:i (?:usually|normally|always|never|typically))\s+(.+?)(?:\.|,|$)/i, tag: 'habit' },
        { re: /(?:my goal|i want to|trying to|i need to)\s+(.+?)(?:\.|,|$)/i, tag: 'goal' },
        { re: /(?:i work|my job|i(?:'m| am) a)\s+(.+?)(?:\.|,|$)/i, tag: 'occupation' },
        { re: /(?:i sleep|go to bed|wake up)\s*(?:at|around)?\s*(.+?)(?:\.|,|$)/i, tag: 'sleep' },
        { re: /(?:i live|i(?:'m| am) (?:from|in|based in))\s+(.+?)(?:\.|,|$)/i, tag: 'location' },
        { re: /(?:remember|don't forget|note that|keep in mind)\s+(.+?)(?:\.|$)/i, tag: 'explicit' },
      ];

      for (const { re, tag } of patterns) {
        const match = content.match(re);
        if (match) {
          const fact = `(${tag}) ${match[0].trim().substring(0, 200)}`;
          if (!seen.has(fact)) {
            seen.add(fact);
            facts.push(fact);
          }
        }
      }
    }

    if (role === 'assistant') {
      // Extract assistant's tool usage that indicates learned data
      // If Bryan called write_meal, curl health API, etc — note that interaction happened
      if (content.includes('write_meal') || content.includes('meals-')) {
        const fact = '(meal-logged) Bryan logged a meal during this session';
        if (!seen.has(fact)) { seen.add(fact); facts.push(fact); }
      }
      if (content.includes('onboardingComplete')) {
        const fact = '(onboarding) Bryan attempted to complete onboarding';
        if (!seen.has(fact)) { seen.add(fact); facts.push(fact); }
      }
    }
  }

  return facts;
}

// --- Check if onboarding should be auto-completed ---

function checkAndSetOnboarding(userId, messages) {
  try {
    const usersPath = join(DATA_DIR, 'users.json');
    if (!existsSync(usersPath)) return;
    const users = JSON.parse(readFileSync(usersPath, 'utf-8'));
    const user = users[userId];
    if (!user) return;
    if (user.healthProfile?.onboardingComplete) return; // already done

    // Count substantive user messages (strip injected rules, then check)
    const userMsgs = messages.filter(m => {
      if (m.role !== 'user') return false;
      let text = typeof m.content === 'string' ? m.content : '';
      // Strip rule-injector + envelope to get actual user text
      const lastFence = text.lastIndexOf('```');
      if (lastFence !== -1 && lastFence < text.length - 5) {
        text = text.substring(lastFence + 3).trim();
      }
      if (!text || text.startsWith('/') || text.startsWith('A new session')) return false;
      return text.length > 5;
    });

    // Check if we have enough profile data
    const hp = user.healthProfile || {};
    const hasBasics = hp.heightCm && hp.weightKg && hp.biologicalSex;

    // Auto-complete if: 5+ real user messages AND basic profile exists
    if (userMsgs.length >= 5 && hasBasics) {
      user.healthProfile = user.healthProfile || {};
      user.healthProfile.onboardingComplete = true;
      users[userId] = user;
      writeFileSync(usersPath, JSON.stringify(users, null, 2));
      log(`Auto-set onboardingComplete=true for ${userId} (${userMsgs.length} messages, basics present)`);

      // Also update via companion-server API (best-effort, fire-and-forget)
      fetch(`http://companion-server:3950/api/internal/users/${userId}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingComplete: true }),
      }).catch(e => log(`API update failed (non-fatal): ${e.message}`));
    }
  } catch (e) {
    log(`checkAndSetOnboarding error: ${e.message}`);
  }
}

// --- Write facts to per-user MEMORY.md ---

function writeToUserMemory(userId, facts, reason) {
  if (!facts.length) return;
  const memoryPath = join(USER_DATA_DIR, userId, 'MEMORY.md');
  if (!existsSync(memoryPath)) return;

  const date = new Date().toISOString().split('T')[0];
  const header = `\n## Session flush [${date}] (${reason})\n`;
  const entries = facts.map(f => `- ${f}`).join('\n');

  try {
    appendFileSync(memoryPath, header + entries + '\n');
    log(`Wrote ${facts.length} facts for ${userId} (${reason})`);
  } catch (e) {
    log(`writeToUserMemory failed: ${e.message}`);
  }
}

// --- Read transcript JSONL ---

function readTranscriptMessages(sessionFile) {
  if (!sessionFile || !existsSync(sessionFile)) return [];
  const messages = [];
  try {
    const content = readFileSync(sessionFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === 'message' && entry.message) {
          messages.push(entry.message);
        }
      } catch {}
    }
  } catch (e) {
    log(`readTranscript error: ${e.message}`);
  }
  return messages;
}

// --- Resolve session file path for compaction ---

function resolveSessionFile(ctx) {
  // Try to find the JSONL file from sessionId
  const agentId = ctx.agentId || 'main';
  const sessionId = ctx.sessionId;
  if (!sessionId) return null;

  const paths = [
    join('/root/.openclaw-companion/agents', agentId, 'sessions', `${sessionId}.jsonl`),
    join('/root/.openclaw/agents', agentId, 'sessions', `${sessionId}.jsonl`),
  ];

  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return null;
}

// --- Plugin registration ---

export default function register(api) {
  log('companion-memory-flush plugin registered');

  // Hook: before_reset — fires on /reset or /new, receives full messages array
  api.on('before_reset', (event, ctx) => {
    try {
      const sessionKey = ctx?.sessionKey || '';
      const messages = event?.messages || [];
      const reason = event?.reason || 'reset';

      log(`before_reset fired: sessionKey=${sessionKey} messages=${messages.length} reason=${reason}`);

      if (messages.length === 0) {
        log('No messages in transcript, skipping');
        return;
      }

      const userId = resolveUserIdFromSessionKey(sessionKey);
      if (!userId) {
        log(`Could not resolve userId from sessionKey: ${sessionKey}`);
        return;
      }

      const facts = extractFacts(messages);
      log(`Extracted ${facts.length} facts for ${userId}`);

      writeToUserMemory(userId, facts, reason);
      checkAndSetOnboarding(userId, messages);
    } catch (e) {
      log(`before_reset handler error: ${e.message}`);
    }
  });

  // Hook: before_compaction — fires before compaction, needs to read transcript
  api.on('before_compaction', (event, ctx) => {
    try {
      const sessionKey = ctx?.sessionKey || '';
      log(`before_compaction fired: sessionKey=${sessionKey} messageCount=${event?.messageCount} tokenCount=${event?.tokenCount}`);

      const userId = resolveUserIdFromSessionKey(sessionKey);
      if (!userId) {
        log(`Could not resolve userId from sessionKey: ${sessionKey}`);
        return;
      }

      // Read transcript from disk
      const sessionFile = resolveSessionFile(ctx);
      if (!sessionFile) {
        log(`Could not find session file for ${ctx.sessionId}`);
        return;
      }

      const messages = readTranscriptMessages(sessionFile);
      if (messages.length === 0) {
        log('No messages in transcript, skipping');
        return;
      }

      const facts = extractFacts(messages);
      log(`Extracted ${facts.length} facts for ${userId} (compaction)`);

      writeToUserMemory(userId, facts, 'compaction');
      checkAndSetOnboarding(userId, messages);
    } catch (e) {
      log(`before_compaction handler error: ${e.message}`);
    }
  });
}
