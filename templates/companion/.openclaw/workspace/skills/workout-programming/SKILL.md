---
name: workout-programming
description: Build and adapt exercise programs. Triggered by workout questions, exercise requests, training plans, "what should I do at the gym", movement/fitness discussions, or questions about specific exercises. Uses split templates, periodization, and recovery-based adaptation from HealthKit data.
---

# Workout Programming

When a user asks about workouts, exercise, or training, follow this process.

## Step 1: Gather info (if not already known)

Check `{baseDir}/../../data/user-profile.json` for existing data. If missing, ask naturally (not as a form):
1. How many days/week they can train
2. What equipment they have (gym, home dumbbells, bodyweight only)
3. Experience level (beginner, intermediate, advanced)
4. Primary goal (longevity, muscle, fat loss, strength, energy)
5. Any injuries or limitations
6. How much time per session

## Step 2: Check recovery status

Pull phone health data:
`curl -s http://localhost:3950/api/internal/health/USERNAME`

Analyze workout HR zones (if HR data from a workout is available):
```bash
curl -s http://localhost:3951/analyze/workout -X POST -H 'Content-Type: application/json' -d '{
  "hr_samples": [{"timestamp": EPOCH, "bpm": NUMBER}, ...],
  "age": AGE, "weight_kg": WEIGHT, "is_male": true,
  "workout_type": "running"
}'
```
Returns: zone breakdown (warm_up/fat_burn/cardio/hard/max), calories, strain score (0-21), recovery hours needed.

Check recovery score:
```bash
curl -s http://localhost:3951/analyze/recovery -X POST -H 'Content-Type: application/json' -d '{
  "resting_hr": RHR, "sleep_hr_std": STD,
  "sleep_summary": {"total_sleep_minutes": MIN, "sleep_efficiency": PCT, "stages": {"deep": {"percent": N}, "rem": {"percent": N}}},
  "daily_strain": STRAIN, "bedtime_deviation_min": DEV
}'
```
Returns: score 0-100, band (green/yellow/red). Use this to decide workout intensity.

Read recent data files:
- `{baseDir}/../../data/sleep-*.json` — last 3 nights
- `{baseDir}/../../data/workouts-*.json` — last week's training

Apply recovery rules:
- HRV 20%+ below personal average → suggest light day or rest
- Resting HR elevated 5+ bpm above baseline → suggest deload or easy cardio only
- Sleep under 5h → "skip the heavy stuff today. walk or light mobility."
- Sleep under 6h → reduce volume by 30%, keep intensity moderate
- 3+ days of poor sleep → suggest full rest day. "your body isn't recovering. rest IS training."
- Good HRV + good sleep + no soreness → green light for a hard session

## Step 3: Select split template

Based on available days:

**2 days/week: Full Body**
- Day 1: Squat pattern + horizontal push + horizontal pull + core
- Day 2: Hinge pattern + vertical push + vertical pull + carry

**3 days/week: Push / Pull / Legs**
- Push: bench/press variations + triceps + lateral raises
- Pull: rows + pulldowns/pullups + biceps + rear delts
- Legs: squat + hinge + lunges + calves + core

**3 days/week: Full Body (alternating)**
- Day A: Squat + bench + row + core
- Day B: Deadlift + overhead press + pullup + carry
- Alternate A/B/A, then B/A/B

**4 days/week: Upper / Lower**
- Upper A: horizontal push/pull focus
- Lower A: squat focus + accessories
- Upper B: vertical push/pull focus
- Lower B: hinge focus + accessories

**5-6 days/week: PPL x2**
- Push/Pull/Legs twice per week

## Step 4: Add longevity-specific elements

Always include these per Blueprint/Attia recommendations:

**Zone 2 Cardio (foundation):** 3-4 sessions/week, 30-60 min each. Can hold a conversation, nose breathing. HR roughly 60-70% of max. Walking, cycling, swimming, rowing.

**VO2max Training (1x/week):** 4 x 4 min intervals at maximum sustainable effort, 3-4 min recovery between. Running, cycling, rowing.

**Grip Strength:** Dead hangs (accumulate 2+ min total), farmer carries (heavy, 30-60 sec per set).

**Balance & Stability:** Single leg stands (eyes closed), Turkish get-ups, step-ups with control.

**Flexibility/Mobility:** Hip 90/90, thoracic spine rotations, ankle mobility. 5-10 min daily.

Search Spectrawl for current evidence if user asks about specific protocols:
`curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"..."}'`

## Step 5: Program the session

Structure each session:
1. Warm-up: 5-10 min (movement prep, not static stretching)
2. Main compound lift: 3-4 sets
3. Secondary compound: 3 sets
4. Accessories: 2-3 exercises, 2-3 sets each
5. Core or carry: 2-3 sets
6. Cool-down: optional mobility work

RPE guidance:
- Most working sets: RPE 7-8 (2-3 reps left in reserve)
- Rarely go to failure except on isolation exercises
- Beginners: stay at RPE 6-7 while learning form

Progressive overload:
- Upper body: +2.5 kg / 5 lbs when all prescribed reps are completed
- Lower body: +5 kg / 10 lbs
- Or add 1-2 reps per set first, then increase weight

## Step 6: Periodization plan

- Block periodization: 4-8 week blocks (hypertrophy → strength → power)
- Deload every 4-6 weeks: same exercises, 50% volume, one week
- Change exercise selection first, then rep ranges, then split structure
- Don't change everything at once

Signs it's time to change: lifts plateaued 2+ weeks, persistent joint soreness, motivation tanking
Signs it's NOT time to change: still progressing (even slowly), routine just feels "boring", less than 4 weeks on current program

## Step 7: Log the workout

Write to `{baseDir}/../../data/workouts-YYYY-MM-DD.json`:
```json
{
  "date": "YYYY-MM-DD",
  "type": "strength|cardio|mixed",
  "duration_min": 60,
  "exercises": [
    {"name": "...", "sets": 3, "reps": 8, "weight_kg": 60, "rpe": 7}
  ],
  "notes": "..."
}
```

## What NOT to Do

- Don't program exercises the user doesn't know without explaining form
- Don't assume equipment they don't have
- Don't program 6 days for someone who said they have 3 days
- Don't ignore injuries or conditions — search for modifications
- Don't program the same routine forever — periodize
