---
name: food-analysis
description: Analyze food photos or meal descriptions. Triggered by food photos, meal descriptions, "I ate...", "I had...", food logging, calorie questions, or nutrition questions about specific foods. Identifies ingredients, asks for gram weights, calculates full macro + micro breakdown including ALL 13 vitamins and 12 minerals, and writes to data file immediately.
---

# Food Analysis — Full Nutrient Breakdown

When a user sends a food photo or describes a meal, follow these steps strictly. No shortcuts.

## Step 1: IDENTIFY

Look at the photo or parse the description. List every ingredient individually.
- Be specific: "teriyaki chicken" not just "chicken"
- For sauces, dressings, or anything uncertain — describe what you see and ask
- For complex dishes, break down into components

## Step 2: ASK FOR WEIGHTS (same message as Step 1)

In the SAME message where you identify ingredients, ask for gram weights:
- "how much of each roughly? in grams if you can"
- Check food memory in `{baseDir}/../../data/food-memory.json` — if they've logged this food before, suggest: "[food] again? [X]g like last time?"
- NEVER guess weights. NEVER say "~150g" or "about 1.5 cups"
- NEVER present a calorie estimate before the user tells you weights
- **#1 rule: ASK, DON'T GUESS**
- If user doesn't know weights: one follow-up max, then estimate with ~ markers

## Step 3: CALCULATE (only after user confirms weights)

Scale per 100g nutrient values to actual grams. Show this format:

```
📋 breakdown:
  [food] — [grams]g → [calories] cal, [protein]g P

🔥 total: [cal] cal · [protein]g protein · [carbs]g carbs · [fat]g fat
  fiber [X]g · sugar [X]g

💊 vitamins (amount + % DV):
  A [amount] ([%]) · C [amount] ([%]) · D [amount] ([%]) · E [amount] ([%])
  K [amount] ([%]) · B1 [amount] ([%]) · B2 [amount] ([%]) · B3 [amount] ([%])
  B5 [amount] ([%]) · B6 [amount] ([%]) · B12 [amount] ([%]) · Folate [amount] ([%])
  Choline [amount] ([%])
  DV: A 900mcg, C 90mg, D 20mcg, E 15mg, K 120mcg, B1 1.2mg, B2 1.3mg, B3 16mg, B5 5mg, B6 1.7mg, B12 2.4mcg, Folate 400mcg, Choline 550mg

⚡ minerals (amount + % DV):
  Calcium [amount] ([%]) · Iron [amount] ([%]) · Magnesium [amount] ([%])
  Phosphorus [amount] ([%]) · Potassium [amount] ([%]) · Sodium [amount] ([%])
  Zinc [amount] ([%]) · Selenium [amount] ([%]) · Manganese [amount] ([%])
  Copper [amount] ([%]) · Chromium [amount] ([%]) · Iodine [amount] ([%])
  DV: Ca 1300mg, Fe 18mg, Mg 420mg, P 1250mg, K 4700mg, Na 2300mg, Zn 11mg, Se 55mcg, Mn 2.3mg, Cu 0.9mg, Cr 35mcg, I 150mcg
```

- If food isn't in database, estimate and mark with ~
- After breakdown, ONE brief personality comment (warm, not preachy)
- NEVER skip vitamins/minerals section

## Step 4: WRITE TO DATA FILE (immediately after showing breakdown)

Write to `{baseDir}/../../data/meals-YYYY-MM-DD.json` IMMEDIATELY. Before your next reply. Not optional.

Format:
```json
{
  "meals": [
    {
      "timestamp": "ISO-8601",
      "items": [
        {"name": "...", "grams": 150, "calories": 312, "protein": 31, "carbs": 0, "fat": 5.4, "fiber": 0}
      ],
      "totals": {"calories": 500, "protein": 45, "carbs": 30, "fat": 15, "fiber": 3},
      "vitamins": {"A_mcg": 0, "C_mg": 0, "D_mcg": 0, ...},
      "minerals": {"calcium_mg": 0, "iron_mg": 0, ...}
    }
  ]
}
```

Also update food memory in `{baseDir}/../../data/food-memory.json`:
```json
[{"name": "salmon", "lastGrams": 200, "count": 3, "lastSeen": "2026-03-20"}]
```

## Step 5: WRITE TO APPLE HEALTH (immediately after data file)

After writing to the data file, push nutrients to Apple Health via the companion server so the user sees it in their Health app:

```bash
curl -s -X POST http://localhost:3950/api/internal/command -H 'Content-Type: application/json' -d '{
  "telegramUsername":"USERNAME",
  "type":"write_meal",
  "payload":{
    "meal":"{\"calories\":TOTAL_CAL,\"protein\":PROTEIN_G,\"fat\":FAT_G,\"carbs\":CARBS_G,\"fiber\":FIBER_G,\"sodium\":SODIUM_MG,\"iron\":IRON_MG,\"calcium\":CALCIUM_MG,\"potassium\":POTASSIUM_MG,\"magnesium\":MAGNESIUM_MG,\"zinc\":ZINC_MG,\"vitaminA\":VITA_MCG,\"vitaminC\":VITC_MG,\"vitaminD\":VITD_MCG,\"vitaminB12\":VITB12_MCG}"
  }
}'
```

Replace USERNAME with the user's Telegram username. Include ALL nutrients you calculated. This is NOT optional — every meal logged must be written back to Apple Health.

## Step 6: Connect to blood work (if relevant)

Check `{baseDir}/../../data/bloodwork-2026-03-05.json` for flags:
- High ferritin → flag if meal is high in iron. "heads up, that's high in iron. with your ferritin levels, maybe swap for chicken instead."
- High LDL → suggest omega-3 rich alternatives
- Low vitamin D → note if meal contains D sources
- Don't lecture. Weave naturally. One mention per meal max.

## What NEVER to Do

- NEVER estimate portions from a photo
- NEVER present calories before user confirms weights
- NEVER use cups/tablespoons — grams only
- NEVER say "great choice" or moralize about food
- NEVER skip the vitamin/mineral section
- Pizza is fine. Ice cream is fine. Just log it honestly.
