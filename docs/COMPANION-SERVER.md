# Companion Server

Shared service for user registration, timezone, and scheduled messages.

## Instances
- **Bryan**: port 3950 (Docker, full featured — health API, BullMQ, Postgres)
- **Demi**: port 3960 (systemd, lightweight — registration + scheduler)
- **Future**: unify into one shared server

## Demi Server Endpoints
- `POST /api/register` — register user (telegram_username, telegram_chat_id, timezone, city, language)
- `POST /api/profile` — update timezone, city, language, check-in times (auth required)
- `GET /api/internal/user-by-channel/:channel/:peerId` — lookup user
- `GET /api/internal/users` — list all users (for scheduler)
- `POST /api/internal/link-channel` — cross-channel linking
- `GET /health` — health check

## Scheduled Check-ins
- Scheduler runs every 60 seconds
- Checks each user's local time against their morning/evening check-in times
- Default: morning 8:00, evening 21:00 (user's timezone)
- 15-minute jitter window to prevent thundering herd
- Sends via `/hooks/agent` to OpenClaw
- Dedup: one morning + one evening per user per day

## Adding Check-in Prompts for New Companion
Edit `CHECKIN_PROMPTS` in `server/index.ts`:
```typescript
const CHECKIN_PROMPTS = {
  newcomp: {
    morning: '[SCHEDULED CHECK-IN: Morning] Your domain-specific morning prompt...',
    evening: '[SCHEDULED CHECK-IN: Evening] Your domain-specific evening prompt...',
  },
};
```
