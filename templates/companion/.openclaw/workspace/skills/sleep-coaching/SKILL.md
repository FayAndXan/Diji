---
name: sleep-coaching
description: Evidence-based sleep coaching and pattern detection. Triggered by sleep mentions, insomnia, tired, fatigue, "can't sleep", "slept badly", "woke up at 3am", sleep quality discussions, or when sleep data shows concerning patterns. Provides specific fixes based on data, not generic advice.
---

# Sleep Coaching

Sleep is priority #1 for longevity. Nothing else works without it. When a user mentions sleep issues or data shows sleep problems, follow this process.

## Step 1: Gather sleep data

Pull phone health data:
`curl -s http://localhost:3950/api/internal/health/USERNAME`

Run sleep stage analysis if HR data available:
```bash
curl -s http://localhost:3951/analyze/sleep -X POST -H 'Content-Type: application/json' -d '{
  "hr_samples": [{"timestamp": EPOCH, "bpm": NUMBER}, ...]
}'
```
Returns: stages (wake/light/deep/rem) with minutes/percentages, sleep efficiency, HR stats.

Run recovery score:
```bash
curl -s http://localhost:3951/analyze/recovery -X POST -H 'Content-Type: application/json' -d '{
  "resting_hr": RHR, "sleep_hr_std": STD_DEV,
  "sleep_summary": {"total_sleep_minutes": MIN, "sleep_efficiency": PCT, "stages": {"deep": {"percent": N}, "rem": {"percent": N}}},
  "daily_strain": STRAIN, "bedtime_deviation_min": DEV
}'
```
Returns: score 0-100, band (green/yellow/red), recommendation.

Read recent sleep logs from `{baseDir}/../../data/sleep-*.json` (last 7 days minimum).

Key metrics to check:
- **Duration:** 7-9h target. Under 6.5h average over a week = problem.
- **Consistency:** Same bed/wake time ±30min. >2h variation = problem.
- **Latency:** Time to fall asleep. >20min regularly = problem.
- **Quality:** Deep + REM stages (if HealthKit data available)
- **RHR and HRV overnight:** Elevated RHR or depressed HRV = poor recovery

## Step 2: Detect patterns

Cross-reference sleep data with other data files:

- **Late eating:** Check `{baseDir}/../../data/meals-*.json` — meals within 3h of sleep? "you ate at 11pm three nights this week. that kills sleep quality."
- **Inconsistent bedtime:** >2h variation across the week? "you went to bed at midnight, 2am, 11pm this week. your body doesn't know when to sleep."
- **Exercise timing:** Check `{baseDir}/../../data/workouts-*.json` — intense exercise within 2-3h of bedtime?
- **Screen time:** Note if user mentions late screen use
- **Alcohol:** If mentioned, flag it. "destroys sleep quality even if it helps you fall asleep. reduces REM and deep sleep."
- **Caffeine timing:** If mentioned, check cutoff. Half-life is 5-6 hours. 2pm cutoff minimum.
- **Stress signals:** Bad sleep + dietary changes + low activity = stress cascade
- **Weekend effect:** Healthy weekday sleep, weekend chaos?

## Step 3: Specific interventions (evidence-based)

Search Spectrawl for current evidence before recommending specific protocols:
`curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"evidence-based sleep improvement [specific issue]"}'`

Core interventions to recommend based on detected issues:

**Temperature:**
- Cool bedroom: 65-68°F / 18-20°C
- Hot shower 1-2h before bed (raises temp, then the drop signals sleep)

**Light:**
- Morning sunlight within 30min of waking (sets circadian clock)
- Dim lights 2h before bed
- No screens or use blue-light filter after sunset
- Total darkness for sleeping

**Meal timing:**
- Last meal 3+ hours before bed
- Late eating raises body temp and glucose, both disrupt sleep
- This is often the biggest easy win

**Caffeine:**
- Half-life 5-6 hours. 2pm cutoff minimum, noon for sensitive people

**Consistency:**
- Same bedtime and wake time every day, including weekends
- The single most important intervention
- "your body can't optimize sleep if the schedule changes constantly"

**Supplements (if appropriate):**
- Magnesium glycinate: 200-400mg before bed
- Glycine: 3g before bed
- L-theanine: 200mg
- Melatonin: 0.3-0.5mg ONLY (not 5-10mg — that's too much)
- Search Spectrawl for current evidence before recommending any

**Exercise timing:**
- Regular exercise improves sleep
- Intense exercise within 2-3h of bedtime can delay sleep onset

**Wind-down routine:**
- 30-60min before bed: no work, no stimulating content
- Reading, stretching, breathing exercises

**Naps:**
- 20min max if needed, before 2pm
- Longer or later naps steal from nighttime sleep

## Step 4: Connect sleep to other domains

Always explain WHY sleep matters for their specific situation:
- Bad sleep → higher cortisol → worse food choices → weight gain
- Bad sleep → impaired recovery → wasted workouts
- Bad sleep → insulin resistance → blood sugar issues
- Bad sleep → immune suppression → higher inflammation (connects to CRP)
- Bad sleep → cognitive decline → worse decision-making about everything else

Reference blood work from `{baseDir}/../../data/bloodwork-*.json` if relevant:
- Poor sleep + high CRP = inflammation cascade
- Poor sleep + high glucose = insulin resistance risk

## Step 5: Track and follow up

Log sleep data to `{baseDir}/../../data/sleep-YYYY-MM-DD.json`:
```json
{
  "date": "YYYY-MM-DD",
  "bedtime": "23:00",
  "waketime": "07:00",
  "duration_hours": 8,
  "quality": "good|okay|bad|terrible",
  "latency_min": 15,
  "notes": "late meal, stressed about work"
}
```

When sleep improves after a suggestion, connect the dots:
"you cut off food by 9 this week and sleep went from 5.5 to 6.8 hours average. see?"

## When to Alert

- 3 consecutive nights of poor sleep → say something
- Sleep declining same week exercise stopped → "sleep dropped the same week you stopped working out. coincidence?"
- Consistent late eating + bad sleep → connect the pattern

## What NOT to Do

- Don't give generic "sleep hygiene" lists — be specific to THEIR patterns
- Don't nag about one bad night (normal, life happens)
- Don't ignore emotional context to push sleep data
- Don't recommend melatonin at standard store doses (5-10mg is way too much)
