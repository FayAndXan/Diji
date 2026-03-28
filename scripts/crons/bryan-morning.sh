#!/bin/bash
source /usr/local/bin/bryan-env.sh

# Skip if smart trigger already sent morning message
FIRED=$(check_trigger_fired "morning")
if [ "$FIRED" = "True" ]; then
  echo "[$(date)] [bryan-morning] skipped — trigger already fired today" >> /tmp/bryan-cron.log
  exit 0
fi

BOT_TOKEN="${BOT_TOKEN:?BOT_TOKEN env var required}"
PROMPT=$(cat /usr/local/bin/bryan-prompts/bryan-morning.txt | sed "s|{{TIME}}|$BRYAN_TIME|g; s|{{HEALTH_USER}}|$BRYAN_HEALTH_USER|g")

# Run LLM without --deliver to capture output
RESULT=$(OPENCLAW_CONFIG_PATH=$BRYAN_CONFIG \
OPENCLAW_STATE_DIR=$BRYAN_STATE \
openclaw agent \
  --channel telegram \
  --to $BRYAN_CHAT_ID \
  -m "$PROMPT" 2>/dev/null)

echo "$RESULT" >> /tmp/bryan-cron.log

# Filter internal responses
if echo "$RESULT" | grep -qiE "^HEARTBEAT_OK$|^SKIP$|^NO_REPLY$"; then
  echo "[$(date)] [bryan-morning] filtered: $RESULT" >> /tmp/bryan-cron.log
  exit 0
fi

# Send directly via Telegram API — no second LLM call
curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "{\"chat_id\":$BRYAN_CHAT_ID,\"text\":$(echo "$RESULT" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read().strip()))'),\"parse_mode\":\"Markdown\"}" \
  >> /tmp/bryan-cron.log 2>&1
