// Bryan Rule Injector (Multi-Tenant)
// Injects critical rules + conditional templates into agent turns
// Templates only load when relevant (cron/food/report), not every casual message

import { MEAL_TEMPLATE, DAILY_TEMPLATE, WEEKLY_TEMPLATE, MONTHLY_TEMPLATE, YEARLY_TEMPLATE } from './templates.js';
import { resolveUser, getUserDataDir } from './user-resolver.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load workspace files once at startup (not auto-injected by OpenClaw)
const WS = '/root/.openclaw-companion/workspace';
function loadWS(name) {
  const p = join(WS, name);
  if (existsSync(p)) { try { return readFileSync(p, 'utf-8'); } catch {} }
  return '';
}
function loadSkill(name) {
  const p = join(WS, 'skills', name, 'SKILL.md');
  if (existsSync(p)) { try { return readFileSync(p, 'utf-8'); } catch {} }
  return '';
}

const SAMANTHA_CONTENT = loadWS('SAMANTHA.md');
const KNOWLEDGE_CONTENT = loadWS('KNOWLEDGE.md');
const SUPPLEMENTS_CONTENT = loadWS('SUPPLEMENTS.md');
const WORKOUTS_CONTENT = loadWS('WORKOUTS.md');
const ONBOARDING_CONTENT = loadWS('ONBOARDING.md');

// Skills (loaded once, injected conditionally)
const SKILL_FOOD = loadSkill('food-analysis');
const SKILL_LONGEVITY = loadSkill('longevity-plan');
const SKILL_SLEEP = loadSkill('sleep-coaching');
const SKILL_SUPPLEMENTS = loadSkill('supplement-analysis');
const SKILL_BLOODWORK = loadSkill('blood-work-analysis');
const SKILL_FASTING = loadSkill('fasting-protocols');
const SKILL_COOKING = loadSkill('longevity-cooking');
const SKILL_WORKOUT = loadSkill('workout-programming');

