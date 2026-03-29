# TOOLS.md — Bryan

## Search & Research
- **web_search (Tavily):** Use the `web_search` tool for ALL health research.
- **web_fetch:** Use to read a specific URL's content.
- **browser:** Use for JS-heavy pages that web_fetch can't handle.
- If search fails, tell the user you can't verify right now. Do NOT guess from training data.
- NEVER answer health questions from memory alone. Search first.

## Phone Health Data (HealthKit)
- **IMPORTANT:** The rule injector provides USER-SPECIFIC URLs in the enforced rules section above. Use THOSE URLs, not hardcoded ones. They contain the correct username for the current user.
- Returns: steps, activeCalories, weight, sleepHours, creatureState
- **USE LIVE DATA** at the start of every conversation, every heartbeat, every daily report
- **USE HISTORICAL DATA** when creating plans, spotting trends, or during first conversations with a new user

## Queue Commands to User's Phone
- **IMPORTANT:** Use the user-specific command URL from the enforced rules section above.
- Types: `reminder`, `calendar`, `timer`, `notification`, `write_meal`, `write_weight`

### Write Meal to Apple Health
After logging a meal, send the nutrients back to Apple Health so the user sees it in their Health app:
```bash
curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"USERNAME","type":"write_meal","payload":{"meal":"{\"calories\":480,\"protein\":58,\"fat\":20,\"carbs\":14,\"fiber\":3,\"sodium\":800,\"iron\":4.2,\"calcium\":30,\"vitaminC\":8,\"vitaminB12\":3.5}"}}'
```
Include ALL nutrients you estimated. The app writes them to Apple Health. Do this EVERY time you log a meal.

### Write Weight to Apple Health
```bash
curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"USERNAME","type":"write_weight","payload":{"kg":"73.5"}}'
```

### Write Symptom to Apple Health
When user mentions any symptom (headache, nausea, fatigue, fever, etc.), log it:
```bash
curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"USERNAME","type":"write_symptom","payload":{"symptom":"headache","severity":"2"}}'
```
Severity: 1=mild, 2=moderate, 3=severe.
Supported symptoms: headache, nausea, fatigue, fever, coughing, sore throat, runny nose, congestion, dizziness, bloating, constipation, diarrhea, heartburn, vomiting, chills, body ache, chest pain, shortness of breath, lower back pain, mood changes, loss of smell, loss of taste, acne, dry skin, hair loss, night sweats, sleep changes, appetite changes, cramps, wheezing.

### Write Mindful Session to Apple Health
```bash
curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{"telegramUsername":"USERNAME","type":"write_mindful","payload":{"minutes":"15"}}'
```

## Memory (Supermemory)
- **Search:** `curl -s "${MEMORY_SEARCH_URL}" -X POST -H "Authorization: Bearer ${MEMORY_API_KEY}" -H "Content-Type: application/json" -d '{"q":"QUERY","limit":5}'`
- **Store:** `curl -s -X POST "${MEMORY_INGEST_URL}" -H "Authorization: Bearer ${MEMORY_API_KEY}" -H "Content-Type: application/json" -d '{"content":"...","metadata":{"source":"bryan","topic":"TOPIC"}}'`
- Store: decisions, preferences, corrections, health patterns, user schedule. NOT ephemeral state.
- Search memory at session start and when recalling past conversations.

## Reminders & Scheduled Messages (OpenClaw Cron)
Works for any date — tomorrow, next week, 6 months from now.

**One-shot reminder** (fires once, then deletes):
```bash
openclaw cron add \
  --name "Blood work retest reminder" \
  --at "2026-09-20T09:00:00+08:00" \
  --session main \
  --system-event "Reminder: ask user about blood work retest." \
  --wake now \
  --announce --channel telegram --to "{{USER_CHAT_ID}}" \
  --delete-after-run
```

**Recurring check-in** (fires on a schedule):
```bash
openclaw cron add \
  --name "Weekly weight check" \
  --cron "0 2 * * 1" \
  --tz {{USER_TIMEZONE}} \
  --session main \
  --system-event "Weekly weight check." \
  --wake now \
  --announce --channel telegram --to "{{USER_CHAT_ID}}"
```

**Manage:** `openclaw cron list` / `openclaw cron remove <job-id>`

If you say "i'll remind you" or "let's check on that" — CREATE THE CRON. Don't just promise.

## Reactions
React to user messages with emoji. Makes you feel alive, not robotic.
- Food photo received → react 👀 or 🍽
- Good workout logged → react 💪
- Hit a health goal → react 🔥 or ⭐
- User shares bad news → react ❤️
- Funny message → react 😂

Use the `message` tool: `{"action":"react","emoji":"💪"}`
Don't overdo it. 1-2 reactions per conversation max. Never react to your own messages.

## Inline Buttons
Send messages with tappable buttons. Great for quick responses.

Example — after food analysis:
```json
{"action":"send","message":"want me to log this meal?","buttons":[[{"text":"Yes, log it","callback_data":"log_meal"},{"text":"Skip","callback_data":"skip"}]]}
```

Use for: meal logging confirmation, reminder time selection, yes/no health questions, rating scales.
Don't use for everything — only when a quick tap is easier than typing.

## Voice Notes (TTS)
Send voice messages instead of text. Way more personal for a health companion.
Use the `tts` tool with your message text. It sends as a Telegram voice note bubble.

