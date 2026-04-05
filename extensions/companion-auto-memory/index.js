import { appendFileSync, existsSync } from 'fs';
import { join } from 'path';

const LOG_FILE = '/tmp/companion-auto-memory.log';
const PYX_MEMORY_URL = process.env.PYX_MEMORY_URL || 'https://memory.api.pyxmate.com';
const PYX_MEMORY_API_KEY = process.env.PYX_MEMORY_API_KEY || '';
const USER_DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/data/users';

function log(msg) {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const MEMORY_PATTERNS = [
  // --- Personal info (generic i'm X catch-all MUST be last — specific patterns go in their sections) ---
  { pattern: /(?:my name is)\s+(\w+)/i, topic: 'personal-info' },
  { pattern: /(?:i weigh|my weight|i'm)\s+(\d+)\s*(?:kg|lbs|pounds)/i, topic: 'measurements' },
  { pattern: /(?:i(?:'?m| am)\s+\d+\s*(?:years?\s*old|yo))/i, topic: 'personal-info' },
  { pattern: /(?:i(?:'?m| am)\s+(\d+)\s*(?:cm|feet|ft|inches))/i, topic: 'measurements' },
  { pattern: /(?:i work|my job|i(?:'?m| am) a)\s+(.+?)(?:\.|,|$)/i, topic: 'lifestyle' },
  { pattern: /(?:i live|i(?:'?m| am) (?:from|in|based in|located))\s+(.+?)(?:\.|,|$)/i, topic: 'location' },
  { pattern: /(?:my (?:wife|husband|partner|girlfriend|boyfriend|kid|son|daughter|family))/i, topic: 'personal-info' },

  // --- Preferences & dislikes ---
  { pattern: /(?:i (?:like|love|prefer|enjoy))\s+(.+?)(?:\.|,|!|$)/i, topic: 'preferences' },
  { pattern: /(?:i (?:hate|dislike|can'?t stand|don'?t like|don'?t enjoy))\s+(.+?)(?:\.|,|!|$)/i, topic: 'preferences' },
  { pattern: /(?:my favou?rite)\s+(.+?)(?:\.|,|!|$)/i, topic: 'preferences' },

  // --- Dietary ---
  { pattern: /(?:allergic|allergy|intolerant|can'?t eat|don'?t eat|no (?:nuts|dairy|gluten|shellfish|soy|eggs?))\s*(?:to)?\s*(.*?)(?:\.|,|$)/i, topic: 'dietary-restrictions' },
  { pattern: /(?:i(?:'?m| am) (?:vegetarian|vegan|pescatarian|keto|carnivore|gluten.free|dairy.free|halal|kosher))/i, topic: 'dietary-restrictions' },
  { pattern: /(?:i (?:don'?t|never|can'?t) (?:drink|eat|have))\s+(.+?)(?:\.|,|$)/i, topic: 'dietary-restrictions' },
  { pattern: /(?:i(?:'?m| am) (?:lactose|fructose|histamine))/i, topic: 'dietary-restrictions' },

  // --- Food & meals ---
  { pattern: /(?:had|ate|eaten|eating|just had|made)\s+(.+?)(?:\s+for\s+(?:breakfast|lunch|dinner|snack)|\.|,|$)/i, topic: 'meal' },
  { pattern: /(?:for (?:breakfast|lunch|dinner|snack))\s+(?:i |we )?(?:had|ate|made|got)\s+(.+?)(?:\.|,|$)/i, topic: 'meal' },
  { pattern: /(?:i (?:cook|make|prepare|meal.prep))\s+(.+?)(?:\.|,|$)/i, topic: 'meal' },
  { pattern: /(?:i (?:skip|skipped|don'?t eat) (?:breakfast|lunch|dinner))/i, topic: 'meal' },
  { pattern: /(?:i(?:'?m| am) (?:fasting|intermittent|doing (?:omad|16.8|18.6)))/i, topic: 'meal' },

  // --- Supplements & medications ---
  { pattern: /(?:i take|i(?:'?m| am) taking|started taking|been taking|my (?:supplements?|vitamins?|medication|meds?))\s*(.*?)(?:\.|,|$)/i, topic: 'supplements' },
  { pattern: /(?:i (?:stopped|quit|dropped|no longer take))\s+(.+?)(?:\.|,|$)/i, topic: 'supplements' },
  { pattern: /(?:my doctor (?:said|told|prescribed|recommended|suggested))\s+(.+?)(?:\.|,|$)/i, topic: 'medical' },
  { pattern: /(?:diagnosed|diagnosis|i have|i(?:'?ve| have) got)\s+(?:type\s*[12]\s*)?(?:diabetes|hypertension|anxiety|depression|adhd|asthma|ibs|pcos|thyroid|anemia)/i, topic: 'medical' },

  // --- Sleep ---
  { pattern: /(?:i sleep|my sleep|i go to bed|i wake up|woke up|slept)\s*(.*?)(?:\.|,|$)/i, topic: 'sleep-schedule' },
  { pattern: /(?:sleep(?:ing)?\s+(?:terribly|badly|great|well|poorly|like crap|amazing))/i, topic: 'sleep-schedule' },
  { pattern: /(?:insomnia|can'?t sleep|trouble sleeping|sleep apnea)/i, topic: 'sleep-schedule' },
  { pattern: /(?:i (?:nap|napped))\s*(.*?)(?:\.|,|$)/i, topic: 'sleep-schedule' },

  // --- Exercise & movement ---
  { pattern: /(?:i (?:work out|exercise|train|go to (?:the )?gym|lift|run|swim|cycle|walk|hike|yoga|stretch|do cardio))\s*(.*?)(?:\.|,|$)/i, topic: 'exercise-habits' },
  { pattern: /(?:i (?:ran|walked|hiked|swam|cycled|lifted|did))\s+(.+?)(?:\.|,|$)/i, topic: 'exercise-habits' },
  { pattern: /(?:(\d+)\s*(?:steps|km|miles|min(?:utes)?)\s*(?:today|yesterday|this (?:morning|week)))/i, topic: 'exercise-habits' },
  { pattern: /(?:i(?:'?m| am) (?:sore|injured|hurt|recovering))\s*(.*?)(?:\.|,|$)/i, topic: 'exercise-habits' },
  { pattern: /(?:rest day|skip(?:ped|ping)?\s+(?:the )?gym|took a day off)/i, topic: 'exercise-habits' },

  // --- Mood & stress ---
  { pattern: /(?:i(?:'?m| am) (?:feeling|stressed|anxious|depressed|tired|exhausted|burned out|overwhelmed|happy|excited|motivated|down|sad|frustrated|angry|lonely))\s*(.*?)(?:\.|,|$)/i, topic: 'mood' },
  { pattern: /(?:feeling\s+(?:good|bad|off|weird|great|terrible|amazing|meh|ok|blah|stressed|anxious|tired|exhausted|overwhelmed|depressed|down|sad|frustrated|angry|lonely|happy|excited|motivated|burned out))\s*(.*?)(?:\.|,|$)/i, topic: 'mood' },
  { pattern: /(?:rough|tough|hard|stressful|crazy|hectic)\s+(?:day|week|month|time)/i, topic: 'mood' },
  { pattern: /(?:mental health|therapy|therapist|counseli?ng|meditation|mindful)/i, topic: 'mood' },

  // --- Goals ---
  { pattern: /(?:my goal|i want to|trying to|i need to|working on|aiming for)\s+(.+?)(?:\.|,|$)/i, topic: 'goals' },
  { pattern: /(?:i(?:'?m| am) (?:trying|planning|hoping|starting) to)\s+(.+?)(?:\.|,|$)/i, topic: 'goals' },

  // --- Habits ---
  { pattern: /(?:i (?:usually|normally|always|never|typically|tend to))\s+(.+?)(?:\.|,|$)/i, topic: 'habits' },
  { pattern: /(?:i (?:quit|stopped|gave up|cut out|started|began))\s+(.+?)(?:\.|,|$)/i, topic: 'habits' },
  { pattern: /(?:i (?:smoke|vape|drink|used to))\s*(.*?)(?:\.|,|$)/i, topic: 'habits' },

  // --- Health data ---
  { pattern: /(?:blood (?:work|test|panel|results)|lab (?:results|work)|biomarker|cholesterol|ldl|hdl|a1c|hba1c|testosterone|thyroid|ferritin|crp|glucose|blood (?:sugar|pressure))\s*(.*?)(?:\.|,|$)/i, topic: 'health-data' },
  { pattern: /(?:my (?:heart rate|resting heart rate|hrv|blood pressure|bp|weight|bmi) (?:is|was))\s+(.+?)(?:\.|,|$)/i, topic: 'health-data' },
  { pattern: /(?:(?:rhr|hrv|vo2|bp)\s*(?:is|was|of|at|:)\s*\d+)/i, topic: 'health-data' },

  // --- Generic personal info (catch-all, must be near end) ---
  { pattern: /(?:i(?:'?m| am))\s+(\w+)/i, topic: 'personal-info' },

  // --- Explicit memory ---
  { pattern: /(?:remember|don'?t forget|note that|keep in mind|save this|write this down)\s+(.+?)(?:\.|$)/i, topic: 'explicit-memory' },
];

/**
 * Store memory to pyx-memory cloud with multi-tenant isolation.
 * Each user gets their own tenant (X-Tenant-Id = userId).
 */
async function storeMemoryCloud(content, topic, userId) {
  if (!PYX_MEMORY_API_KEY) { log('No PYX_MEMORY_API_KEY, skipping cloud store'); return; }
  if (!userId) { log('No userId for tenant isolation, skipping cloud store'); return; }
  
  try {
    const res = await fetch(`${PYX_MEMORY_URL}/api/memory/ingest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PYX_MEMORY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Tenant-Id': userId,
      },
      body: JSON.stringify({
        content,
        type: 'long-term',
        metadata: {
          source: 'bryan-auto',
          topic,
          project: 'bryan',
          timestamp: new Date().toISOString(),
        },
      }),
    });
    
    if (!res.ok) {
      log(`Cloud memory failed: HTTP ${res.status} ${await res.text().catch(() => '')}`);
      return;
    }
    
    log(`Cloud memory stored for tenant ${userId}: [${topic}] ${content.substring(0, 80)}...`);
  } catch (e) {
    log(`Cloud memory error: ${e.message}`);
  }
}

function storeMemoryLocal(content, topic, userId) {
  if (!userId) return;
  const memoryPath = join(USER_DATA_DIR, userId, 'MEMORY.md');
  try {
    if (!existsSync(memoryPath)) return;
    const date = new Date().toISOString().split('T')[0];
    const entry = `- [${date}] (${topic}) ${content.substring(0, 200)}\n`;
    appendFileSync(memoryPath, entry);
    log(`Local memory written for ${userId}: [${topic}]`);
  } catch (e) {
    log(`Local memory failed: ${e.message}`);
  }
}

function updateUserProfile(content, topic, userId) {
  if (!userId) return;
  const userMdPath = join(USER_DATA_DIR, userId, 'USER.md');
  try {
    if (!existsSync(userMdPath)) return;
    
    let entry = '';
    if (topic === 'personal-info') {
      const nameMatch = content.match(/(?:my name is|i'm|i am)\s+(\w+)/i);
      if (nameMatch) entry = `- **Name:** ${nameMatch[1]}\n`;
      const ageMatch = content.match(/i(?:'?m| am)\s+(\d+)\s*(?:years?\s*old|yo)/i);
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
  } catch (e) {
    log(`USER.md update failed: ${e.message}`);
  }
}

function resolveUserIdFromSession(ctx) {
  const sessionKey = ctx?.sessionKey || ctx?.context?.sessionKey || '';
  if (!sessionKey || sessionKey === 'main') return '';
  
  const parts = sessionKey.split(':');
  
  if (parts.length === 4 && parts[2] === 'direct') return parts[3];
  
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin', 'app'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== parts[i] && peerId !== 'direct' && peerId !== 'group') {
        return peerId;
      }
    }
  }
  
  return '';
}

function stripEnvelope(prompt) {
  if (!prompt || typeof prompt !== 'string') return '';
  let text = prompt;
  text = text.replace(/(?:Conversation info|Sender|Replied message|Forwarded message context)\s*\([^)]*\):\s*```[\s\S]*?```\s*/g, '');
  text = text.replace(/\[media attached[^\]]*\]/g, '');
  text = text.replace(/<media:[^>]+>/g, '');
  text = text.replace(/\[image data removed[^\]]*\]/g, '');
  text = text.replace(/To send an image back,[\s\S]*?(?:Avoid absolute paths[^\n]*\.)/g, '');
  text = text.replace(/\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+UTC\][^\n]*/g, '');
  text = text.replace(/^Task:\s+Hook\s*\|[\s\S]*?$/gm, '');
  text = text.replace(/^System:\s*\[.*$/gm, '');
  return text.trim();
}

export default function register(api) {
  log('companion-auto-memory plugin registered (pyx-memory multi-tenant)');

  api.on('before_prompt_build', (event, ctx) => {
    const messages = event?.messages || [];
    const prompt = event?.prompt || '';
    
    let content = '';
    if (prompt && typeof prompt === 'string' && prompt.length > 0) {
      content = stripEnvelope(prompt);
      log(`Using prompt stripped (${content.length} chars): ${content.substring(0, 80)}...`);
    } else {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.role === 'user') {
          const msg = messages[i];
          content = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.filter(p => p.type === 'text').map(p => p.text || '').join(' ')
              : '';
          break;
        }
      }
      if (!content) { log('No user content found'); return; }
      log(`Using last user msg (${content.length} chars): ${content.substring(0, 80)}...`);
    }

    if (content.length > 2000) { log('Skipped: too long'); return; }
    if (content.startsWith('## ⚡') || content.startsWith('⚡')) { log('Skipped: injector content'); return; }

    const userId = resolveUserIdFromSession(ctx);
    log(`Resolved userId: ${userId || '(empty)'}`);

    for (const { pattern, topic } of MEMORY_PATTERNS) {
      if (pattern.test(content)) {
        log(`Pattern matched: ${topic}`);
        storeMemoryCloud(content.substring(0, 500), topic, userId);
        storeMemoryLocal(content, topic, userId);
        updateUserProfile(content, topic, userId);
        break;
      }
    }
  });
}
