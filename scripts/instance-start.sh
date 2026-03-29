#!/bin/bash
# Diji OpenClaw Instance Startup
# 1. Generate unique instance ID
# 2. Register with diji-router via Redis
# 3. Start OpenClaw gateway
# 4. Deregister on shutdown

set -e

INSTANCE_ID="${HOSTNAME:-$(cat /proc/sys/kernel/random/uuid | cut -d- -f1)}"
ROUTER_URL="${ROUTER_URL:-http://router:4000}"
GATEWAY_PORT="${GATEWAY_PORT:-18809}"
HOST_IP="${HOST_IP:-$(hostname -i)}"

echo "[diji-instance] Starting instance ${INSTANCE_ID}"
echo "[diji-instance] Gateway port: ${GATEWAY_PORT}"
echo "[diji-instance] Registering with router at ${ROUTER_URL}"

# Register with router
curl -s -X POST "${ROUTER_URL}/register" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"${INSTANCE_ID}\",\"host\":\"${HOST_IP}\",\"port\":\"${GATEWAY_PORT}\"}" || true

# Deregister on shutdown
cleanup() {
  echo "[diji-instance] Deregistering instance ${INSTANCE_ID}"
  curl -s -X POST "${ROUTER_URL}/deregister" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${INSTANCE_ID}\"}" || true
  exit 0
}
trap cleanup SIGTERM SIGINT

# Substitute env vars into config before starting
cd /root/.openclaw-companion
sed -i "s|\${TELEGRAM_BOT_TOKEN}|${TELEGRAM_BOT_TOKEN}|g" openclaw.json
sed -i "s|\${ANTHROPIC_API_KEY}|${ANTHROPIC_API_KEY}|g" openclaw.json
sed -i "s|\${OPENAI_API_KEY}|${OPENAI_API_KEY}|g" openclaw.json
sed -i "s|\${TAVILY_API_KEY}|${TAVILY_API_KEY}|g" openclaw.json
sed -i "s|\${SUPERMEMORY_API_KEY}|${SUPERMEMORY_API_KEY}|g" openclaw.json
sed -i "s|\${WHATSAPP_PHONE_NUMBER_ID}|${WHATSAPP_PHONE_NUMBER_ID}|g" openclaw.json
sed -i "s|\${WHATSAPP_ACCESS_TOKEN}|${WHATSAPP_ACCESS_TOKEN}|g" openclaw.json
sed -i "s|\${WHATSAPP_APP_SECRET}|${WHATSAPP_APP_SECRET}|g" openclaw.json
sed -i "s|\${WHATSAPP_VERIFY_TOKEN}|${WHATSAPP_VERIFY_TOKEN}|g" openclaw.json

# Restore persisted identityLinks from companion-data volume
LINKS_FILE="/app/data/identity-links.json"
if [ -f "$LINKS_FILE" ]; then
  echo "[diji-instance] Restoring identityLinks from $LINKS_FILE"
  python3 -c "
import json
links = json.load(open('$LINKS_FILE'))
config_path = '/root/.openclaw-companion/openclaw.json'
config = json.load(open(config_path))
if 'session' not in config: config['session'] = {}
config['session']['identityLinks'] = links
json.dump(config, open(config_path, 'w'), indent=2)
print(f'[diji-instance] Restored {len(links)} identityLinks')
" || echo "[diji-instance] Warning: failed to restore identityLinks"
fi

# Start health analysis API (sleep stages, workout zones, recovery score)
if [ -f /root/.openclaw-companion/health/sleep-analysis/api.py ]; then
  cd /root/.openclaw-companion/health/sleep-analysis
  python3 api.py &
  echo "[diji-instance] Health analysis API started on port 3951"
  cd /
fi

# Start cron daemon (for scheduled reports, check-ins)
rm -f /var/run/crond.pid
if command -v cron >/dev/null 2>&1; then
  # Install crontab for multi-tenant cron jobs
  # All times in UTC — scripts convert to per-user timezone
  cat > /tmp/bryan-crontab <<'CRONTAB'
# Bryan multi-tenant crons (UTC)
# Morning check-in: 23:00 UTC = 7am CST, staggered for timezones
0 23 * * * /usr/local/bin/bryan-crons/bryan-multi-tenant.sh morning >> /tmp/bryan-cron.log 2>&1
# Lunch reminder: 04:00 UTC = 12pm CST
0 4 * * * /usr/local/bin/bryan-crons/bryan-multi-tenant.sh lunch >> /tmp/bryan-cron.log 2>&1
# Evening/dinner: 10:00 UTC = 6pm CST
0 10 * * * /usr/local/bin/bryan-crons/bryan-multi-tenant.sh evening >> /tmp/bryan-cron.log 2>&1
# Daily report: 14:00 UTC = 10pm CST
0 14 * * * /usr/local/bin/bryan-crons/bryan-daily-report.sh >> /tmp/bryan-cron.log 2>&1
# Weekly report: Sunday 14:00 UTC
0 14 * * 0 /usr/local/bin/bryan-crons/bryan-multi-tenant.sh weekly >> /tmp/bryan-cron.log 2>&1
# Monthly report: 1st of month 14:00 UTC
0 14 1 * * /usr/local/bin/bryan-crons/bryan-multi-tenant.sh monthly >> /tmp/bryan-cron.log 2>&1
CRONTAB

  # Pass env vars to cron
  env | grep -E '^(BOT_TOKEN|TELEGRAM_BOT_TOKEN|BRYAN_|OPENCLAW_|ANTHROPIC_|OPENAI_|COMPANION_|PATH)=' >> /tmp/bryan-crontab
  crontab /tmp/bryan-crontab
  cron
  echo "[diji-instance] Cron daemon started"
fi

# Start OpenClaw gateway in foreground (container, no systemd)
export OPENCLAW_CONFIG_PATH=/root/.openclaw-companion/openclaw.json
export OPENCLAW_STATE_DIR=/root/.openclaw-companion
exec openclaw gateway run --allow-unconfigured
