# Diji Keychat — Platform Architecture Decisions
# (Diji = template/parent project. Companion-specific saves go to projects/diji-bryan/)

## 2026-03-28

### Auth-gate: no LLM reply
Auth-gate plugin claims events to block LLM processing but does NOT reply. User-bootstrap hook sends welcome message via raw Telegram API = zero LLM cost.

### WhatsApp: Kapso wraps Meta, still needs verification
Kapso isn't a bypass — still requires Meta business verification. For now, using friend's Korean business to verify WABA.

### WeChat: personal accounts are a dead end
ilinkai bot API (openclaw-weixin) only receives bot sandbox messages, not regular WeChat DMs. Need 公众号 which requires ICP.

### Multi-channel routing
One WhatsApp number per companion (not per user). One WABA can hold 20+ numbers. Router handles session multiplexing.

### Cloudflare: tunnel over A record
Using tunnel for dijicomp.com (future-proof for server migration). Token-based tunnel managed via API (token: cfut_6Yo4PXe8uBCNCzFYID9yqLSxL2wcGnYSoBf0c8FAcd75624b).

### Registration gate
No users.json = no responses. Every user must register via companion-server /api/register before auth-gate lets messages through to LLM.
