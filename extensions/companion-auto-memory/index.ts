import { appendFileSync, existsSync, readFileSync } from 'fs';

const LOG_FILE = '/tmp/companion-auto-memory.log';
const MEMORY_API = process.env.MEMORY_INGEST_URL || 'https://api.supermemory.ai/v3/memories';
const MEMORY_KEY = process.env.MEMORY_API_KEY || '';

function log(msg: string) {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// Patterns that indicate important info to remember
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

// Patterns indicating food/meal discussion
const FOOD_PATTERNS = [
  /(?:i (?:ate|had|eaten)|for (?:breakfast|lunch|dinner|snack))/i,
  /(?:calories|protein|carbs|fat|macro)/i,
  /(?:grams|portions?|serving)/i,
];

async function storeMemory(content: string, topic: string) {
  try {
    const resp = await fetch(MEMORY_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MEMORY_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content,
        type: 'long-term',
        metadata: {
          source: 'bryan-auto',
          topic,
          timestamp: new Date().toISOString()
        }
      })
    });
    log(`Stored to memory-provider: [${topic}] ${content.substring(0, 80)}...`);
  } catch (e: any) {
    log(`Failed to store: ${e.message}`);
  }
}

function checkMealDataWritten(): boolean {
  const today = new Date().toISOString().split('T')[0];
  const dataDir = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data';
  const path = `${dataDir}/meals-${today}.json`;
  return existsSync(path);
}

export default function autoMemory(api: any) {
  log('companion-auto-memory plugin registered');

  api.on('before_prompt_build', ({ prompt, messages }: any) => {
    if (!messages || messages.length === 0) return;

    // Only check the very last message. If it's not a user message,
    // this is a heartbeat/cron/system turn — don't trigger.
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return;
    const lastUserMsg = last;

    const content = typeof lastUserMsg.content === 'string'
      ? lastUserMsg.content
      : JSON.stringify(lastUserMsg.content);

    // Skip system/injected content — don't store rule injector output as memories
    if (content.includes('ENFORCED') || content.includes('before_prompt_build') || 
        content.includes('[rule-injector]') || content.includes('⚡') ||
        content.length > 2000) return;

    // Check for important info to store in memory-provider
    for (const { pattern, topic } of MEMORY_PATTERNS) {
      if (pattern.test(content)) {
        // Store asynchronously — don't block the response
        storeMemory(content.substring(0, 500), topic);
        break; // Only store once per message
      }
    }

    // Check if food was discussed but data might not be saved
    const foodDiscussed = FOOD_PATTERNS.some(p => p.test(content));
    const recentAssistantMsgs = messages.slice(-4).filter((m: any) => m.role === 'assistant');
    const assistantDiscussedFood = recentAssistantMsgs.some((m: any) => {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return FOOD_PATTERNS.some(p => p.test(c));
    });

    if (foodDiscussed || assistantDiscussedFood) {
      if (!checkMealDataWritten()) {
        // Remind Bryan to write the data
        const reminder = '\n\n[AUTO-MEMORY REMINDER] Food was discussed in this conversation but no meal data file exists for today. After your response, WRITE to data/meals-YYYY-MM-DD.json. Do not forget.\n';
        log('Food discussed but no meal file — injecting reminder');
        return { prompt: prompt + reminder };
      }
    }

    // Inject memory-provider search results for context
    // Only on first message of a session (messages length < 4)
    if (messages.length <= 3) {
      const searchUrl = process.env.MEMORY_SEARCH_URL || 'https://api.supermemory.ai/v3/search';
      const memoryKey = process.env.MEMORY_API_KEY || process.env.SUPERMEMORY_API_KEY || '';
      const searchPrompt = `\n\n[AUTO-MEMORY] This is an early message in the session. Consider searching memory-provider for relevant context about this user: curl -s "${searchUrl}?q=user+preferences&limit=5" -H "Authorization: Bearer ${memoryKey}"\n`;
      log('Early session — suggesting memory-provider search');
      return { prompt: prompt + searchPrompt };
    }
  });
}
