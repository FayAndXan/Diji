import { appendFileSync } from 'fs';

const LOG_FILE = '/tmp/companion-search-enforcer.log';

function log(msg: string) {
  try {
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const HEALTH_KEYWORDS = [
  /supplement/i, /vitamin/i, /mineral/i, /dose|dosage/i, /mg\b|mcg\b|iu\b/i,
  /magnesium/i, /zinc/i, /iron/i, /calcium/i, /omega/i, /creatine/i,
  /ashwagandha/i, /melatonin/i, /probiot/i, /collagen/i,
  /blood\s*(work|test|panel)/i, /ferritin/i, /cholesterol/i, /ldl|hdl/i,
  /triglyceride/i, /glucose/i, /hba1c/i, /creatinine/i, /testosterone/i,
  /cortisol/i, /thyroid/i, /inflammation/i, /crp\b/i, /igf/i,
  /protocol/i, /recommend/i, /should\s*(i|you)\s*take/i,
  /interact/i, /side\s*effect/i, /contraindic/i,
  /fasting/i, /intermittent/i, /caloric/i, /ketogenic|keto\b/i,
  /longevity/i, /anti.?aging/i, /blueprint/i,
  /vo2\s*max/i, /zone\s*2/i, /progressive\s*overload/i,
  /periodiz/i, /deload/i,
  // Food recommendation triggers
  /what.*(?:eat|food|meal|snack|cook|recipe|ingredient)/i,
  /suggest.*(?:food|meal|eat|recipe|snack)/i,
  /good.*(?:for|source|food)/i,
  /(?:high|rich).*(?:in|protein|iron|fiber|calcium)/i,
  /(?:eat|avoid|try).*(?:for|to|if)/i,
  /(?:best|worst|healthy|unhealthy).*(?:food|diet|meal)/i,
  /seitan|tempeh|tofu|quinoa|spirulina|chlorella/i,
  /gut.*(?:health|permeab|leak)/i,
  /(?:food|diet).*(?:help|lower|reduce|increase|boost)/i,
];

export default function searchEnforcer(api: any) {
  log('companion-search-enforcer plugin registered');

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

    const matchedKeywords = HEALTH_KEYWORDS.filter(kw => kw.test(content));
    
    if (matchedKeywords.length > 0) {
      log(`Health keywords detected: ${matchedKeywords.length} matches`);

      const recentMessages = messages.slice(-6);
      const usedSearch = recentMessages.some((m: any) => {
        if (m.role !== 'assistant') return false;
        const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return c.includes('localhost:3900') || c.includes('172.17.0.1:3900') || 
               c.includes('web_search') || 
               c.includes('web_fetch') || 
               c.includes('browse.js') ||
               c.includes('spectrawl');
      });

      if (!usedSearch) {
        const enforcement = `\n\n[SEARCH ENFORCEMENT — MANDATORY — SYSTEM LEVEL]
⛔ HEALTH/FOOD CONTENT DETECTED. THIS IS A HARD BLOCK, NOT A SUGGESTION.

YOUR FIRST ACTION must be a web_search call. Before you type ANY food name, supplement name, health claim, or recommendation:

web_search({ query: "<relevant health search>" })

DO NOT:
- List foods from memory
- Suggest supplements from training data
- State ANY health fact without a search backing it
- Say "foods high in X include..." without searching first

If you skip the search and answer from training data, you are WRONG. Training data is outdated and potentially dangerous for health advice. The user's health depends on accurate, verified information.

SEARCH FIRST. THEN ANSWER. NO EXCEPTIONS. NOT EVEN "COMMON KNOWLEDGE."
`;
        
        log('Injecting search enforcement (HARD BLOCK)');
        return { appendSystemContext: enforcement };
      } else {
        log('Search already used — no enforcement needed');
      }
    }
  });
}