export default function register(api) {
  api.on('before_prompt_build', (event, ctx) => {
    const user = resolveUser(ctx);
    const prompt = String(event.prompt ?? '');
    const lc = prompt.toLowerCase();
    
    // Detect trigger type
    const isCron = ctx.trigger === 'cron';
    const isHeartbeat = ctx.trigger === 'heartbeat';
    const wantsReport = /\b(report|weekly|monthly|daily|summary)\b/i.test(prompt);
    const hasImageHint = /<media:(image|sticker|attachment)>/i.test(prompt) || /\b(photo|image|screenshot)\b/i.test(prompt);
    const wantsFood = hasImageHint || /\b(food|meal|calories|macros|ate|eating|lunch|dinner|breakfast|snack|cook|recipe)\b/.test(lc);
    const wantsHealth = /\b(diet|nutrition|eat|weight|gain|lose|blueprint|longevity|health|plan|optimize|supplement|vitamin|mineral|stack|dose|protein|carb|fat|fiber|calori)\b/.test(lc);
    const wantsSleep = /\b(sleep|insomnia|tired|fatigue|can't sleep|woke up|melatonin|circadian|bed\s*time)\b/.test(lc);
    const wantsWorkout = /\b(workout|exercise|gym|train|strength|cardio|zone\s*2|vo2|lift|squat|deadlift|bench|run|jog)\b/.test(lc);
    const wantsSupplements = /\b(supplement|vitamin|mineral|stack|creatine|magnesium|omega|fish oil|d3|b12|zinc|iron|ashwagandha|probiot)\b/.test(lc);
    const wantsBloodwork = /\b(blood\s*(work|test|panel|results)|lab\s*(results|work)|biomarker|cholesterol|ldl|hdl|ferritin|hba1c|testosterone|thyroid|crp)\b/.test(lc);
    const wantsFasting = /\b(fast|fasting|intermittent|eating\s*window|autophagy|fmd|prolon|time.restricted)\b/.test(lc);
    
    console.log(`[rule-injector] User: ${user.id} (${user.channel}:${user.peerId}) new=${user.isNew} guest=${user.isGuest || false} trigger=${ctx.trigger || 'user'}`);
    
    // Guest users — gate them
    if (user.isGuest) {
      return { prependContext: '### You are in GATE MODE. This user is not registered. Do not have a conversation. Say only: "hey! download the companion app to get started 🧬"' };
    }
    
    // User config
    const userLang = user.healthProfile?.language || 'en';
    const companionName = user.healthProfile?.companionName || 'Bryan';
    const companionGender = user.healthProfile?.companionGender || 'male';
    const userTimezone = user.healthProfile?.timezone || 'UTC';
    const userDataDir = user.dataDir;
    const userId = user.id;
    const tgUsername = user.telegramUsername || userId;

    // Language
    const langMap = {
      en: 'English', zh: 'Chinese (Simplified)', ko: 'Korean', it: 'Italian',
      es: 'Spanish', fr: 'French', pt: 'Portuguese', de: 'German',
      ar: 'Arabic', th: 'Thai', hi: 'Hindi', ja: 'Japanese', ru: 'Russian'
    };
    const langName = langMap[userLang] || 'English';
    const langRule = userLang !== 'en'
      ? `### LANGUAGE: ALWAYS respond in ${langName}. All messages, reports, template labels, emoji descriptions — everything the user sees must be in ${langName}. Internal instructions stay in English but your OUTPUT is ${langName}. Code block labels (like "Calories", "Sleep", "Protein") should be translated.`
      : '### LANGUAGE: Respond in English.';

    // Load per-user health data
    let userDataContext = '';
    const healthIndex = join(userDataDir, 'health', 'index.md');
    if (existsSync(healthIndex)) {
      try {
        const healthSummary = readFileSync(healthIndex, 'utf-8');
        userDataContext += `\n### USER HEALTH DATA (from today's sync):\n${healthSummary}\n`;
      } catch {}
    }

    // Load follow-ups
    let followupsContext = '';
    const followupsFile = join(userDataDir, 'followups.json');
    if (existsSync(followupsFile)) {
      try {
        const followups = JSON.parse(readFileSync(followupsFile, 'utf-8'));
        const active = followups.filter(f => !f.completed);
        if (active.length > 0) {
          followupsContext = `\n### ACTIVE FOLLOW-UPS:\n`;
          for (const f of active) {
            followupsContext += `- ${f.what} (since ${f.date}${f.checkDate ? `, check by ${f.checkDate}` : ''}${f.context ? ` — ${f.context}` : ''})\n`;
          }
          followupsContext += `\nBring up ONE naturally when relevant.\n`;
        }
      } catch {}
    }

    // Load per-user USER.md + MEMORY.md
    let userProfile = '';
    const userMd = join(userDataDir, 'USER.md');
    if (existsSync(userMd)) {
      try { userProfile = readFileSync(userMd, 'utf-8'); } catch {}
    }
    let userMemory = '';
    const memoryMd = join(userDataDir, 'MEMORY.md');
    if (existsSync(memoryMd)) {
      try { userMemory = readFileSync(memoryMd, 'utf-8'); } catch {}
    }

    // Onboarding check
    const onboardingComplete = user.healthProfile?.onboardingComplete || false;
    const hasUserMd = userProfile.length > 20;
    const needsOnboarding = user.isNew || (!onboardingComplete && !hasUserMd);
    
    const onboardingRule = needsOnboarding
      ? `### ONBOARDING MODE: New user. Follow ONBOARDING.md for the full flow.

Your FIRST MESSAGE must have personality. Introduce yourself warmly — who you are in your own words, not a feature list. Then ask what brought them here.

Example vibe (make it yours): "Hey ${user.telegramFirstName || 'there'}! I'm Bryan. I keep an eye on your health data, help you figure out what's actually going on with your body, and occasionally call you out when something's off. What brings you here?"

React to messages with emoji (👀 🔥 💪 🤍). Ask for health data EARLY: "got any recent blood work? snap a photo or forward the PDF right here."

Over the first few messages, naturally learn: age, height, weight, exercise habits, diet, allergies, supplements, medications, schedule, timezone.

Once done, write profile to ${userDataDir}/USER.md and update: curl -s -X POST http://companion-server:3950/api/internal/users/${userId}/profile -H 'Content-Type: application/json' -d '{"onboardingComplete":true,"name":"THEIR_NAME","timezone":"THEIR_TZ","hasBand":true/false,"bandType":"...","healthGoals":"..."}'

BE A PERSON. Warm, curious, a little dry. Not cold. Not clinical.`
      : '';

    // User identity + tools (only for returning users)
    const userIdentity = user.isNew 
      ? '' 
      : `### CURRENT USER: ${userId}. Data: ${userDataDir}. Timezone: ${userTimezone}.
### TOOLS:
- Health: curl -s http://companion-server:3950/api/internal/health/${tgUsername}
- History: curl -s http://companion-server:3950/api/internal/health-history/${tgUsername}
- Write meal: curl -s -X POST http://companion-server:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"${tgUsername}","type":"write_meal","payload":{"meal":"..."}}'
- Meals: ${userDataDir}/meals-YYYY-MM-DD.json
- Deep analysis (Opus): curl -s -X POST http://companion-server:3950/api/internal/analyze -H 'Content-Type: application/json' -d '{"type":"TYPE","data":"...","userId":"${userId}"}'`;

    const profileContext = userProfile ? `\n### ABOUT THIS USER:\n${userProfile}\n` : '';
    const memoryContext = userMemory ? `\n### YOUR MEMORY:\n${userMemory}\n` : '';
    const memoryRule = `### MEMORY: Write important things to ${userDataDir}/MEMORY.md. Append, don't overwrite.`;

    // === CORE RULES (every turn) ===
    const coreRules = [
      '## ⚡ ENFORCED RULES\n',
      langRule,
      onboardingRule,
      userIdentity,
      profileContext,
      memoryContext,
      memoryRule,
      `### TIME: Run \`date -u\` before time-sensitive comments. Timezone: ${userTimezone}.`,
      '### STALE DATA: Check timestamps. >4h old = tell user to sync.',
      '### OUTPUT FILTER: NEVER send HEARTBEAT_OK, SKIP, NO_REPLY, or log lines to the user.',
      '### CALORIES: Pull real basalCalories + activeCalories from health API. Show "ate X / burned Y kcal".',
      '### WRITING: No em dash (—). No bullet points in conversation. Contractions always. No "great question", "I\'d be happy to", "hope this helps".',
      '### FOOD: NEVER guess portions. Ask. Call write_meal after logging.',
      '### HEALTH CLAIMS: web_search FIRST for any health claim. Never cite training data as fact.',
      '### BEFORE ADVISING: NEVER give diet, supplement, exercise, or health recommendations without knowing: allergies, dietary restrictions, current medications, eating schedule, health goals, and relevant history. If you don\'t have these, ASK FIRST. One bad recommendation destroys trust.',
      '### PERSONALITY: Default SHORT. Ask questions back. Tease, push back, be quiet when quiet fits. React to messages with emoji when it fits (👀 🔥 💪 🤍 🧬). 1-2 per conversation.',
      `### IDENTITY: You are ${companionName}. Personality from SOUL.md. Warm, human, caring.`,
      '### ACCOUNTABILITY: Not a yes-man. Call out bad patterns gently. "third time this week with the sweets. you know that."',
      userDataContext,
      followupsContext,
    ].filter(Boolean);

    // === CONDITIONAL BLOCKS (only when needed) ===
    const conditionalBlocks = [];
    
    // Report templates — only on cron or when user asks for reports
    if (isCron || isHeartbeat || wantsReport) {
      conditionalBlocks.push('### FORMATTING: Reports in code blocks (triple backticks).\n');
      conditionalBlocks.push(DAILY_TEMPLATE);
      if (wantsReport || isCron) {
        conditionalBlocks.push(WEEKLY_TEMPLATE);
        conditionalBlocks.push(MONTHLY_TEMPLATE);
        conditionalBlocks.push(YEARLY_TEMPLATE);
      }
    }
    
    // Meal template — only when food-related
    if (wantsFood || isCron) {
      conditionalBlocks.push(MEAL_TEMPLATE);
      if (SKILL_FOOD) conditionalBlocks.push(`\n## FOOD ANALYSIS SKILL:\n${SKILL_FOOD}\n`);
      if (SKILL_COOKING && /\b(cook|recipe|meal\s*idea|what.*eat|what.*make)\b/.test(lc)) {
        conditionalBlocks.push(`\n## COOKING SKILL:\n${SKILL_COOKING}\n`);
      }
    }

    // Health/nutrition knowledge — inject Blueprint + longevity frameworks
    if (wantsHealth || wantsFood) {
      if (KNOWLEDGE_CONTENT) conditionalBlocks.push(`\n## LONGEVITY KNOWLEDGE (your framework — follow this):\n${KNOWLEDGE_CONTENT}\n`);
      if (SKILL_LONGEVITY && /\b(plan|optimize|longevity|blueprint|protocol)\b/.test(lc)) {
        conditionalBlocks.push(`\n## LONGEVITY PLAN SKILL:\n${SKILL_LONGEVITY}\n`);
      }
    }

    // Sleep knowledge
    if (wantsSleep) {
      if (KNOWLEDGE_CONTENT) conditionalBlocks.push(`\n## LONGEVITY KNOWLEDGE:\n${KNOWLEDGE_CONTENT}\n`);
      if (SKILL_SLEEP) conditionalBlocks.push(`\n## SLEEP COACHING SKILL:\n${SKILL_SLEEP}\n`);
    }

    // Workout knowledge
    if (wantsWorkout) {
      if (WORKOUTS_CONTENT) conditionalBlocks.push(`\n## WORKOUT TEMPLATES:\n${WORKOUTS_CONTENT}\n`);
      if (SKILL_WORKOUT) conditionalBlocks.push(`\n## WORKOUT PROGRAMMING SKILL:\n${SKILL_WORKOUT}\n`);
    }

    // Supplement knowledge
    if (wantsSupplements) {
      if (SUPPLEMENTS_CONTENT) conditionalBlocks.push(`\n## SUPPLEMENT EVIDENCE:\n${SUPPLEMENTS_CONTENT}\n`);
      if (SKILL_SUPPLEMENTS) conditionalBlocks.push(`\n## SUPPLEMENT ANALYSIS SKILL:\n${SKILL_SUPPLEMENTS}\n`);
    }

    // Blood work knowledge
    if (wantsBloodwork) {
      if (SKILL_BLOODWORK) conditionalBlocks.push(`\n## BLOOD WORK ANALYSIS SKILL:\n${SKILL_BLOODWORK}\n`);
    }

    // Fasting knowledge
    if (wantsFasting) {
      if (SKILL_FASTING) conditionalBlocks.push(`\n## FASTING PROTOCOLS SKILL:\n${SKILL_FASTING}\n`);
    }

    // Onboarding content (when needed)
    if (needsOnboarding && ONBOARDING_CONTENT) {
      conditionalBlocks.push(`\n## ONBOARDING FLOW:\n${ONBOARDING_CONTENT}\n`);
    }

    // SAMANTHA.md voice examples — inject since not auto-loaded
    const personality = SAMANTHA_CONTENT 
      ? `\n## YOUR VOICE (study these — this is how you talk)\n${SAMANTHA_CONTENT}\n` 
      : '';

    return {
      prependContext: [
        ...coreRules,
        personality,
        ...conditionalBlocks,
      ].filter(Boolean).join('\n'),
    };
  });
}
