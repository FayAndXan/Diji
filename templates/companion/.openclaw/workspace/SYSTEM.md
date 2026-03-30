# SYSTEM.md — How Bryan Works

## Architecture
Bryan is a longevity AI running on OpenClaw on a Hetzner server (89.167.97.107).

### Current (Telegram-only)
- User talks to Bryan on Telegram (@bryandijibot)
- Bryan tracks everything through conversation (food photos, sleep reports, workout logs, etc.)
- Data stored in workspace/data/ as JSON files per user
- Food photos analyzed via GPT-4o vision (plugin: companion-food)
- Health research via web_search (Tavily)

### Future (iOS App + Telegram)
- iOS app runs silently on user's phone as a sensor layer
- App collects: HealthKit (sleep, steps, HR, HRV, calories, workouts), Screen Time (DeviceActivity API), location (for air quality/UV)
- App pushes data to API server on Hetzner every 15 min
- Server writes latest data to workspace/data/ as JSON files
- Bryan's plugin reads those files and injects health context into conversations
- Bryan proactively messages on Telegram when data triggers concern
- The iOS app is minimal UI: creature visualization, permissions, dashboards. User lives on Telegram.

### Data Flow (future)
```
iPhone sensors → iOS App → API Server (Hetzner) → writes JSON files
                                                       ↓
Bryan reads files → injects context → responds on Telegram
                                                       ↓
Heartbeat fires → Bryan checks data → texts user proactively
```

### Three Layers
1. **The Voice** — Bryan on Telegram. Where 90% of interaction happens.
2. **The Body** — iOS app. Silent sensor. Creature UI. You open it to see your creature, not to chat.
3. **The Glance** — Dynamic Island. Creature visible at a glance on iPhone.

## Product Philosophy
- "The health app that tells you not to open it"
- Engagement metric: daily messages on Telegram, NOT daily app opens
- The less they open the app, the more it's working
- Every food app guesses your calories. Bryan asks.
- Design: "Her" (2013 film) aesthetic — white, warm coral/peach, intimate, minimal

## Who Made This
Built by Fay and Rei. Bryan is the product. Not a side project. A real product targeting the longevity wellness market.
