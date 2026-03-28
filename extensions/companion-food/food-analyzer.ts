import OpenAI from 'openai';
import { lookupFood } from './nutrient-db';

// ─── Types ───────────────────────────────────────────────────────

interface FoodItem {
  name: string;
  estimatedGrams: number | null;  // null = ask user
  confidence: string;
}

interface NutrientProfile {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  vitaminA: number | null;
  vitaminC: number | null;
  vitaminD: number | null;
  vitaminE: number | null;
  vitaminK: number | null;
  vitaminB6: number | null;
  vitaminB12: number | null;
  folate: number | null;
  iron: number | null;
  calcium: number | null;
  magnesium: number | null;
  potassium: number | null;
  zinc: number | null;
  sodium: number | null;
  saturatedFat: number | null;
  omega3: number | null;
}

// ─── Step 1: Identify food (returns question to user) ────────────

export async function identifyFood(imageBase64: string, mimeType: string = 'image/jpeg'): Promise<{ items: FoodItem[], description: string, askMessage: string }> {
  const client = new OpenAI();
  
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` }
        },
        {
          type: 'text',
          text: `Analyze this meal photo. List EVERY ingredient you can see, separately.

For each ingredient, identify it as specifically as possible. If you can identify a sauce, name the cuisine and type. If you're unsure, describe what you see (color, texture).

Return ONLY valid JSON, no markdown:
{"description": "one line meal description", "items": [{"name": "specific ingredient", "confidence": "high|medium|low"}]}

RULES:
- List ingredients INDIVIDUALLY. Never group them.
- For sauces you're unsure about, say what you see: "green sauce (possibly Thai seafood dipping sauce)"
- Be specific: "salmon sashimi slices" not "fish", "cherry tomatoes" not "vegetables"
- Count items when possible: "8 salmon sashimi slices" not just "salmon sashimi"`
        }
      ]
    }]
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse: ' + text);
  
  const parsed = JSON.parse(jsonMatch[0]);
  const items: FoodItem[] = parsed.items.map((i: any) => ({
    name: i.name,
    estimatedGrams: null,
    confidence: i.confidence
  }));

  // Build the ask message
  let ask = `i see:\n`;
  items.forEach((item, i) => {
    const unsure = item.confidence !== 'high' ? ' (not 100% sure)' : '';
    ask += `${i + 1}. ${item.name}${unsure}\n`;
  });
  ask += `\nhow much of each? give me grams, or just say "small/medium/large" and i'll estimate. if i got something wrong, tell me.`;

  return { items, description: parsed.description, askMessage: ask };
}

// ─── Step 2: Parse user's weight response ────────────────────────

export async function parseUserWeights(items: FoodItem[], userResponse: string): Promise<FoodItem[]> {
  const client = new OpenAI();
  
  const itemList = items.map((item, i) => `${i + 1}. ${item.name}`).join('\n');
  
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: `You match user-provided food weights to a list of identified ingredients. The user might give exact grams, approximate descriptions (small/medium/large), total plate weight, or corrections to ingredient names.

Convert size descriptions to grams:
- "small" = 50-80g for proteins, 30-50g for vegetables, 15-20g for sauces
- "medium" = 100-150g for proteins, 80-120g for vegetables, 30g for sauces  
- "large" = 200-300g for proteins, 150-250g for vegetables, 50g for sauces

If the user corrects an ingredient name (e.g. "that's not wasabi, it's Thai seafood sauce"), use the corrected name.
If the user gives a total weight, split proportionally.

Return ONLY JSON: {"items": [{"name": "ingredient name (corrected if user fixed it)", "grams": 150}]}`
      },
      {
        role: 'user',
        content: `Ingredients identified:\n${itemList}\n\nUser says: "${userResponse}"`
      }
    ]
  });

  const text = response.choices[0]?.message?.content || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse weights: ' + text);
  
  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.items.map((i: any) => ({
    name: i.name,
    estimatedGrams: i.grams,
    confidence: 'user-provided'
  }));
}

