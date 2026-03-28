// Companion Mood Detector Plugin
// Analyzes emotional tone of user's message and injects mood context

import { appendFileSync } from "fs";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-mood-detector.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

type Mood = 'stressed' | 'happy' | 'sad' | 'angry' | 'neutral' | 'tired' | 'anxious' | 'frustrated' | 'excited';

interface MoodSignal {
  mood: Mood;
  patterns: RegExp[];
  weight: number;
}

const MOOD_SIGNALS: MoodSignal[] = [
  {
    mood: 'stressed',
    patterns: [
      /stress(ed|ful|ing)?/i, /overwhelm(ed|ing)?/i, /too much/i, /can't cope/i,
      /deadline/i, /swamp(ed)?/i, /crazy (day|week)/i, /insane (day|week)/i,
      /so much (to do|going on)/i, /losing (it|my mind)/i, /burn(ed)?\s*out/i,
      /no time/i, /behind on/i, /pressure/i,
    ],
    weight: 3,
  },
  {
    mood: 'happy',
    patterns: [
      /happy/i, /great/i, /amazing/i, /awesome/i, /love(d)?\s+(it|this|that)/i,
      /so good/i, /excited/i, /stoked/i, /pumped/i, /feeling good/i,
      /best (day|week|thing)/i, /finally/i, /nailed it/i, /let's go/i,
      /😊|😁|🎉|❤️|🥳|💪|🔥|😄/,
    ],
    weight: 2,
  },
  {
    mood: 'sad',
    patterns: [
      /sad/i, /down/i, /depress(ed|ing)?/i, /miss(ing)?\s/i, /lonely/i,
      /sucks/i, /shit(ty)?/i, /hate (this|it|my)/i, /worst/i, /crying/i,
      /feel(ing)?\s+like\s+crap/i, /not (ok|okay|great|good)/i, /rough/i,
      /😢|😭|💔|😞|😔/,
    ],
    weight: 3,
  },
  {
    mood: 'angry',
    patterns: [
      /angry/i, /furious/i, /pissed/i, /mad\b/i, /rag(e|ing)/i,
      /wtf/i, /fuck(ing)?/i, /bullshit/i, /unbelievable/i, /ridiculous/i,
      /can't believe/i, /so sick of/i, /fed up/i, /done with/i,
      /😡|🤬|💢/,
    ],
    weight: 3,
  },
  {
    mood: 'tired',
    patterns: [
      /tired/i, /exhausted/i, /drained/i, /no energy/i, /fatigue/i,
      /wiped/i, /dead\b/i, /zombie/i, /barely (awake|functioning)/i,
      /didn't sleep/i, /slept (bad|badly|terrible|like shit|poorly)/i,
      /can't (wake up|keep my eyes)/i, /sleepy/i, /sluggish/i, /groggy/i,
      /😴|🥱|😩/,
    ],
    weight: 2,
  },
  {
    mood: 'anxious',
    patterns: [
      /anxious/i, /anxiety/i, /worried/i, /nervous/i, /panic/i,
      /can't stop thinking/i, /what if/i, /scared/i, /dread/i,
      /uneasy/i, /on edge/i, /restless/i,
      /😰|😨|😧/,
    ],
    weight: 3,
  },
  {
    mood: 'frustrated',
    patterns: [
      /frustrat(ed|ing)/i, /ugh/i, /ffs/i, /annoying/i, /annoyed/i,
      /stuck/i, /not working/i, /keeps (breaking|failing)/i, /why (won't|can't|doesn't)/i,
      /tried everything/i, /give up/i, /nothing works/i,
      /😤|🙄/,
    ],
    weight: 2,
  },
  {
    mood: 'excited',
    patterns: [
      /excit(ed|ing)/i, /can't wait/i, /hyped/i, /omg/i, /guess what/i,
      /you won't believe/i, /just (got|happened|found)/i, /big news/i,
      /🤩|🙌|🚀/,
    ],
    weight: 2,
  },
];

// Intensity modifiers
const INTENSIFIERS = [
  /really/i, /so\s/i, /very/i, /extremely/i, /super/i,
  /incredibly/i, /absolutely/i, /completely/i, /totally/i,
];

const DIMINISHERS = [
  /a (little|bit)/i, /kind of/i, /sort of/i, /slightly/i, /somewhat/i,
  /not (really|that)/i,
];

function detectMood(text: string): { mood: Mood; confidence: number; intensity: 'low' | 'medium' | 'high' } {
  const scores: Record<Mood, number> = {
    stressed: 0, happy: 0, sad: 0, angry: 0, neutral: 0,
    tired: 0, anxious: 0, frustrated: 0, excited: 0,
  };

  for (const signal of MOOD_SIGNALS) {
    for (const pattern of signal.patterns) {
      if (pattern.test(text)) {
        scores[signal.mood] += signal.weight;
      }
    }
  }

  // Check intensity
  let intensityMod = 0;
  for (const p of INTENSIFIERS) {
    if (p.test(text)) intensityMod++;
  }
  for (const p of DIMINISHERS) {
    if (p.test(text)) intensityMod--;
  }

  // Find highest scoring mood
  let topMood: Mood = 'neutral';
  let topScore = 0;
  for (const [mood, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topMood = mood as Mood;
    }
  }

  // Short messages with no signals = neutral
  if (topScore === 0) {
    return { mood: 'neutral', confidence: 0.3, intensity: 'low' };
  }

  const confidence = Math.min(topScore / 6, 1.0);
  const intensity = intensityMod >= 2 ? 'high' : intensityMod >= 0 && topScore >= 4 ? 'high' : topScore >= 2 ? 'medium' : 'low';

  return { mood: topMood, confidence, intensity };
}

// Approach guidance for each mood
const MOOD_GUIDANCE: Record<Mood, string> = {
  stressed: "User seems stressed. Be calm, don't add to their plate. Offer practical help or just be present. Don't push health data unless they ask.",
  happy: "User seems in a good mood. Match their energy. This is a great time for positive reinforcement on health wins.",
  sad: "User seems down. Be gentle, don't try to fix it immediately. Acknowledge how they feel. Don't push health tracking right now unless they bring it up.",
  angry: "User seems angry/frustrated. Don't be overly cheerful. Validate their frustration. Be direct and concise. Save health nudges for later.",
  neutral: "",
  tired: "User seems tired/exhausted. Be empathetic about their energy. If they mention sleep issues, this is a natural moment to gently offer sleep coaching. Don't overload them with info.",
  anxious: "User seems anxious. Be grounding and steady. Don't amplify worry. Practical, calming presence. If relevant, breathing exercises or simple actions can help.",
  frustrated: "User seems frustrated. Validate it. Don't be dismissive. If they're frustrated with health progress, be honest but encouraging.",
  excited: "User is excited about something. Share in the excitement. Don't dampen it with health warnings unless it's truly important.",
};

function getLastUserMessage(event: any): string {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return '';

  // Only check the very last message. If it's not a user message,
  // this is a heartbeat/cron/system turn — don't trigger.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
  }
  return '';
}

export default function register(api: any) {
  debugLog("companion-mood-detector plugin registered");

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      const text = getLastUserMessage(event);
      if (!text || text.length < 3) return;

      const result = detectMood(text);
      debugLog(`Mood: ${result.mood} (confidence: ${result.confidence}, intensity: ${result.intensity})`);

      // Only inject if we have a non-neutral mood with decent confidence
      if (result.mood === 'neutral' || result.confidence < 0.3) return;

      const guidance = MOOD_GUIDANCE[result.mood];
      if (!guidance) return;

      const injection = `
[MOOD CONTEXT — detected by companion-mood-detector]
User's emotional tone: ${result.mood} (intensity: ${result.intensity})
${guidance}
Remember: this is algorithmic detection, not certain. Use it as a signal, not a label. Don't mention "I detected your mood" — just adjust naturally.
`;

      return { appendSystemContext: injection };

    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
