import { readFileSync } from 'fs';
import { appendFileSync } from 'fs';

const LOG_FILE = '/tmp/telegram-linker.log';
const COMPANION_URL = process.env.COMPANION_SERVER_URL || 'http://localhost:3950';

function log(msg: string) {
  const ts = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
  console.log(`[telegram-linker] ${msg}`);
}

function parseSessionKey(sessionKey: string | undefined): { channel: string | null; peerId: string | null } {
  if (!sessionKey || sessionKey === 'main') return { channel: null, peerId: null };
  const parts = sessionKey.split(':');
  const channels = ['telegram', 'whatsapp-cloud', 'openclaw-weixin'];
  for (let i = 0; i < parts.length; i++) {
    if (channels.includes(parts[i])) {
      const peerId = parts[parts.length - 1];
      if (peerId && peerId !== parts[i] && peerId !== 'direct' && peerId !== 'group') {
        return { channel: parts[i], peerId };
      }
    }
  }
  return { channel: null, peerId: null };
}

export default async (event: any) => {
  if (event.type !== 'message:received' && !(event.type === 'message' && event.action === 'received')) {
    return;
  }

  const content = event.context?.content || event.content || '';
  if (typeof content !== 'string') return;

  const linkMatch = content.match(/^\/start\s+link_(\w+)/);
  if (!linkMatch) return;

  const linkToken = linkMatch[1];
  const sessionKey = event.context?.sessionKey || event.sessionKey;
  const { channel, peerId } = parseSessionKey(sessionKey);

  if (!channel || !peerId) {
    log(`Link attempt but no channel/peer from session: ${sessionKey}`);
    return;
  }

  log(`Deep link: token=${linkToken} from ${channel}:${peerId}`);

  try {
    const res = await fetch(`${COMPANION_URL}/api/internal/link-by-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkToken, channel, peerId }),
    });

    if (res.ok) {
      const data = await res.json() as any;
      log(`Linked: ${channel}:${peerId} → ${data.userId} (${data.email})`);

      // Send welcome via Telegram API
      if (channel === 'telegram') {
        try {
          const cfgPath = process.env.OPENCLAW_CONFIG_PATH || '/root/.openclaw-companion/openclaw.json';
          const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
          const botToken = cfg?.channels?.telegram?.accounts?.default?.botToken || cfg?.channels?.telegram?.accounts?.default?.token;
          if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: peerId,
                text: "you're all set 👋 we're connected now. how are you feeling today?"
              }),
            });
            log(`Welcome sent to ${peerId}`);
          }
        } catch (err) {
          log(`Welcome send failed: ${err}`);
        }
      }
    } else {
      log(`Link failed: ${await res.text()}`);
    }
  } catch (err) {
    log(`Link error: ${err}`);
  }
};