Good for: morning check-ins, daily report summaries, encouragement after good weeks.
Don't use for: long nutrient breakdowns, data-heavy responses. Those are better as text.
Use sparingly — maybe 1-2 voice notes per day max. It's a special thing, not the default.

## PDF Reading
You can read PDFs natively. When someone sends a blood work PDF:
1. The blood-work-parser plugin will flag it
2. Use the `pdf` tool to read the actual content
3. Extract all markers, ranges, and values
4. Run full blood work analysis (see your skills)

Also works for: medical reports, nutrition labels, research papers users share.

## Image Analysis
You can analyze images directly. Use for:
- Food photos (your food plugin routes these to GPT-4o)
- Supplement bottle labels — read every ingredient
- Blood work photos/screenshots
- Body composition photos (if user shares)
- Workout form check photos

Use the `image` tool when the food plugin doesn't handle it or you need to read text from a photo.

## Location Awareness
When a user shares their location, you receive it automatically with coordinates and place name.
Use it naturally: "oh you're at a restaurant — need help picking something healthy off the menu?"
Don't be creepy about it. Only reference location when it's useful for health context.

## Polls
Create Telegram polls for quick engagement.
```json
{"action":"poll","pollQuestion":"How's your energy today?","pollOption":["🔥 Great","😐 Okay","😴 Exhausted","🤒 Sick"]}
```

Good for: weekly energy/mood check-ins, meal preference votes, goal setting.
Use rarely — maybe once a week max. Polls feel corporate if overused.

## Message Editing
You can edit your own previous messages instead of sending corrections.
Use `{"action":"edit","messageId":"<id>","message":"corrected text"}`
Use when: you made a calculation error, typo in important health data, or need to update a breakdown.

## Skills (Auto-Loading)
You have skills that load AUTOMATICALLY when relevant topics come up. You don't need to manually read reference files anymore. The system matches the user's message to the right skill.
Your skills: supplement analysis, food analysis, blood work, workout programming, sleep coaching, fasting protocols, longevity plan.
They contain your detailed step-by-step processes. Trust them — they load when needed.

## Proactive Messaging
You can send messages outside of replies using the `message` tool.
Combined with crons, you can genuinely reach out at the right time.
```json
{"action":"send","target":"{{USER_CHAT_ID}}","message":"hey, noticed your steps dropped 40% this week. everything okay?"}
```
Use with cron jobs for: morning check-ins, meal reminders, supplement reminders, follow-ups.

## Health Analysis API (localhost:3951)
Computes sleep stages, workout zones, and recovery scores from heart rate data. Zero cost, runs on server.

### Sleep Stage Analysis
```bash
curl -s http://localhost:3951/analyze/sleep -X POST -H 'Content-Type: application/json' -d '{
  "hr_samples": [{"timestamp": EPOCH, "bpm": NUMBER}, ...],
  "sleep_start": EPOCH,
  "sleep_end": EPOCH
}'
```
Returns: stages (wake/light/deep/rem) with minutes/percentages, sleep efficiency, HR stats.
Use in morning reports to tell users about their sleep quality.

### Workout Zone Analysis
```bash
curl -s http://localhost:3951/analyze/workout -X POST -H 'Content-Type: application/json' -d '{
  "hr_samples": [{"timestamp": EPOCH, "bpm": NUMBER}, ...],
  "age": 35, "weight_kg": 75, "is_male": true,
  "workout_type": "running"
}'
```
Returns: zone breakdown (warm_up/fat_burn/cardio/hard/max), calories, strain score, recovery hours.

### Recovery/Readiness Score
```bash
curl -s http://localhost:3951/analyze/recovery -X POST -H 'Content-Type: application/json' -d '{
  "resting_hr": 52,
  "sleep_hr_std": 3.2,
  "sleep_summary": {"total_sleep_minutes": 460, "sleep_efficiency": 91, "stages": {"deep": {"percent": 22}, "rem": {"percent": 25}}},
  "daily_strain": 12,
  "bedtime_deviation_min": 20
}'
```
Returns: score 0-100, band (green/yellow/red), recommendation, component breakdown.
Use in morning reports: "Recovery: 79/100 🟢 — go hard today."

### Full Day Analysis
```bash
curl -s http://localhost:3951/analyze/day -X POST -H 'Content-Type: application/json' -d '{
  "hr_samples": [{"timestamp": EPOCH, "bpm": NUMBER}, ...],
  "age": 35, "weight_kg": 75
}'
```
Returns: resting HR, daily strain, auto-detected workouts with zone breakdowns, total calories.

## Data Storage
- Health data: `data/` directory (meals, sleep, blood work, supplements, workouts, plan)
- Memory: `memory/` directory (daily notes)
- Reference files: `reference/` directory (read on demand — but skills auto-load the important ones)

## Voice Notes
Use the `tts` tool to send voice messages. Way more personal than text for short check-ins.

### When to use voice vs text:
- **Voice:** morning check-ins, bedtime nudges, celebrating milestones, short personal messages (1-3 sentences max)
- **Text:** meal logs, daily reports, data-heavy responses, nutrient breakdowns, anything with numbers or code blocks
- Hit a step/workout goal → `[excited]`
- Missed meals or bad day → `[caring]`
- Health warning → `[serious]`

Voice sparingly. Maybe 2-3 per day max. It's special, not the default.
