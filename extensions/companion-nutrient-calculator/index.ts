// Companion Nutrient Calculator Plugin
// Detects food + grams in conversation, queries USDA FoodData Central API, injects accurate nutrient data

import { appendFileSync } from "fs";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-nutrient-calculator.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// Pattern: "food — Xg" or "Xg of food" or "food Xg" etc.
const FOOD_GRAM_PATTERNS = [
  /(\d+)\s*g\s+(?:of\s+)?([a-zA-Z][a-zA-Z\s]{2,30})/gi,
  /([a-zA-Z][a-zA-Z\s]{2,30})\s*[-—–]\s*(\d+)\s*g/gi,
  /([a-zA-Z][a-zA-Z\s]{2,30})\s+(\d+)\s*g\b/gi,
];

// Words that indicate the user is confirming food amounts
const CONFIRMATION_WORDS = [
  /(\d+)\s*g/i,
  /gram/i,
  /about\s+\d+/i,
  /roughly\s+\d+/i,
  /maybe\s+\d+/i,
];

interface FoodItem {
  name: string;
  grams: number;
}

function extractFoodItems(text: string): FoodItem[] {
  const items: FoodItem[] = [];
  const seen = new Set<string>();

  // Pattern: "200g salmon" or "salmon 200g" or "200g of salmon"
  const patterns = [
    /(\d{1,4})\s*g\s+(?:of\s+)?([a-zA-Z][a-zA-Z\s]{1,25}?)(?:\s*[,.\n]|$)/gi,
    /([a-zA-Z][a-zA-Z\s]{1,25}?)\s*[-—–:]\s*(\d{1,4})\s*g/gi,
    /([a-zA-Z][a-zA-Z\s]{1,25}?)\s+(\d{1,4})\s*g\b/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      let name: string, grams: number;
      // First pattern has grams first
      if (pattern === patterns[0]) {
        grams = parseInt(match[1]);
        name = match[2].trim().toLowerCase();
      } else {
        name = match[1].trim().toLowerCase();
        grams = parseInt(match[2]);
      }

      if (grams > 0 && grams < 5000 && name.length > 1 && !seen.has(name)) {
        seen.add(name);
        items.push({ name, grams });
      }
    }
  }

  return items;
}

