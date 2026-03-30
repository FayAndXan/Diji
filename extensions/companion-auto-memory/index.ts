import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';

const LOG_FILE = '/tmp/companion-auto-memory.log';
const MEMORY_API = process.env.MEMORY_INGEST_URL || 'https://api.supermemory.ai/v3/memories';
const MEMORY_KEY = process.env.MEMORY_API_KEY || '';
const USER_DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/data/users';

function log(msg: string) {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const MEMORY_PATTERNS = [
  { pattern: /(?:i(?:'m| am)|my name is)\s+(\w+)/i, topic: 'personal-info' },
  { pattern: /(?:i (?:like|love|prefer|enjoy|hate|dislike|can't stand))\s+(.+)/i, topic: 'preferences' },
  { pattern: /(?:allergic|allergy|intolerant|can't eat|don't eat)\s*(?:to)?\s+(.+)/i, topic: 'dietary-restrictions' },
  { pattern: /(?:my goal|i want to|trying to)\s+(.+)/i, topic: 'goals' },
  { pattern: /(?:i weigh|my weight|i'm)\s+(\d+)\s*(?:kg|lbs|pounds)/i, topic: 'measurements' },
  { pattern: /(?:i(?:'m| am)\s+\d+\s*(?:years?\s*old|yo))/i, topic: 'personal-info' },
  { pattern: /(?:i work|my job|i do)\s+(.+?)(?:\.|$)/i, topic: 'lifestyle' },
  { pattern: /(?:i (?:usually|normally|always|never|typically))\s+(.+)/i, topic: 'habits' },
  { pattern: /(?:remember|don't forget|note that|keep in mind)\s+(.+)/i, topic: 'explicit-memory' },
  { pattern: /(?:i(?:'m| am) (?:vegetarian|vegan|pescatarian|keto|carnivore))/i, topic: 'dietary-restrictions' },
  { pattern: /(?:i take|i(?:'m| am) taking|my (?:supplements?|vitamins?|medication))/i, topic: 'supplements' },
  { pattern: /(?:i sleep|my sleep|i go to bed|i wake up)/i, topic: 'sleep-schedule' },
  { pattern: /(?:i (?:work out|exercise|train|go to (?:the )?gym))\s*(.*)/i, topic: 'exercise-habits' },
];

// Store to cloud memory
async function storeMemoryCloud(content: string, topic: string) {
  if (!MEMORY_KEY) return;
  try {
    await fetch(MEMORY_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MEMORY_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content, type: 'long-term',
        metadata: { source: 'bryan-auto', topic, timestamp: new Date().toISOString() }
      })
    });
    log(`Cloud memory stored: [${topic}] ${content.substring(0, 80)}...`);
  } catch (e: any) {
    log(`Cloud memory failed: ${e.message}`);
  }
}

// Store to local MEMORY.md
function storeMemoryLocal(content: string, topic: string, userId: string) {
  if (!userId) return;
  const memoryPath = join(USER_DATA_DIR, userId, 'MEMORY.md');
  try {
    if (!existsSync(memoryPath)) return; // dir not scaffolded yet
    const date = new Date().toISOString().split('T')[0];
    const entry = `- [${date}] (${topic}) ${content.substring(0, 200)}\n`;
    appendFileSync(memoryPath, entry);
    log(`Local memory written for ${userId}: [${topic}]`);
  } catch (e: any) {
    log(`Local memory failed: ${e.message}`);
  }
}

// Update USER.md with extracted info
function updateUserProfile(content: string, topic: string, userId: string) {
  if (!userId) return;
  const userMdPath = join(USER_DATA_DIR, userId, 'USER.md');
  try {
    if (!existsSync(userMdPath)) return;
    
    // Extract and append specific profile info
    let entry = '';
    if (topic === 'personal-info') {
      const nameMatch = content.match(/(?:my name is|i'm|i am)\s+(\w+)/i);
      if (nameMatch) entry = `- **Name:** ${nameMatch[1]}\n`;
      const ageMatch = content.match(/i(?:'m| am)\s+(\d+)\s*(?:years?\s*old|yo)/i);
      if (ageMatch) entry += `- **Age:** ${ageMatch[1]}\n`;
    }
    if (topic === 'measurements') {
      const weightMatch = content.match(/(\d+)\s*(kg|lbs|pounds)/i);
      if (weightMatch) entry = `- **Weight:** ${weightMatch[1]} ${weightMatch[2]}\n`;
    }
    if (topic === 'dietary-restrictions') {
      entry = `- **Diet:** ${content.substring(0, 100)}\n`;
    }
    if (topic === 'goals') {
      entry = `- **Goal:** ${content.substring(0, 100)}\n`;
    }
    
    if (entry) {
      appendFileSync(userMdPath, entry);
      log(`USER.md updated for ${userId}: ${topic}`);
    }
  } catch (e: any) {
    log(`USER.md update failed: ${e.message}`);
  }
}

export default function autoMemory(api: any) {
  log('companion-auto-memory plugin registered');

  api.on('before_prompt_build', (event: any, ctx: any) => {
    const { prompt, messages } = event;
    if (!messages || messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return;

    const content = typeof last.content === 'string'
      ? last.content
      : Array.isArray(last.content)
        ? last.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ')
        : '';

    // Skip system/injected content
    if (content.includes('ENFORCED') || content.includes('rule-injector') || 
        content.includes('⚡') || content.length > 2000) return;

    // Resolve userId from context
    const userId = ctx?.userId || ctx?.deliveryContext?.userId || '';

    // Check patterns and store
    for (const { pattern, topic } of MEMORY_PATTERNS) {
      if (pattern.test(content)) {
        storeMemoryCloud(content.substring(0, 500), topic);
        storeMemoryLocal(content, topic, userId);
        updateUserProfile(content, topic, userId);
        break;
      }
    }
  });
}
