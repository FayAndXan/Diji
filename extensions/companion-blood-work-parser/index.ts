// Companion Blood Work Parser Plugin
// Detects blood work images/PDFs and flags for Bryan to process

import { appendFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-blood-work-parser.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// Blood work keywords
const BLOOD_WORK_KEYWORDS = [
  /blood\s*(work|test|panel|results?)/i,
  /lab\s*(results?|report|work|panel)/i,
  /CBC|CMP|BMP|lipid\s*panel/i,
  /biomarker/i,
  /cholesterol|triglycerid|hdl\b|ldl\b/i,
  /hba1c|a1c\b|hemoglobin/i,
  /ferritin|transferrin/i,
  /creatinine|egfr|bun\b/i,
  /thyroid|tsh\b|t3\b|t4\b/i,
  /testosterone|dhea|cortisol/i,
  /vitamin\s*d\s*(level|test|result)|25-oh/i,
  /alt\b|ast\b|ggt\b|bilirubin/i,
  /hscrp|crp\b|esr\b/i,
  /wbc\b|rbc\b|platelet/i,
  /test\s*results?\s*(came|are|back)/i,
  /got\s*my\s*(results?|blood|labs?)/i,
  /here('s| are| is)\s*my\s*(results?|blood|labs?)/i,
];

// PDF/image detection
function hasAttachment(event: any): { hasImage: boolean; hasPdf: boolean } {
  let hasImage = false;
  let hasPdf = false;

  const lastMsg = getLastMessage(event);
  if (!lastMsg) return { hasImage, hasPdf };

  const content = lastMsg.content;

  // Check array content for image parts
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part.type === 'image' || part.type === 'image_url') hasImage = true;
    }
  }

  // Check string content for file references
  const textContent = typeof content === 'string' ? content :
    Array.isArray(content) ? content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ') : '';

  if (textContent.includes('.pdf') || textContent.includes('PDF')) hasPdf = true;
  if (textContent.includes('.jpg') || textContent.includes('.png') || textContent.includes('.jpeg')) hasImage = true;

  // Event-level indicators
  if (event?.images?.length > 0) hasImage = true;
  if (event?.context?.hasImage) hasImage = true;
  if (event?.context?.mediaType === 'photo') hasImage = true;
  if (event?.context?.attachments?.length > 0) {
    for (const a of event.context.attachments) {
      if (a.mimeType?.includes('pdf') || a.name?.endsWith('.pdf')) hasPdf = true;
      if (a.mimeType?.includes('image')) hasImage = true;
    }
  }

  return { hasImage, hasPdf };
}

function getLastMessage(event: any): any {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return null;
  // Only check the very last message. If it's not a user message,
  // this is a heartbeat/cron/system turn — don't trigger.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return null;
  return last;
}

function getMessageText(event: any): string {
  const msg = getLastMessage(event);
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
  }
  return '';
}

function getPreviousBloodWork(): string {
  const DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data';
  try {
    // Find most recent bloodwork file
    const fs = require('fs');
    const files = fs.readdirSync(DATA_DIR).filter((f: string) => f.startsWith('bloodwork-'));
    if (files.length === 0) return 'No previous blood work on file.';

    files.sort();
    const latest = files[files.length - 1];
    const date = latest.replace('bloodwork-', '').replace('.json', '');
    return `Previous blood work on file: ${date} (${latest}). Compare new results against this.`;
  } catch {
    return 'No previous blood work on file.';
  }
}

export default function register(api: any) {
  debugLog("companion-blood-work-parser plugin registered");

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      const text = getMessageText(event);
      const { hasImage, hasPdf } = hasAttachment(event);

      // Check if this might be blood work
      let isBloodWork = false;
      let reason = '';

      // Text mentions blood work keywords
      for (const pattern of BLOOD_WORK_KEYWORDS) {
        if (pattern.test(text)) {
          isBloodWork = true;
          reason = `keyword match: ${pattern}`;
          break;
        }
      }

      // PDF attachment + health context = likely blood work
      if (hasPdf && !isBloodWork) {
        // PDFs in a health companion context are very likely blood work or medical reports
        isBloodWork = true;
        reason = 'PDF attachment in health context';
      }

      // Image + blood work keywords = definitely blood work
      if (hasImage && isBloodWork) {
        reason = 'image + blood work keywords';
      }

      // Image + no other context but looks medical
      if (hasImage && !isBloodWork) {
        const medicalImageHints = /result|test|lab|panel|report|marker|level|range|reference/i;
        if (medicalImageHints.test(text)) {
          isBloodWork = true;
          reason = 'image + medical context hints';
        }
      }

      if (!isBloodWork) return;

      debugLog(`Blood work detected: ${reason}`);

      const prevBloodWork = getPreviousBloodWork();

      const injection = `
[BLOOD WORK DETECTED — companion-blood-work-parser]
This message likely contains blood work or lab results. ${hasPdf ? '(PDF attachment detected)' : ''} ${hasImage ? '(Image detected)' : ''}

MANDATORY PROCESS:
1. If image: carefully read ALL values from the image. If anything is unclear, ask.
2. If PDF: use the pdf tool to extract all biomarker values.
3. Once you have the values, IMMEDIATELY send them to the Opus analysis endpoint:
   curl -s -X POST http://companion-server:3950/api/internal/analyze -H 'Content-Type: application/json' -d '{"type":"blood-work","data":"JSON of all extracted markers with values and units","context":"user profile, age, goals, medications","userId":"USER_ID"}'
4. DO NOT analyze the blood work yourself. Opus does the deep analysis. You extract values and present results.
5. Take Opus's analysis and present it in YOUR voice — casual, warm, specific. Not a clinical report.
6. Flag anything that needs a doctor: "talk to your doctor about [specific concern]"
7. Store results in data/bloodwork-YYYY-MM-DD.json.

${prevBloodWork}
`;

      return { appendSystemContext: injection };

    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
