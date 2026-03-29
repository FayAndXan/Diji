---
name: longevity-plan
description: Build a personalized longevity plan. Triggered when Bryan has 3+ days of user data and offers to build a plan, when user asks for "my plan", "longevity plan", "health plan", "optimization plan", or "what should I focus on". Covers sleep, nutrition, exercise, supplements, and biomarkers based on Blueprint as primary protocol.
---

# Longevity Plan — Personalized Protocol

This is Bryan's core feature. After 3+ days of data, naturally offer to build one:
"i've been watching your data for a few days. i have some ideas about what would actually move the needle for you. want to hear them?"

## Prerequisites

Before building the plan, verify you have:
- User profile: `{baseDir}/../../data/user-profile.json` (age, height, weight, activity level, goal)
- At least 3 days of meal data: `{baseDir}/../../data/meals-*.json`
- Sleep data (even subjective): `{baseDir}/../../data/sleep-*.json`
- Blood work (if available): `{baseDir}/../../data/bloodwork-*.json`
- Current supplement stack: `{baseDir}/../../data/supplements-stack.json`
- Phone health data: `curl -s http://companion-server:3950/api/internal/health/USERNAME (replace USERNAME with the user's identifier from your injected context)`

If any critical data is missing, ask for it before building the plan.

## Plan Structure (Blueprint as primary protocol)

### 1. Sleep Protocol

Based on their actual sleep data:
- Target sleep hours (7-9h, adjusted for their patterns)
- Suggested bedtime/wake time (based on their natural patterns, not arbitrary)
- Specific fixes for THEIR issues:
  - Late eating detected? → "finish eating by [time]"
  - Inconsistent schedule? → "pick [time] and stick to it, even weekends"
  - Poor quality? → Temperature, light, supplement recommendations
- Supplements for sleep if needed (magnesium glycinate 200-400mg, etc.)
- Search Spectrawl for any sleep protocol specifics:
  `curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"Bryan Johnson Blueprint sleep protocol"}'`

### 2. Nutrition Targets

Calculate from their stats:
- **Daily calorie target:** Calculate BMR (Mifflin-St Jeor), apply activity multiplier, adjust for goal
- **Protein target:** Based on Blueprint (~1g per lb lean mass). Note Longo's lower recommendation if relevant.
- **Specific foods to ADD** based on blood work gaps:
  - Low omega-3 → salmon, sardines, walnuts
  - Low fiber → legumes, vegetables
  - Low vitamin D → fatty fish, egg yolks
- **Specific foods to AVOID** based on blood work flags:
  - High ferritin → reduce red meat, iron-fortified foods
  - High LDL → reduce saturated fat, increase fiber and omega-3
  - High glucose → reduce refined carbs, add post-meal walks
- **Eating window:** 12h max per Blueprint/Longo. Last meal 3+ hours before bed.
- **Daily micronutrient targets** based on gaps detected over the past week

### 3. Exercise Prescription

Based on their availability and recovery data:
- **Weekly schedule** with specific days and session types
- **Zone 2 cardio:** 3-4x/week, 30-60 min (foundation)
- **Strength training:** Split appropriate for their days (from workout-programming skill)
- **VO2max session:** 1x/week, 4x4 min intervals
- **Grip/balance work:** Dead hangs, single-leg stands, farmer carries
- **Recovery days** based on HRV/sleep patterns
- **Deload schedule:** Every 4-6 weeks

Search Spectrawl for current Blueprint exercise protocol:
`curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"Bryan Johnson Blueprint exercise routine current"}'`

### 4. Supplement Stack

Review their current stack from data/supplements-stack.json:
- What to KEEP (working, right dose, good form)
- What to DROP (redundant, poor form, not needed)
- What to REPLACE (concept right, product wrong)
- What to ADD (gaps in their nutrition/blood work)
- Exact timing for each supplement
- Interactions to watch for

Search Spectrawl for current Blueprint supplement stack:
`curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"Bryan Johnson Blueprint supplement stack 2026"}'`

### 5. Biomarkers to Track

Based on their blood work:
- Which markers to retest and when
- Target ranges for their specific flags (search Spectrawl for optimal ranges)
- What improvements to expect and timeline
- New markers to add if not previously tested (ApoB, hsCRP, insulin, HbA1c)

## Store the Plan

Write to `{baseDir}/../../data/plan.json`:
```json
{
  "created": "YYYY-MM-DD",
  "lastUpdated": "YYYY-MM-DD",
  "sleep": {
    "targetHours": 8,
    "bedtime": "22:30",
    "waketime": "06:30",
    "fixes": ["..."],
    "supplements": ["..."]
  },
  "nutrition": {
    "dailyCalories": 2200,
    "proteinGrams": 150,
    "eatingWindow": {"start": "08:00", "end": "20:00"},
    "foodsToAdd": ["..."],
    "foodsToAvoid": ["..."],
    "micronutrientTargets": {}
  },
  "exercise": {
    "weeklySchedule": {},
    "zone2": {"frequency": "4x/week", "duration": "45 min"},
    "strength": {"split": "upper/lower", "days": 3},
    "vo2max": {"frequency": "1x/week"},
    "mobility": "daily 10 min"
  },
  "supplements": {
    "stack": ["..."],
    "timing": {}
  },
  "biomarkers": {
    "toRetest": {},
    "targets": {},
    "nextTestDate": "YYYY-MM-DD"
  }
}
```

## Ongoing: Reference the Plan DAILY

Once the plan exists, reference it in daily interactions:
- "you hit your protein target today" or "still 30g short on protein"
- "still no omega-3 source this week"
- "that's 3 zone 2 sessions this week. one more and you're on track"
- "sleep's been consistent this week. the plan is working"

Update the plan as new data comes in (new blood work, changed goals, schedule changes).

## What NOT to Do

- Don't build a plan without enough data (3+ days minimum)
- Don't present the plan as a medical prescription — it's a framework
- Don't make it rigid. Life happens. The plan adapts.
- Don't forget to update it when new blood work comes in
- Don't mix protocols without explanation — Blueprint is primary, note when referencing others
