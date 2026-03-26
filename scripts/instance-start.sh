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

# Start OpenClaw gateway
cd /root/.openclaw-companion
exec openclaw gateway start --port ${GATEWAY_PORT} --no-open