// ─── Step 3: Calculate nutrients with confirmed weights ──────────

export async function calculateNutrients(items: FoodItem[]): Promise<string> {
  console.log('[Food] Calculating nutrients...');
  
  const itemNutrients: { item: FoodItem, nutrients: NutrientProfile }[] = [];
  
  for (const item of items) {
    if (!item.estimatedGrams) continue;
    const profile = getNutrients(item.name, item.estimatedGrams);
    itemNutrients.push({ item, nutrients: profile });
    console.log(`  ${item.name} (${item.estimatedGrams}g): ${profile.calories} cal`);
  }
  
  const totalNutrients = sumNutrients(itemNutrients.map(x => x.nutrients));
  console.log(`[Food] Total: ${totalNutrients.calories} cal, ${totalNutrients.protein}g protein`);
  
  // Generate personality response
  const personalityResponse = await generatePersonalityResponse(
    items.map(i => i.name).join(', '),
    totalNutrients
  );
  
  return formatResponse(totalNutrients, itemNutrients, personalityResponse);
}

// ─── Nutrient lookup (local DB, no API needed) ───────────────────

function getNutrients(foodName: string, grams: number): NutrientProfile {
  const scale = grams / 100;
  const local = lookupFood(foodName);
  
  if (local) {
    console.log(`  [DB] ✓ ${foodName}`);
    const s = (v: number | undefined) => v != null ? Math.round(v * scale * 10) / 10 : null;
    const si = (v: number | undefined) => v != null ? Math.round(v * scale) : null;
    return {
      calories: Math.round(local.calories * scale),
      protein: Math.round(local.protein * scale * 10) / 10,
      carbs: Math.round(local.carbs * scale * 10) / 10,
      fat: Math.round(local.fat * scale * 10) / 10,
      fiber: Math.round(local.fiber * scale * 10) / 10,
      sugar: Math.round(local.sugar * scale * 10) / 10,
      vitaminA: si(local.vitaminA), vitaminC: s(local.vitaminC),
      vitaminD: s(local.vitaminD), vitaminE: s(local.vitaminE),
      vitaminK: si(local.vitaminK), vitaminB6: s(local.vitaminB6),
      vitaminB12: s(local.vitaminB12), folate: si(local.folate),
      iron: s(local.iron), calcium: si(local.calcium),
      magnesium: si(local.magnesium), potassium: si(local.potassium),
      zinc: s(local.zinc), sodium: si(local.sodium),
      saturatedFat: s(local.saturatedFat), omega3: s(local.omega3)
    };
  }
  
  console.log(`  [DB] ✗ ${foodName} (no match)`);
  return {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
    vitaminA: null, vitaminC: null, vitaminD: null, vitaminE: null,
    vitaminK: null, vitaminB6: null, vitaminB12: null, folate: null,
    iron: null, calcium: null, magnesium: null, potassium: null,
    zinc: null, sodium: null, saturatedFat: null, omega3: null
  };
}

// ─── Sum nutrients ───────────────────────────────────────────────

function sumNutrients(profiles: NutrientProfile[]): NutrientProfile {
  const sum: NutrientProfile = {
    calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
    vitaminA: 0, vitaminC: 0, vitaminD: 0, vitaminE: 0, vitaminK: 0,
    vitaminB6: 0, vitaminB12: 0, folate: 0,
    iron: 0, calcium: 0, magnesium: 0, potassium: 0, zinc: 0, sodium: 0,
    saturatedFat: 0, omega3: null
  };
  
  for (const p of profiles) {
    sum.calories += p.calories;
    sum.protein += p.protein;
    sum.carbs += p.carbs;
    sum.fat += p.fat;
    sum.fiber += p.fiber;
    sum.sugar += p.sugar;
    const add = (key: keyof NutrientProfile) => {
      if (p[key] != null && typeof p[key] === 'number') {
        (sum as any)[key] = ((sum as any)[key] || 0) + (p[key] as number);
      }
    };
    add('vitaminA'); add('vitaminC'); add('vitaminD'); add('vitaminE');
    add('vitaminK'); add('vitaminB6'); add('vitaminB12'); add('folate');
    add('iron'); add('calcium'); add('magnesium'); add('potassium');
    add('zinc'); add('sodium'); add('saturatedFat'); add('omega3');
  }
  
  sum.protein = Math.round(sum.protein * 10) / 10;
  sum.carbs = Math.round(sum.carbs * 10) / 10;
  sum.fat = Math.round(sum.fat * 10) / 10;
  return sum;
}

