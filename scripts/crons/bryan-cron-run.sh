#!/bin/bash
# Wrapper for Bryan cron jobs — filters HEARTBEAT_OK and other internal responses
source /usr/local/bin/bryan-env.sh

PROMPT_FILE="$1"
if [ -z "$PROMPT_FILE" ] || [ ! -f "$PROMPT_FILE" ]; then
  echo "[$(date)] ERROR: prompt file not found: $PROMPT_FILE" >> /tmp/bryan-cron.log
  exit 1
fi

PROMPT=$(cat "$PROMPT_FILE" | sed "s|{{TIME}}|$BRYAN_TIME|g; s|{{HEALTH_USER}}|$BRYAN_HEALTH_USER|g")

# Add explicit instruction to never respond with HEARTBEAT_OK
PROMPT="$PROMPT

CRITICAL: You MUST generate a message for the user. Do NOT respond with HEARTBEAT_OK, SKIP, or any internal-only response. Always write something to send."

OUTPUT=$(OPENCLAW_CONFIG_PATH=$BRYAN_CONFIG \
OPENCLAW_STATE_DIR=$BRYAN_STATE \
openclaw agent \
  --channel telegram \
  --to $BRYAN_CHAT_ID \
  -m "$PROMPT" 2>&1)

echo "$OUTPUT" >> /tmp/bryan-cron.log

# Filter — only deliver if it's not HEARTBEAT_OK or similar internal garbage
CLEAN=$(echo "$OUTPUT" | grep -v "HEARTBEAT_OK\|^SKIP$\|^\[plugins\]\|^\[agent\]\|^$" | tail -1)

if [ -n "$CLEAN" ] && [ "$CLEAN" != "HEARTBEAT_OK" ]; then
  # Deliver the message via Telegram
  OPENCLAW_CONFIG_PATH=$BRYAN_CONFIG \
  OPENCLAW_STATE_DIR=$BRYAN_STATE \
  openclaw agent \
    --channel telegram \
    --to $BRYAN_CHAT_ID \
    --deliver \
    -m "Send this EXACT message to the user, no changes: $CLEAN" \
    >> /tmp/bryan-cron.log 2>&1
fi
