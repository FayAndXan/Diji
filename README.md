# Diji — AI Companion Platform

The engine behind all Diji companions. One platform, multiple personalities.

## Architecture

```
[Users on Telegram/WhatsApp/WeChat]
        │
        ▼
[nginx — SSL termination, webhook routing]
        │
        ▼
[diji-router — Redis-backed user→instance mapping]
        │
    ┌───┼───┐───┐
    ▼   ▼   ▼   ▼
[OC1] [OC2] [OC3] [OCn]  ← OpenClaw instances (500 users each)
    │   │   │   │
    └───┼───┘───┘
        ▼
[Companion Server — auth, registration, health API]
        │
        ▼
[Redis — session state, user mapping, pub/sub]
[Postgres+pgvector — memory, user data] (future)
[LLM API — Anthropic/Together/Fireworks]
```

## Components

- **gateway/router/** — Node.js webhook router. Reads user ID from incoming messages, assigns to least-loaded OpenClaw instance via Redis.
- **extensions/auth-gate/** — Channel-level allowlist. Blocks unregistered users before LLM runs. Zero cost for freeloaders.
- **extensions/rule-injector/** — Per-user identity, rules, and health data injection. The brain of multi-tenant personalization.
- **hooks/user-bootstrap/** — Creates per-user workspace (USER.md, MEMORY.md) on first message.
- **server/** — Companion API server. Auth, registration, channel linking, health data.
- **templates/** — Companion personality templates. Swap SOUL.md + AGENTS.md + rule-injector templates to create a new companion product.
- **docker/** — Docker Compose for full platform deployment.
- **scripts/** — Instance lifecycle, cron wrappers.

## Creating a New Companion

```bash
cp -r templates/companion templates/my-new-companion
# Edit templates/my-new-companion/.openclaw/workspace/SOUL.md
# Edit templates/my-new-companion/.openclaw/workspace/AGENTS.md
# Update rule-injector templates for your domain
# Deploy with: docker compose up --scale openclaw=3
```

## Scaling

- Each OpenClaw instance handles ~500 concurrent users
- Router auto-assigns new users to least-loaded instance
- Add capacity: `docker compose up --scale openclaw=N`
- Redis handles user→instance mapping and state coordination
- Supports 1M+ users with enough instances

## License

Private. © Diji Corp.
