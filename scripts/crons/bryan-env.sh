#!/bin/bash
# Bryan shared config — sourced by all cron scripts
BRYAN_CONFIG=/root/.openclaw-companion/openclaw.json
BRYAN_STATE=/root/.openclaw-companion
BRYAN_CHAT_ID="${BRYAN_CHAT_ID:?BRYAN_CHAT_ID env var required}"
BRYAN_HEALTH_USER="${BRYAN_HEALTH_USER:?BRYAN_HEALTH_USER env var required}"

# Read timezone from OpenClaw config
BRYAN_TZ=$(python3 -c "
import json
with open('$BRYAN_CONFIG') as f:
    c = json.load(f)
tz = c.get('agents',{}).get('defaults',{}).get('userTimezone', 'UTC')
print(tz)
" 2>/dev/null)

[ -z "$BRYAN_TZ" ] && BRYAN_TZ="UTC"

# Current time in user's timezone
BRYAN_TIME=$(TZ=$BRYAN_TZ date '+%I:%M %p %Z, %A %B %d')

# Check if a trigger already fired today (dedup with companion server)
check_trigger_fired() {
  local TRIGGER_TYPE="$1"
  local RESULT=$(curl -s "http://localhost:3950/api/internal/trigger-status/$BRYAN_HEALTH_USER/$TRIGGER_TYPE" 2>/dev/null)
  echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('fired',False))" 2>/dev/null
}
