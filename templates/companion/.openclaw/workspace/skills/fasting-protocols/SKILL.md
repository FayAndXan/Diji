---
name: fasting-protocols
description: Fasting guidance and protocols. Triggered by fasting mentions, intermittent fasting, time-restricted eating, FMD, fasting mimicking diet, "should I fast", autophagy, Longo, ProLon, water fasting, or eating window discussions. Covers safety hierarchy, when to recommend what, and protocol details.
---

# Fasting Protocols

When a user asks about fasting, present options with risks. Safety first. The default safe recommendation for longevity fasting is Longo's FMD.

## Fasting Types (safety hierarchy, safest first)

### 1. Time-Restricted Eating (TRE) — safest, daily practice
- Eating within a set window: 10-12 hours (e.g., 8am-8pm)
- Longo recommends this as daily structure
- Nothing within 3-4 hours of bedtime
- Evidence: helps with weight management, glucose regulation, circadian rhythm
- Safe for almost everyone. No supervision needed.

### 2. Intermittent Fasting (IF) — safe, popular
- 16:8 or 18:6 eating windows
- Longo considers benefit plateaus vs TRE for longevity specifically
- Good for weight management, some metabolic benefits
- Safe for most people. Not for: pregnant/nursing, eating disorder history, underweight

### 3. Fasting Mimicking Diet (FMD) — Longo's specialty, the longevity recommendation
- 5-day program, done every 1-6 months depending on health status
- Day 1: ~1,100 cal (54% fat, 34% carb, 10% protein)
- Days 2-5: ~800 cal (56% fat, 36% carb, 9% protein)
- Body enters fasting mode while still eating
- Triggers: autophagy, stem cell regeneration, reduced IGF-1, reduced inflammation
- Clinical results: reduces body weight, body fat, blood pressure, IGF-1, fasting glucose, CRP, cholesterol, triglycerides
- Commercial: ProLon kit ($189-250). Can DIY with specific macro ratios.
- NOT for: pregnant/nursing, underweight, eating disorder history, type 1 diabetes, anyone on medication without doctor supervision
- Use web_search for current FMD research and protocols:
  `curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"Valter Longo FMD fasting mimicking diet protocol current research"}'`

### 4. Water Fasting (24-72h) — powerful but risky
- Zero calories for extended period
- Longo does NOT blanket oppose it but strongly discourages unsupervised multi-day water fasts
- Risks: muscle wasting, nutrient depletion, gallstones, blood pressure drops
- 24h: generally safe for healthy adults
- 48-72h: should be medically supervised
- ALWAYS say: "talk to your doctor before doing this"
- FMD achieves similar cellular benefits with less risk

### 5. Extended Water Fasting (3+ days) — medical supervision required
- Should ONLY be done at a fasting clinic or under medical supervision
- Longo runs a fasting clinic in Italy for this
- Not a DIY activity. Ever.
- ALWAYS discourage unsupervised extended fasting

### 6. Dry Fasting — DANGEROUS
- No food or water
- ALWAYS discourage this. No exceptions.
- Risk of dehydration, kidney damage, organ failure
- No legitimate longevity benefit over water fasting

## When to Recommend What

Check user's profile and health data before recommending:

**New to fasting → TRE (12h window)**
Start gentle. "try finishing dinner by 8pm and not eating until 8am. that's already a 12-hour fast."

**Wants weight management → IF (16:8)**
"16:8 works well for weight management. skip breakfast or have a late one."

**Wants longevity benefits → FMD**
"if you're serious about the longevity angle, Longo's FMD is the most researched option. 5 days, every few months."

**Has metabolic issues (high glucose, insulin resistance) → TRE + consider FMD**
Check blood work from `{baseDir}/../../data/bloodwork-*.json`. If glucose/HbA1c is elevated, TRE helps daily and FMD can help reset.

**On medication → ALWAYS consult doctor first**
"fasting affects how your body processes medications. talk to your doctor before changing your eating schedule significantly."

## Longo's Daily Longevity Diet Context

When discussing fasting, also mention Longo's daily eating framework:
- Mostly vegan + some fish (max 2-3x/week)
- Low protein under 65: 0.31-0.36g per pound bodyweight
- High complex carbs: whole grains, vegetables, legumes
- Good fats: 3 tbsp olive oil/day + 1 oz nuts/day
- 12h eating window max
- 2 meals/day if overweight + 2 snacks (<100cal). 3 meals/day if normal weight.

**Key tension with Blueprint:**
- Longo says LOW protein under 65 (cancer prevention via low IGF-1)
- Blueprint/Attia say HIGH protein (muscle preservation)
- Present BOTH perspectives. Let the user decide.

## Safety Checks Before Any Fasting Recommendation

Always verify:
1. Not pregnant/nursing
2. Not underweight (check `{baseDir}/../../data/user-profile.json`)
3. No eating disorder history
4. Not on diabetes medication (insulin, sulfonylureas)
5. Not on blood pressure medication without doctor guidance
6. Adequate hydration during any fast

Use web_search for contraindications if unsure:
`curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"fasting contraindications [user's condition]"}'`

## What NOT to Do

- Never recommend water fasting over 24h without saying "talk to your doctor"
- Never recommend dry fasting. Period.
- Never present fasting as a magic cure
- Never push fasting on someone with disordered eating patterns
- Never ignore medications when discussing fasting
- Don't mix protocols unprompted — stick to one recommendation
