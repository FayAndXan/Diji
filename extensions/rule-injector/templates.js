// Report templates for Bryan
// Rule: never exceed ~35 chars per line (mobile Telegram code block width)
// When a line would be too long, break it onto the next line with 2-space indent

export const MEAL_TEMPLATE = `
### MEAL FORMAT: Use a code block (triple backticks). Keep EVERY line under 35 characters. When a line is too long, break onto the next with 2-space indent. Example:

\\\`\\\`\\\`
🍽 Lunch

🥩 Beef soup (half, ~250ml)
  220 kcal | P:22g C:4g F:12g

🫘 Organ stir-fry (half, ~100g)
  120 kcal | P:14g C:5g F:5g

🐟 Fish w/ veg (half, ~120g)
  140 kcal | P:22g C:5g F:3g

───────────────────

🔥 480 kcal | 💪 58g protein
🥗 14g carbs | 🧈 20g fat
📊 2380 / 2200 kcal (108%) ✓

───────────────────

🧪 Vitamins (% DV)
A:45 · C:15 · D:3 · E:8
K:12 · B12:85✅ · Folate:18

🧪 Minerals (% DV)
Iron:42⚠️ · Zinc:35 · Se:40
Ca:8 · Mg:12 · K:15
Na:~800mg · P:20

───────────────────

⚠️ iron 42% — ferritin watch
✅ first time hitting target
\\\`\\\`\\\`

Then a SECOND message (not code block): short human comment, question, or callout.

KEY RULE: if any line is longer than 35 characters, break it. Food emoji + name + weight on line 1. Kcal + macros on indented line 2. Vitamins/minerals in groups of 3-4 per line. ALWAYS include the full vitamin and mineral panel.
`;

export const DAILY_TEMPLATE = `
### DAILY REPORT: Code block, max 35 chars/line.

\\\`\\\`\\\`
📊 Daily — March 22

🔥 Calories
  2380 / 2200 (108%) ✓
  ▓▓▓▓▓▓▓▓▓▓

💪 Protein
  118 / 118g (100%) ✓
  ▓▓▓▓▓▓▓▓▓▓

🛌 Sleep
  7.2h (deep:1.8 REM:1.5)
  quality: 78%
  ▓▓▓▓▓▓▓▓░░

🚶 Steps
  8,400
  ▓▓▓▓▓▓▓▓░░ 84%

💊 Supplements
  D3 ✅ Omega-3 ✅ Mg ❌

───────────────────

🧪 Nutrient Gaps
Low: Ca 35% · Mg 40%
High: Fe 120% ⚠️ ferritin
Good: B12 · Zn · Se

───────────────────

🏆 hit calorie target
⚠️ late dinner (11pm)
⚠️ missed magnesium
\\\`\\\`\\\`

Second message: human reaction.
`;

export const WEEKLY_TEMPLATE = `
### WEEKLY REPORT: Code block, max 35 chars/line.

\\\`\\\`\\\`
📊 Week of March 16–22

🔥 Calories
  avg 1,850 / 2,200 (84%) ↑
  ▓▓▓▓▓▓▓▓░░
  best: Sat 2,380
  worst: Wed 1,100

💪 Protein
  avg 95 / 118g (80%) →
  ▓▓▓▓▓▓▓▓░░

🛌 Sleep
  avg 6.8h (68%) ↓
  on-schedule: 4/7 nights
  ▓▓▓▓▓▓▓░░░

🚶 Steps
  avg 7,200 (72%) ↑
  best: Tue 14,200

💊 Supplements
  3/7 days complete
  ▓▓▓░░░░░░░ 43%

───────────────────

🧪 Nutrient Trends
Consistently low:
  Ca · Mg · Vit D
Good: B12 · Zn · protein
⚠️ Fe high 3 days (ferritin)

───────────────────

🏆 Wins
· veggies every single day
· hit calorie target Saturday
· two 13K+ step days

⚠️ Watch
· sweets 3x this week
· late dinners 2x after 10pm
· supplement consistency

───────────────────

📋 Focus Next Week
1. fix sleep tracking
2. real breakfast daily
3. restock omega-3
\\\`\\\`\\\`

Second message: human reaction.
`;

export const MONTHLY_TEMPLATE = `
### MONTHLY REPORT: Code block, max 35 chars/line.

\\\`\\\`\\\`
📊 March 2026

🔥 Calories
  avg 1,780 / 2,200 (81%)
  wk1: 1,600 → wk4: 1,950 ↑

💪 Protein
  avg 92 / 118g (78%)

⚖️ Weight
  73.5 → 73.8kg (+0.3)
  target: 78kg lean bulk

🛌 Sleep
  avg 6.5h (65%)
  tracking started wk4

🚶 Activity
  avg 6,800 steps/day
  workouts: 4 (target: 12)

💊 Supplements
  consistency: 35%
  gaps: omega-3, magnesium

───────────────────

🧪 Nutrient Averages (% DV)
✅ B12:110 · Zn:85 · Se:90
⚠️ Ca:40 · VitD:25 · Mg:45
⚠️ Fe:95 (ferritin watch)

🩸 Blood Work (Mar 5)
  Ferritin: still high
  LDL: needs omega-3
  Vit D: low despite supps

───────────────────

📈 Progress
· cals improving weekly
· veggies became habit
· sleep tracking set up

📉 Struggles
· supplement consistency
· late night eating
· workout frequency

───────────────────

🎯 April Goals
1. supps 20/30 days
2. avg cals > 2,000
3. 8+ workouts
\\\`\\\`\\\`

Second message: honest month summary.
`;

export const YEARLY_TEMPLATE = `
### YEARLY REPORT: Code block, max 35 chars/line.

\\\`\\\`\\\`
📊 2026 Year in Review

⚖️ Body
  Jan: 73.5 → Dec: 77.2kg
  (+3.7kg) bf: 16% → 13%

🔥 Nutrition
  avg 2,050 / 2,200 (93%)
  best mo: Aug (2,180)
  worst mo: Mar (1,780)

🛌 Sleep
  avg 7.1h (was 6.5 Mar)
  on-schedule: 72%

🚶 Activity
  avg 8,200 steps/day
  workouts: 156 total

💊 Supplements
  consistency: 68%
  best mo: Jul (90%)

───────────────────

🩸 Blood Work Trajectory
        Mar  Sep  Dec
Ferritin 285  220  180 ↓✅
LDL      142  128  115 ↓✅
Vit D     28   45   52 ↑✅
HbA1c   5.4  5.2      ↓✅

───────────────────

🧬 Bio Age Estimate
  Chronological: 36
  Biological: 32 (-4 years)

───────────────────

🏆 Biggest Wins
· protein became automatic
· sleep improved +40min avg
· ferritin trending down
· built workout habit

📉 Still Working On
· supplement consistency
· late night eating
· stress management

🎯 2027 Focus
1. hit 78kg lean
2. ferritin under 150
3. sleep avg 7.5h
\\\`\\\`\\\`

Second message: meaningful reflection.
`;
