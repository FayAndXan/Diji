// Companion Model Router
// Sonnet default, Opus for complex/medical, Haiku for simple check-ins
// Uses before_model_resolve hook (runs before session load)

import { appendFileSync } from "fs";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-router.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// Keywords/patterns that trigger Opus (medical, complex, high-stakes)
const OPUS_PATTERNS = [
  // Blood work / biomarkers
  /blood\s*(work|test|panel|results)/i,
  /lab\s*(results|work|report)/i,
  /biomarker/i,
  /cholesterol|triglycerid|hdl|ldl|apob/i,
  /hba1c|a1c|glucose.*fasting/i,
  /testosterone|thyroid|cortisol|dhea/i,
  /creatinine|egfr|alt\b|ast\b/i,
  /ferritin|hemoglobin|hematocrit/i,
  /hscrp|crp|inflammation.*marker/i,
  /vitamin\s*d.*level|b12.*level/i,
  
  // Medical / drug interactions
  /interact(ion|s).*with/i,
  /side\s*effect/i,
  /contraindicat/i,
  /medication.*and.*(supplement|vitamin)/i,
  /drug.*interact/i,
  /prescri(bed|ption)/i,
  /metformin|statin|blood\s*thinner|warfarin|thyroid\s*med/i,
  
  // Serious health concerns
  /diagnos(is|ed|e)/i,
  /symptom(s)?\s*(of|like|include)/i,
  /cancer|tumor|oncolog/i,
  /heart\s*(attack|disease|failure)/i,
  /diabetes|insulin\s*resistan/i,
  /autoimmune/i,
  
  // Complex supplement questions
  /should\s*i\s*(take|start|stop|add|stack)/i,
  /supplement.*protocol/i,
  /stack.*recommend/i,
  /optimal.*dose|dosage.*for/i,
  
  // Weekly report
  /weekly\s*report/i,
  /state\s*of\s*you/i,
  /week\s*in\s*review/i,
  
  // /start removed — handled by Sonnet, not Opus
  
  // Complex analysis requests
  /analyz|analysis|interpret|explain.*results/i,
  /what\s*does.*mean.*health/i,
  /biological\s*age/i,
  /longevity.*plan|health.*plan|optimization.*plan/i,
];

// Heartbeats and crons now run on Sonnet — Haiku leaks reasoning into messages.
// No more CRON_PATTERNS routing to Haiku.

function getLastUserMessage(event: any): string {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return '';
  
  // Only check the very last message. If it's not a user message,
  // this is a heartbeat/cron/system turn — don't trigger.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return '';
  if (typeof last.content === 'string') return last.content;
  if (Array.isArray(last.content)) {
    return last.content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text || '')
      .join(' ');
  }
  return '';
}

function getPromptText(event: any): string {
  if (typeof event?.prompt === 'string') return event.prompt;
  return '';
}

function hasAttachment(event: any): boolean {
  // PDFs, images of blood work, etc.
  const prompt = getPromptText(event);
  if (prompt.includes('.pdf') || prompt.includes('PDF')) return true;
  if (event?.context?.attachments?.length > 0) {
    const atts = event.context.attachments;
    for (const a of atts) {
      if (a.mimeType?.includes('pdf') || a.name?.includes('.pdf')) return true;
    }
  }
  return false;
}

// Track recent Opus usage for sticky context
let lastOpusTime = 0;
const OPUS_STICKY_MS = 5 * 60 * 1000; // Stay on Opus for 5 min after last trigger

function checkRecentMessagesForOpus(event: any): boolean {
  // Check last 5 messages for health keywords
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return false;
  
  const recent = messages.slice(-6);
  for (const msg of recent) {
    let text = '';
    if (typeof msg.content === 'string') text = msg.content;
    else if (Array.isArray(msg.content)) {
      text = msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
    }
    for (const pat of OPUS_PATTERNS) {
      if (pat.test(text)) return true;
    }
  }
  return false;
}

function selectModel(event: any): { model: string; reason: string } {
  const text = getLastUserMessage(event) || getPromptText(event);
  const combined = text.trim();
  
  if (!combined) {
    return { model: 'anthropic/claude-sonnet-4-6', reason: 'empty/default' };
  }

  // Cron/heartbeat prompts stay on Sonnet — never route to Opus
  const isCronOrHeartbeat = /heartbeat|HEARTBEAT|daily report|morning check|lunch check|evening check|weekly report|monthly report|state of you|30 day review|Silent internal check/i.test(combined);
  if (isCronOrHeartbeat) {
    return { model: 'anthropic/claude-sonnet-4-6', reason: 'cron/heartbeat — forced sonnet' };
  }

  // Check for PDF attachment — always Opus (likely blood work)
  if (hasAttachment(event)) {
    lastOpusTime = Date.now();
    return { model: 'anthropic/claude-opus-4-6', reason: 'pdf-attachment' };
  }

  // Check current message for Opus triggers
  for (const pat of OPUS_PATTERNS) {
    if (pat.test(combined)) {
      lastOpusTime = Date.now();
      return { model: 'anthropic/claude-opus-4-6', reason: `opus: ${pat}` };
    }
  }

  // Sticky: if Opus was triggered recently, check if conversation is still health-focused
  if (Date.now() - lastOpusTime < OPUS_STICKY_MS) {
    if (checkRecentMessagesForOpus(event)) {
      return { model: 'anthropic/claude-opus-4-6', reason: 'opus-sticky (recent health context)' };
    }
  }

  // Default: GPT-5.4 mini (cheaper, good personality)
  return { model: 'anthropic/claude-sonnet-4-6', reason: 'default' };
}

export default function register(api: any) {
  debugLog("companion-model-router plugin registered");
  
  // Use before_agent_start (legacy but supports both messages + modelOverride).
  // Only override model on first message of a session. Once a session has a model
  // locked, don't try to change it — the gateway rejects mid-session switches
  // and enters an infinite retry loop.
  api.on("before_agent_start", (event: any, ctx: any) => {
    try {
      // Skip if session already has messages (model is locked)
      const messages = event?.messages;
      if (messages && Array.isArray(messages) && messages.length > 1) {
        // Session already running — don't override
        debugLog('Session active, skipping model override');
        return;
      }

      const { model, reason } = selectModel(event);
      debugLog(`Routing to ${model} (${reason})`);
      const modelName = model.includes('/') ? model.split('/').pop() : model;
      return { modelOverride: modelName };
    } catch (err) {
      debugLog(`Error: ${err}`);
      // Fall through to default
    }
  });
}
