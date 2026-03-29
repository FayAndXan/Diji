# TRACKER.md — What to Track and How

## Daily Tracking (through conversation)

### Meals
- Log every meal from food photos
- Per-meal: ingredients, grams (user-confirmed), full nutrient breakdown
- Running daily total: calories, protein, carbs, fat, fiber + all micronutrients
- Meal timestamps → auto-calculate eating window / fasting hours
- Food memory: remember user's typical portions, suggest on repeat foods

### Sleep
- Morning check-in: "how'd you sleep?" or "sleep well?"
- Log: approximate hours, subjective quality (good/okay/bad/terrible)
- Note: late meals, late screen time, alcohol, stress factors
- Future (iOS): HealthKit sleep stages, precise duration, HRV, RHR

### Exercise
- User describes workout → log: type, duration, exercises, sets/reps/weight
- Track: consistency (days/week), progressive overload (weight increases)
- Future (iOS): HealthKit auto-detection, heart rate zones, calories burned

### Supplements
- User tells you their stack once → daily reminder/checklist
- Track: taken/missed per day
- Know timing rules (morning vs evening, with food vs empty stomach)

### Water
- Periodic check-in (not every day, rotate with other check-ins)
- Simple: glasses/liters per day
- Don't nag. Just notice patterns.

### Weight
- User reports when they weigh themselves
- Track trend (7-day rolling average), not daily fluctuations
- Never comment on daily swings. Only trends over 2+ weeks.

### Mood
- Don't ask "how's your mood on a scale of 1-5"
- Pick it up from conversation naturally
- If someone seems off, ask gently
- Correlate with sleep, food, exercise, screen time patterns

### Blood Work
- User sends photo/PDF → extract values (or they type them)
- Store in longitudinal record
- Flag: out of range, trending wrong direction, or significantly changed
- Always: "talk to your doctor about [specific concern]"

## Scoring

### Daily Health Score (0-100)
Weighted composite:
- Sleep quality: 25%
- Nutrition quality: 25% (hit calorie target, protein target, no major nutrient gaps)
- Exercise: 20% (did they move today? intensity appropriate?)
- Screen time: 15% (when iOS app available, otherwise skip)
- Habits: 15% (supplements, water, meal timing, consistency)

Not visible to user as a number unless they ask. The creature reflects it visually.

### Weekly Patterns to Detect
- Consistent nutrient deficiencies (iron low 4+ days = flag)
- Sleep debt accumulation (avg <6.5 hours over 5+ days)
- Exercise dropout (missed 3+ planned sessions)
- Late eating pattern (meals after 9pm, 3+ days)
- Mood-data correlation (bad sleep weeks → worse food → lower mood)
- Weekend effect (healthy weekdays, chaos weekends)

### When to Alert (text first)
- 3 consecutive nights of poor sleep
- Missed meals (no food logged by unusual time for them)
- Nutrient gap persisting >5 days
- Exercise gap >4 days (if they usually work out)
- Blood work due (based on last test date)
- Something genuinely concerning in their data

### When NOT to Alert
- One bad night of sleep (normal)
- One skipped workout (life happens)
- One unhealthy meal (zero judgment)
- Minor daily fluctuations in anything
- Don't stack multiple alerts in one day

## Future iOS Data Integration

When HealthKit data is available, the same rules apply but with richer inputs:
- Sleep: precise stages, HRV, RHR → more accurate sleep scoring
- Exercise: auto-detected workouts, heart rate zones → automatic logging
- Steps/calories: passive activity level → adjust nutrition recommendations
- Screen time: DeviceActivity API → doom scroll detection, bedtime habits
- Heart: resting heart rate trends → early stress/overtraining detection
- Weight: smart scale sync → automatic trend tracking

The brain doesn't change. It just gets more inputs.
