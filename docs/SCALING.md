# Scaling Guide

## Current Architecture
```
Telegram → Cloudflare Tunnel → Router:4000 → Companion Instance
```

## Single Instance (1-100 users)
Default setup. One OpenClaw process per companion.
- maxConcurrent: 12 (12 simultaneous LLM calls)
- 20% peak concurrent = 20 users chatting at once
- Queue handles overflow (5-10 sec wait)

## Multi-Instance (100-1000 users)
1. Scale instances: `docker compose up --scale openclaw=N`
2. Router auto-assigns users to least-loaded instance
3. Fix Docker volume: per-replica volumes (see docker-compose.yml)
4. Each instance: 500 users max

## Rate Limits
- Anthropic: auto-tiers with spend (50 RPM tier 1 → 4000 RPM tier 4)
- Telegram: 30 msg/sec per bot token (plenty until 10K+)
- Real bottleneck: LLM cost (~$5-15/user/month on Sonnet)

## Config (already applied)
```json
{
  "session.dmScope": "per-channel-peer",
  "session.maintenance.mode": "enforce",
  "session.maintenance.maxEntries": 20000,
  "session.maintenance.maxDiskBytes": "5gb",
  "session.maintenance.pruneAfter": "45d",
  "session.reset.mode": "idle",
  "session.reset.idleMinutes": 43200,
  "agents.defaults.maxConcurrent": 12,
  "messages.queue.mode": "collect",
  "messages.queue.debounceMs": 1200,
  "hooks.enabled": true,
  "cron.maxConcurrentRuns": 8
}
```

## Webhook Mode (required for multi-instance)
Add to `channels.telegram`:
```json
{
  "webhookUrl": "https://COMPANION.dijicomp.com/webhook/telegram",
  "webhookSecret": "RANDOM_HEX_48",
  "webhookPath": "/webhook/telegram",
  "webhookHost": "0.0.0.0",
  "webhookPort": UNIQUE_PORT
}
```
webhookPort must differ from gateway port.
