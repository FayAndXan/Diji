#!/bin/bash
# Runs openclaw agent, captures output. Only delivers if it's a real message.
# Usage: bryan-cron-wrapper.sh "prompt text here"

PROMPT="$1"
OUTPUT=$(OPENCLAW_CONFIG_PATH=/root/.openclaw-companion/openclaw.json \
OPENCLAW_STATE_DIR=/root/.openclaw-companion \
openclaw agent \
  --channel telegram \
  --to "${BRYAN_CHAT_ID}" \
  -m "$PROMPT" 2>>/tmp/bryan-cron.log)

# Filter out non-messages
CLEAN=$(echo "$OUTPUT" | grep -v -i "^HEARTBEAT_OK$" | grep -v -i "^SKIP$" | grep -v -i "^NO_REPLY$" | sed '/^$/d')

if [ -n "$CLEAN" ]; then
  # Has actual content — deliver it
  OPENCLAW_CONFIG_PATH=/root/.openclaw-companion/openclaw.json \
  OPENCLAW_STATE_DIR=/root/.openclaw-companion \
  openclaw agent \
    --channel telegram \
    --to "${BRYAN_CHAT_ID}" \
    --deliver \
    -m "Send this exact message to the user, do not modify it: $CLEAN" 2>>/tmp/bryan-cron.log
fi