// ─── Daily values ────────────────────────────────────────────────

const DV: Record<string, number> = {
  calories: 2000, protein: 50, carbs: 275, fat: 78, fiber: 28,
  vitaminA: 900, vitaminC: 90, vitaminD: 20, vitaminE: 15, vitaminK: 120,
  vitaminB6: 1.7, vitaminB12: 2.4, folate: 400,
  iron: 18, calcium: 1300, magnesium: 420, potassium: 4700, zinc: 11, sodium: 2300
};

function pct(value: number | null, key: string): string {
  if (value == null || value === 0) return '—';
  const daily = DV[key];
  if (!daily) return '—';
  return `${Math.round((value / daily) * 100)}%`;
}

// ─── Format output ───────────────────────────────────────────────

function formatResponse(
  total: NutrientProfile,
  items: { item: FoodItem, nutrients: NutrientProfile }[],
  personality: string
): string {
  let r = '';
  
  // Per-ingredient
  r += `📋 breakdown:\n`;
  for (const { item, nutrients } of items) {
    r += `  ${item.name} — ${item.estimatedGrams}g → ${nutrients.calories} cal, ${nutrients.protein}g P\n`;
  }
  
  // Totals
  r += `\n🔥 total: ${total.calories} cal · ${total.protein}g protein · ${total.carbs}g carbs · ${total.fat}g fat\n`;
  r += `  fiber ${total.fiber}g · sugar ${total.sugar}g`;
  if (total.saturatedFat) r += ` · sat fat ${total.saturatedFat}g`;
  r += '\n\n';
  
  // Vitamins
  const vits: string[] = [];
  if (total.vitaminA) vits.push(`A ${pct(total.vitaminA, 'vitaminA')}`);
  if (total.vitaminC) vits.push(`C ${pct(total.vitaminC, 'vitaminC')}`);
  if (total.vitaminD) vits.push(`D ${pct(total.vitaminD, 'vitaminD')}`);
  if (total.vitaminE) vits.push(`E ${pct(total.vitaminE, 'vitaminE')}`);
  if (total.vitaminK) vits.push(`K ${pct(total.vitaminK, 'vitaminK')}`);
  if (total.vitaminB6) vits.push(`B6 ${pct(total.vitaminB6, 'vitaminB6')}`);
  if (total.vitaminB12) vits.push(`B12 ${pct(total.vitaminB12, 'vitaminB12')}`);
  if (total.folate) vits.push(`folate ${pct(total.folate, 'folate')}`);
  if (vits.length > 0) r += `💊 vitamins: ${vits.join(' · ')}\n`;
  
  // Minerals
  const mins: string[] = [];
  if (total.iron) mins.push(`iron ${pct(total.iron, 'iron')}`);
  if (total.calcium) mins.push(`calcium ${pct(total.calcium, 'calcium')}`);
  if (total.magnesium) mins.push(`mag ${pct(total.magnesium, 'magnesium')}`);
  if (total.potassium) mins.push(`potassium ${pct(total.potassium, 'potassium')}`);
  if (total.zinc) mins.push(`zinc ${pct(total.zinc, 'zinc')}`);
  if (mins.length > 0) r += `⚡ minerals: ${mins.join(' · ')}\n`;
  
  // Unmatched items
  const unmatched = items.filter(x => x.nutrients.calories === 0);
  if (unmatched.length > 0) {
    r += `\n⚠️ no nutrient data for: ${unmatched.map(x => x.item.name).join(', ')}\n`;
  }
  
  r += `\n${personality}`;
  
  return r;
}

