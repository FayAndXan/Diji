---
name: blood-work-analysis
description: Interpret blood work results, lab panels, and biomarkers. Triggered by blood work mentions, lab results, biomarker discussions, specific marker names (LDL, ferritin, HbA1c, CRP, etc.), "my results came back", or blood test photos/PDFs. Flags out-of-range values, connects to diet and lifestyle, and suggests retesting timelines.
---

# Blood Work Analysis

When a user shares blood work results (photo, PDF, typed values, or asks about specific markers), follow this process.

## Step 1: Extract and organize all values

If photo/PDF: extract every marker value you can read. Ask about anything illegible.
If typed: confirm you have all the markers they want reviewed.

Organize into categories:
- **Metabolic:** Fasting glucose, HbA1c, insulin, HOMA-IR
- **Lipids:** Total cholesterol, LDL, HDL, triglycerides, ApoB, Lp(a)
- **Inflammation:** hsCRP, ESR, homocysteine
- **Liver:** ALT, AST, GGT, bilirubin, albumin
- **Kidney:** Creatinine, eGFR, BUN, uric acid
- **Thyroid:** TSH, Free T3, Free T4
- **Hormones:** Testosterone (total/free), DHEA-S, cortisol, estradiol
- **Iron:** Ferritin, serum iron, TIBC, transferrin saturation
- **Vitamins:** 25-OH Vitamin D, B12, folate
- **CBC:** WBC, RBC, hemoglobin, hematocrit, platelets, MCV, MCH

## Step 2: Flag out-of-range values

For each marker, use web_search for current optimal ranges (not just lab reference ranges — optimal and lab ranges differ):
`curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"optimal [marker name] range longevity"}'`

Flag three categories:
- 🔴 **Out of range** — outside lab reference range
- 🟡 **Suboptimal** — within lab range but outside optimal longevity range
- 🟢 **Optimal** — within ideal longevity targets

## Step 3: Compare to previous results

Read previous blood work from `{baseDir}/../../data/bloodwork-*.json` files.
- Show trend direction for each marker (↑ improving, ↓ worsening, → stable)
- Flag significant changes (>10% shift in either direction)
- Calculate days since last test

## Step 4: Connect to diet and lifestyle

Cross-reference flagged markers with the user's recent data:
- Read `{baseDir}/../../data/meals-*.json` — are they eating foods that help or hurt their flagged markers?
- Read `{baseDir}/../../data/supplements-stack.json` — are supplements addressing deficiencies?
- Consider sleep patterns from `{baseDir}/../../data/sleep-*.json`
- Consider exercise from `{baseDir}/../../data/workouts-*.json`

Specific connections to make:
- High LDL → check omega-3 intake, saturated fat consumption, fiber intake
- High ferritin → check iron intake from food + supplements, vitamin C timing with iron
- Low vitamin D → check supplement dose, sun exposure, fat intake (absorption)
- High glucose/HbA1c → check carb intake patterns, post-meal activity, sleep quality
- High CRP → check processed food intake, sleep quality, stress signals, omega-3 intake
- Low B12 → check if plant-based diet, check if on metformin

## Step 5: Actionable recommendations

For each flagged marker, provide:
1. What it means in plain language (not medical jargon)
2. Specific foods to add or avoid
3. Supplements to consider (use web_search first)
4. Lifestyle changes (sleep, exercise, stress)
5. When to retest

Use web_search for evidence-based interventions:
`curl -s http://172.17.0.1:3900/search -X POST -H 'Content-Type: application/json' -d '{"query":"how to improve [marker] naturally evidence-based"}'`

## Step 6: Suggest retesting timeline

- Markers that changed significantly → retest in 3 months
- Markers responding to new interventions → retest in 3-6 months
- Stable optimal markers → retest in 6-12 months
- Set a note in memory for retest reminders

## Step 7: Store results

Write to `{baseDir}/../../data/bloodwork-YYYY-MM-DD.json`:
```json
{
  "date": "YYYY-MM-DD",
  "lab": "lab name if known",
  "markers": {
    "category": {
      "marker_name": {"value": 4.18, "unit": "mmol/L", "flag": "high|low|optimal", "refRange": "0-5.0", "optimalRange": "..."}
    }
  },
  "nextRetest": "YYYY-MM-DD",
  "notes": "..."
}
```

## Important Rules

- ALWAYS say "talk to your doctor about [specific concern]" for clinical interpretation
- Never diagnose. You interpret data and suggest questions for their doctor.
- Never say "take this drug" or "stop taking that medication"
- CAN say: "based on your blood work, ask your doctor about X"
- CAN flag interactions: "that supplement + your medication could interact"
- Use web_search for ALL specific claims about biomarker ranges and interventions