async function searchUSDA(query: string): Promise<any | null> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=1&api_key=DEMO_KEY`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      debugLog(`USDA API error: ${response.status}`);
      return null;
    }
    const data = await response.json();
    if (data.foods && data.foods.length > 0) {
      return data.foods[0];
    }
    return null;
  } catch (err) {
    debugLog(`USDA fetch error: ${err}`);
    return null;
  }
}

function extractNutrients(food: any, grams: number): Record<string, string> {
  const nutrients: Record<string, string> = {};
  if (!food.foodNutrients) return nutrients;

  const multiplier = grams / 100;

  for (const n of food.foodNutrients) {
    const name = n.nutrientName || '';
    const value = (n.value || 0) * multiplier;
    const unit = n.unitName || '';

    if (value === 0) continue;

    // Map common nutrient names
    if (name.includes('Energy')) nutrients['calories'] = `${Math.round(value)} ${unit}`;
    if (name.includes('Protein')) nutrients['protein'] = `${value.toFixed(1)}g`;
    if (name.includes('Total lipid')) nutrients['fat'] = `${value.toFixed(1)}g`;
    if (name.includes('Carbohydrate')) nutrients['carbs'] = `${value.toFixed(1)}g`;
    if (name.includes('Fiber')) nutrients['fiber'] = `${value.toFixed(1)}g`;
    if (name.includes('Sugars, total')) nutrients['sugar'] = `${value.toFixed(1)}g`;
    if (name.includes('Calcium')) nutrients['calcium'] = `${value.toFixed(1)}mg`;
    if (name.includes('Iron')) nutrients['iron'] = `${value.toFixed(2)}mg`;
    if (name.includes('Magnesium')) nutrients['magnesium'] = `${value.toFixed(1)}mg`;
    if (name.includes('Phosphorus')) nutrients['phosphorus'] = `${value.toFixed(1)}mg`;
    if (name.includes('Potassium')) nutrients['potassium'] = `${value.toFixed(1)}mg`;
    if (name.includes('Sodium')) nutrients['sodium'] = `${value.toFixed(1)}mg`;
    if (name.includes('Zinc')) nutrients['zinc'] = `${value.toFixed(2)}mg`;
    if (name.includes('Selenium')) nutrients['selenium'] = `${value.toFixed(1)}mcg`;
    if (name.includes('Vitamin A')) nutrients['vitaminA'] = `${value.toFixed(1)}mcg RAE`;
    if (name.includes('Vitamin C')) nutrients['vitaminC'] = `${value.toFixed(1)}mg`;
    if (name.includes('Vitamin D')) nutrients['vitaminD'] = `${value.toFixed(1)}mcg`;
    if (name.includes('Vitamin E')) nutrients['vitaminE'] = `${value.toFixed(2)}mg`;
    if (name.includes('Vitamin K')) nutrients['vitaminK'] = `${value.toFixed(1)}mcg`;
    if (name.includes('Vitamin B-6')) nutrients['vitaminB6'] = `${value.toFixed(2)}mg`;
    if (name.includes('Vitamin B-12')) nutrients['vitaminB12'] = `${value.toFixed(2)}mcg`;
    if (name.includes('Folate')) nutrients['folate'] = `${value.toFixed(1)}mcg`;
    if (name.includes('Thiamin')) nutrients['vitaminB1'] = `${value.toFixed(2)}mg`;
    if (name.includes('Riboflavin')) nutrients['vitaminB2'] = `${value.toFixed(2)}mg`;
    if (name.includes('Niacin')) nutrients['vitaminB3'] = `${value.toFixed(2)}mg`;
    if (name.includes('Copper')) nutrients['copper'] = `${value.toFixed(3)}mg`;
    if (name.includes('Manganese')) nutrients['manganese'] = `${value.toFixed(3)}mg`;
    if (name.includes('Choline')) nutrients['choline'] = `${value.toFixed(1)}mg`;
  }

  return nutrients;
}

function getLastUserMessages(event: any, count: number = 3): string[] {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return [];

  const userMsgs: string[] = [];
  for (let i = messages.length - 1; i >= 0 && userMsgs.length < count; i--) {
    const msg = messages[i];
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        userMsgs.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        const text = msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
        if (text) userMsgs.push(text);
      }
    }
  }
  return userMsgs;
}

function hasRecentFoodContext(event: any): boolean {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return false;

  // Check last 6 messages for food photo or food discussion context
  const recent = messages.slice(-6);
  for (const msg of recent) {
    let text = '';
    if (typeof msg.content === 'string') text = msg.content;
    else if (Array.isArray(msg.content)) {
      const hasImage = msg.content.some((p: any) => p.type === 'image' || p.type === 'image_url');
      text = msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
      if (hasImage) return true;
    }
    if (/food|meal|ate|eat|calories|protein|grams|breakfast|lunch|dinner|snack/i.test(text)) {
      return true;
    }
  }
  return false;
}

export default function register(api: any) {
  debugLog("companion-nutrient-calculator plugin registered");

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      // Skip if last message isn't from user (heartbeat/cron)
      const messages = event?.messages;
      if (!messages || messages.length === 0) return;
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'user') return;

      const userMsgs = getLastUserMessages(event, 2);
      if (userMsgs.length === 0) return;

      const lastMsg = userMsgs[0];

      // Only activate if there's a food context and the message contains gram amounts
      const hasGrams = CONFIRMATION_WORDS.some(p => p.test(lastMsg));
      if (!hasGrams) return;

      if (!hasRecentFoodContext(event)) return;

      const items = extractFoodItems(lastMsg);
      if (items.length === 0) return;

      debugLog(`Found ${items.length} food items with grams: ${items.map(i => `${i.name}=${i.grams}g`).join(', ')}`);

      // Query USDA for each item (up to 5 to avoid rate limits)
      const results: string[] = [];
      for (const item of items.slice(0, 5)) {
        const usdaData = await searchUSDA(item.name);
        if (usdaData) {
          const nutrients = extractNutrients(usdaData, item.grams);
          if (Object.keys(nutrients).length > 0) {
            results.push(`USDA data for "${item.name}" (${item.grams}g, source: ${usdaData.description}):\n` +
              Object.entries(nutrients).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
          }
        }
      }

      if (results.length === 0) return;

      debugLog(`Got USDA data for ${results.length} items`);

      const injection = `
[USDA NUTRIENT DATA — USE THESE ACCURATE VALUES]
The companion-nutrient-calculator plugin queried USDA FoodData Central for accurate nutrient data.
Use these values instead of estimates when calculating the meal breakdown.

${results.join('\n\n')}

Note: USDA data is authoritative. Prefer these values over internal estimates. If a nutrient isn't listed, estimate and mark with ~.
`;

      return { appendSystemContext: injection };

    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