// ─── Personality ─────────────────────────────────────────────────

async function generatePersonalityResponse(description: string, nutrients: NutrientProfile): Promise<string> {
  const client = new OpenAI();
  
  const highlights: string[] = [];
  if (nutrients.calories > 800) highlights.push('high calorie');
  if (nutrients.calories < 300) highlights.push('light meal');
  if (nutrients.protein > 30) highlights.push('protein loaded');
  if (nutrients.protein < 10) highlights.push('low protein');
  if (nutrients.fiber > 8) highlights.push('good fiber');
  if (nutrients.iron && nutrients.iron > 5) highlights.push('good iron');
  if (nutrients.vitaminC && nutrients.vitaminC > 45) highlights.push('vitamin C rich');
  if (nutrients.sodium && nutrients.sodium > 900) highlights.push('high sodium');
  if (nutrients.sugar > 20) highlights.push('sugary');
  if (nutrients.omega3 && nutrients.omega3 > 1) highlights.push('omega-3 rich');
  
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 80,
    messages: [
      {
        role: 'system',
        content: `You're a wellness companion. Warm, direct, slightly teasing. 1 sentence max. Lowercase. Use "..." for trailing thoughts. No exclamation marks. No "great choice." Be specific about the meal, not generic.`
      },
      {
        role: 'user',
        content: `Meal: ${description}. ${nutrients.calories} cal, ${nutrients.protein}g protein. Notable: ${highlights.join(', ') || 'balanced'}. React briefly.`
      }
    ]
  });
  
  return response.choices[0]?.message?.content || "noted.";
}

// ─── Full two-step flow for CLI testing ──────────────────────────

async function fullFlow(imagePath: string) {
  const { readFileSync } = require('fs');
  const { extname } = require('path');
  const readline = require('readline');
  
  const ext = extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const imageData = readFileSync(imagePath).toString('base64');
  
  // Step 1: Identify
  console.log('[Step 1] Analyzing photo...\n');
  const { items, description, askMessage } = await identifyFood(imageData, mimeType);
  console.log('═'.repeat(50));
  console.log(askMessage);
  console.log('═'.repeat(50));
  
  // Step 2: Get user input
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const userInput: string = await new Promise(resolve => {
    rl.question('\nYour response: ', (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
  
  // Step 3: Parse weights
  console.log('\n[Step 2] Understanding your portions...');
  const weightedItems = await parseUserWeights(items, userInput);
  
  // Step 4: Calculate
  console.log('\n[Step 3] Calculating nutrients...\n');
  const result = await calculateNutrients(weightedItems);
  
  console.log('═'.repeat(50));
  console.log(result);
}

// ─── Non-interactive test (simulates user response) ──────────────

async function testFlow(imagePath: string, simulatedResponse: string) {
  const { readFileSync } = require('fs');
  const { extname } = require('path');
  
  const ext = extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const imageData = readFileSync(imagePath).toString('base64');
  
  // Step 1
  console.log('[Step 1] Analyzing photo...\n');
  const { items, askMessage } = await identifyFood(imageData, mimeType);
  console.log(askMessage);
  
  // Step 2
  console.log(`\n[User says]: "${simulatedResponse}"\n`);
  const weightedItems = await parseUserWeights(items, simulatedResponse);
  
  // Step 3
  const result = await calculateNutrients(weightedItems);
  console.log('═'.repeat(50));
  console.log(result);
}

// ─── CLI ─────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: npx tsx food-analyzer.ts <image> [simulated-response]');
    process.exit(1);
  }
  
  if (args[1]) {
    testFlow(args[0], args[1]).catch(e => { console.error(e); process.exit(1); });
  } else {
    fullFlow(args[0]).catch(e => { console.error(e); process.exit(1); });
  }
}
