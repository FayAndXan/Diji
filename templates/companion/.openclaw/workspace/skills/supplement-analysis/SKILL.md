---
name: supplement-analysis
description: Deep 7-step supplement analysis. Triggered by supplement mentions, vitamin names, supplement photos, "what should I take", stack reviews, or supplement brand/product names. Identifies ingredients, flags fillers, cross-references blood work, checks interactions, compares to Blueprint targets, gives verdict, and stores the stack.
---

# Supplement Analysis — Full 7-Step Process

When a user mentions a supplement, vitamin, mineral, sends a supplement photo, asks about their stack, or names a specific product/brand, follow ALL 7 steps. No shortcuts.

## Step 1: Find EVERYTHING about the supplement

- If user sends a photo: identify the product name and brand from the label
- ALWAYS search Spectrawl for the exact product:
  `curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"[product name] supplement ingredients nutritional facts"}'`
- Pull the complete nutritional facts: every active ingredient with exact dose and % DV
- List every inactive/other ingredient (fillers, binders, coatings)
- If you can't find the exact product online, ask the user for a clearer photo of the back label

## Step 2: Flag bad ingredients

Check for these fillers and flag them with an explanation of WHY they're concerning:
- titanium dioxide, magnesium stearate, artificial colors (Red 40, Yellow 5, Blue 1)
- carrageenan, hydrogenated oils, high-fructose corn syrup, BHT/BHA
- silicon dioxide (excess), talc

## Step 3: Cross-reference with blood work

Read the user's blood work from `{baseDir}/../../data/bloodwork-2026-03-05.json` (or most recent bloodwork file in data/).

Check EVERY ingredient against their blood markers:
- High ferritin → flag iron AND vitamin C (increases iron absorption)
- High LDL → flag anything that worsens lipids
- High WBC → flag anything affecting immune response
- Low vitamin D → confirm D3 dose is adequate
- Search Spectrawl for any ingredient-blood marker interactions you're unsure about:
  `curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"[ingredient] effect on [blood marker]"}'`

## Step 4: Check supplement-to-supplement interactions

Read the current stack from `{baseDir}/../../data/supplements-stack.json` if it exists.

Key interactions to check:
- Calcium blocks iron absorption → separate by 2+ hours
- Zinc depletes copper → check if stack covers copper
- Vitamin D needs K2 → confirm both present
- Magnesium and calcium compete → timing matters
- Ashwagandha + anything sedating → flag for nighttime only
- Blood thinners + omega-3/vitamin E/vitamin K → flag, suggest doctor consult
- Thyroid meds + calcium/iron/magnesium → separate by 4 hours
- Search Spectrawl for any interaction you're not certain about

## Step 5: Compare against Blueprint protocol targets

Compare the user's total daily intake (supplements + food logged in data/meals-*.json) against Blueprint recommended ranges.

Search Spectrawl for current Blueprint protocol targets:
`curl -s http://localhost:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"Bryan Johnson Blueprint supplement protocol current doses"}'`

- Flag if OVER recommended daily intake for any nutrient
- Flag if UNDER despite supplementing (wrong dose, poor absorption form)
- Note absorption form quality (e.g., magnesium oxide = poor, glycinate = good)

## Step 6: Give a clear verdict per supplement

For each supplement, give ONE verdict:
- **KEEP** — good product, right dose, no issues
- **REPLACE** — concept is right but product is bad (search Spectrawl for a better alternative)
- **DROP** — not needed, redundant, or harmful given their profile
- **ADJUST DOSE** — say exactly how (increase/decrease, new target)

## Step 7: Store and track

Write the full stack to `{baseDir}/../../data/supplements-stack.json` with this format:
```json
{
  "lastUpdated": "YYYY-MM-DD",
  "supplements": [
    {
      "name": "...",
      "brand": "...",
      "ingredients": [{"name": "...", "dose": "...", "unit": "...", "percentDV": "..."}],
      "fillers": ["..."],
      "flagged": ["..."],
      "verdict": "KEEP|REPLACE|DROP|ADJUST",
      "notes": "...",
      "timing": "morning|evening|with meals",
      "addedDate": "YYYY-MM-DD"
    }
  ]
}
```

Ask about timing: "when do you take these?" — timing matters for absorption.

## Evidence Tiers (for context)

- **Tier 1 (strong):** Vitamin D3, Omega-3, Magnesium, Creatine
- **Tier 2 (good, individual):** Collagen, K2, Probiotics, Zinc, B-complex
- **Tier 3 (emerging):** NMN/NR, Ashwagandha, Berberine, Lion's Mane
- **Tier 4 (marketing > evidence):** Most greens powders, "fat burners", "testosterone boosters", "detox" anything

When discussing tier, be honest: "pretty solid evidence" / "depends on your situation" / "interesting but early days" / "honestly, the evidence isn't there"

## Timing Rules

- Morning with food: B vitamins, zinc, iron, vitamin C, CoQ10
- Morning empty stomach: probiotics (strain-dependent)
- With fat-containing meal: D3, K2, vitamin E, vitamin A, omega-3
- Evening: magnesium glycinate (for sleep), collagen (anytime)
- Separate by 2+ hours: iron and calcium

## What NOT to do

- Don't just say "looks good" or "solid stack" — go through all 7 steps
- Don't skip the nutritional facts panel
- Don't ignore fillers
- Don't forget to cross-reference with blood work
- Don't recommend supplements without searching Spectrawl first
- Never push supplements. User asks, you inform.
- Always mention "check with your doctor" for anything beyond basic vitamins
