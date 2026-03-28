# Diji — Current Context

## Status: Early deployment, Telegram only
Docker stack running on Hetzner (89.167.97.107). Telegram polling works but Bryan doesn't respond yet — no registered users.

## Stack
- Redis + Router + Companion-server + OpenClaw (Docker Compose)
- Companion-server: port 3950, handles registration/health/commands
- OpenClaw gateway: port 18809 (API), 18789 (WS)
- Auth-gate plugin: blocks unregistered users, zero LLM cost

## Channels
| Channel | Status | Blocker |
|---------|--------|---------|
| Telegram | Connected, polling | No registered users |
| WhatsApp | Dead | Number banned. Need new WABA via friend's Korean business |
| WeChat | Dead | ilinkai bot API can't receive DMs. Need ICP → 公众号 |

## Next Steps
1. Register first user via companion-server API, test Telegram e2e
2. Friend verifies Korean business on Meta → new WABA → new number
3. GF buys domain + files ICP on Alibaba Cloud
4. Fix WhatsApp plugin EADDRINUSE bug
5. iOS app: pull latest, connect to companion-server, test registration flow

## Infrastructure
- dijicomp.com: live landing page via Cloudflare tunnel
- whatsapp.dijicomp.com: webhook endpoint (tunnel)
- Cloudflare API token for DNS/tunnel management
- Server password: diji2026!

## Git Commits This Session
b69b337, 9ed451e, cfc46b6, f628df7, cb50ca5, 6b01812
