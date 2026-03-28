// Companion Schedule Learner Plugin
// Logs user message timestamps, calculates patterns, injects schedule context

import { appendFileSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-schedule-learner.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data';
const SCHEDULE_FILE = join(DATA_DIR, 'schedule-timestamps.json');
// Timezone offset resolved per-user from rule injector context
// Fallback to UTC if not available
const TIMEZONE_OFFSET = parseInt(process.env.USER_TZ_OFFSET || '0');

interface TimestampEntry {
  ts: string; // ISO timestamp
  hour: number; // local hour (0-23)
  dayOfWeek: number; // 0=Sunday
  hasFoodContext: boolean;
}

interface SchedulePatterns {
  usualWakeHour: number;
  usualSleepHour: number;
  mealHours: number[];
  activeHours: number[];
  quietHours: number[];
  totalMessages: number;
  lastUpdated: string;
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadTimestamps(): TimestampEntry[] {
  try {
    if (existsSync(SCHEDULE_FILE)) {
      return JSON.parse(readFileSync(SCHEDULE_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

function saveTimestamps(entries: TimestampEntry[]) {
  ensureDataDir();
  // Keep last 200 entries to avoid unbounded growth
  const trimmed = entries.slice(-200);
  writeFileSync(SCHEDULE_FILE, JSON.stringify(trimmed, null, 2));
}

function getLocalHour(date: Date): number {
  const utcHour = date.getUTCHours();
  return (utcHour + TIMEZONE_OFFSET) % 24;
}

function hasFoodContext(text: string): boolean {
  return /food|meal|ate|eat|breakfast|lunch|dinner|snack|hungry|cook/i.test(text);
}

function calculatePatterns(entries: TimestampEntry[]): SchedulePatterns | null {
  if (entries.length < 7) return null;

  // Count messages per hour
  const hourCounts: number[] = new Array(24).fill(0);
  const foodHourCounts: number[] = new Array(24).fill(0);

  for (const entry of entries) {
    hourCounts[entry.hour]++;
    if (entry.hasFoodContext) foodHourCounts[entry.hour]++;
  }

  // Find active hours (hours with messages)
  const activeHours: number[] = [];
  const totalMsgs = entries.length;
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] >= Math.max(1, totalMsgs * 0.03)) {
      activeHours.push(h);
    }
  }

  // Wake hour: earliest active hour (5am-12pm range)
  let usualWakeHour = 8; // default
  for (let h = 5; h <= 12; h++) {
    if (hourCounts[h] >= 2) {
      usualWakeHour = h;
      break;
    }
  }

  // Sleep hour: latest active hour (8pm-3am range)
  let usualSleepHour = 23; // default
  for (let h = 3; h >= 0; h--) {
    if (hourCounts[h] >= 2) {
      usualSleepHour = h === 0 ? 24 : h;
      break;
    }
  }
  if (usualSleepHour === 23) {
    for (let h = 23; h >= 20; h--) {
      if (hourCounts[h] >= 2) {
        usualSleepHour = h;
        break;
      }
    }
  }

  // Meal hours: hours with food context
  const mealHours: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (foodHourCounts[h] >= 2) {
      mealHours.push(h);
    }
  }

  // Quiet hours: hours with zero activity
  const quietHours: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (hourCounts[h] === 0) quietHours.push(h);
  }

  return {
    usualWakeHour,
    usualSleepHour,
    mealHours,
    activeHours,
    quietHours,
    totalMessages: entries.length,
    lastUpdated: new Date().toISOString(),
  };
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return "midnight";
  if (h === 12) return "noon";
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function getLastUserMessage(event: any): { text: string; timestamp: string } | null {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return null;

  // Only check the very last message. If it's not a user message,
  // this is a heartbeat/cron/system turn — don't trigger.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return null;
  let text = '';
  if (typeof last.content === 'string') text = last.content;
  else if (Array.isArray(last.content)) {
    text = last.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
  }
  const timestamp = last.timestamp || last.ts || new Date().toISOString();
  return { text, timestamp };
}

export default function register(api: any) {
  debugLog("companion-schedule-learner plugin registered");

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      const userMsg = getLastUserMessage(event);
      if (!userMsg) return;

      // Log this timestamp
      const now = new Date();
      const localHour = getLocalHour(now);

      const entries = loadTimestamps();
      entries.push({
        ts: now.toISOString(),
        hour: localHour,
        dayOfWeek: now.getDay(),
        hasFoodContext: hasFoodContext(userMsg.text),
      });
      saveTimestamps(entries);

      debugLog(`Logged timestamp: hour=${localHour}, total=${entries.length}`);

      // Calculate patterns if we have enough data
      const patterns = calculatePatterns(entries);
      if (!patterns) {
        debugLog(`Only ${entries.length} messages, need 7+ for patterns`);
        return;
      }

      // Build schedule context
      const parts: string[] = [];
      parts.push(`User's schedule patterns (based on ${patterns.totalMessages} messages):`);
      parts.push(`- Usually active from around ${formatHour(patterns.usualWakeHour)} to ${formatHour(patterns.usualSleepHour)}`);

      if (patterns.mealHours.length > 0) {
        parts.push(`- Food-related messages usually around: ${patterns.mealHours.map(formatHour).join(', ')}`);
      }

      if (patterns.activeHours.length > 0) {
        parts.push(`- Most active hours: ${patterns.activeHours.map(formatHour).join(', ')}`);
      }

      // Current context
      parts.push(`- Current local time: ${formatHour(localHour)} (${localHour}:${String(now.getMinutes()).padStart(2, '0')})`);

      // Contextual hints
      if (localHour >= 21 || localHour <= 5) {
        parts.push(`- It's late. If they're usually asleep by ${formatHour(patterns.usualSleepHour)}, they might be up late tonight.`);
      }
      if (localHour >= 11 && localHour <= 14 && patterns.mealHours.some(h => h >= 11 && h <= 14)) {
        parts.push(`- Around their usual lunch time.`);
      }
      if (localHour >= 17 && localHour <= 20 && patterns.mealHours.some(h => h >= 17 && h <= 20)) {
        parts.push(`- Around their usual dinner time.`);
      }

      const injection = `
[SCHEDULE CONTEXT — learned by companion-schedule-learner]
${parts.join('\n')}
Use this to time your check-ins naturally and understand their routine. Don't mention "I tracked your patterns" — just use the info.
`;

      return { appendSystemContext: injection };

    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
