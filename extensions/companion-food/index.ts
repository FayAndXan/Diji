// Companion Food Analyzer Plugin
// Injects food analysis instructions when user sends a photo

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "fs";
import { join } from "path";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-food.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

// ─── Nutrient Database (common foods per 100g) ───────────────────

const FOOD_DB: Record<string, any> = {
  "salmon": { calories: 208, protein: 20.4, carbs: 0, fat: 13.4, fiber: 0, sugar: 0, vitaminD: 11, vitaminB12: 3.2, vitaminB6: 0.6, iron: 0.3, calcium: 12, magnesium: 29, potassium: 363, zinc: 0.4, sodium: 59, omega3: 2.3 },
  "salmon sashimi": { calories: 127, protein: 20.5, carbs: 0, fat: 4.4, fiber: 0, sugar: 0, vitaminD: 11, vitaminB12: 3.2, vitaminB6: 0.6, iron: 0.3, calcium: 12, magnesium: 29, potassium: 363, zinc: 0.4, sodium: 59, omega3: 1.8 },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, vitaminB6: 0.6, vitaminB12: 0.3, iron: 1, calcium: 15, magnesium: 29, potassium: 256, zinc: 1, sodium: 74 },
  "chicken": { calories: 239, protein: 27, carbs: 0, fat: 14, fiber: 0, sugar: 0, vitaminB6: 0.5, vitaminB12: 0.3, iron: 1.3, calcium: 15, magnesium: 25, potassium: 229, zinc: 1.5, sodium: 82 },
  "teriyaki chicken": { calories: 180, protein: 26, carbs: 6, fat: 5, fiber: 0, sugar: 5, vitaminB6: 0.5, vitaminB12: 0.3, iron: 1.2, calcium: 18, magnesium: 28, potassium: 245, zinc: 1.3, sodium: 680 },
  "beef steak": { calories: 271, protein: 26, carbs: 0, fat: 18, fiber: 0, sugar: 0, vitaminB12: 2.6, iron: 2.6, calcium: 18, potassium: 318, zinc: 6.3, sodium: 57 },
  "egg": { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, sugar: 1.1, vitaminA: 160, vitaminD: 2, vitaminB12: 0.9, iron: 1.8, calcium: 56, zinc: 1.3, sodium: 124 },
  "white rice": { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0, iron: 0.2, magnesium: 12, potassium: 35 },
  "brown rice": { calories: 112, protein: 2.3, carbs: 24, fat: 0.8, fiber: 1.8, sugar: 0.4, magnesium: 39, potassium: 79, iron: 0.4 },
  "quinoa": { calories: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8, sugar: 0.9, folate: 42, iron: 1.5, magnesium: 64, potassium: 172, zinc: 1.1 },
  "pasta": { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, sugar: 0.6, iron: 1.3, magnesium: 18, potassium: 44 },
  "bread": { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, sugar: 5, iron: 3.6, calcium: 260, sodium: 491 },
  "potato": { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, sugar: 0.8, vitaminC: 20, vitaminB6: 0.3, iron: 0.8, potassium: 421 },
  "sweet potato": { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, sugar: 4.2, vitaminA: 709, vitaminC: 2.4, iron: 0.6, potassium: 337 },
  "broccoli": { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, sugar: 1.7, vitaminA: 31, vitaminC: 89, vitaminK: 102, folate: 63, iron: 0.7, calcium: 47, potassium: 316 },
  "spinach": { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4, vitaminA: 469, vitaminC: 28, vitaminK: 483, folate: 194, iron: 2.7, calcium: 99, magnesium: 79, potassium: 558 },
  "tomato": { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sugar: 2.6, vitaminA: 42, vitaminC: 14, vitaminK: 7.9, potassium: 237 },
  "lettuce": { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3, sugar: 0.8, vitaminA: 370, vitaminC: 9.2, vitaminK: 126, folate: 38, iron: 0.9, calcium: 36, potassium: 194 },
  "avocado": { calories: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7, sugar: 0.7, vitaminE: 2.1, vitaminK: 21, vitaminC: 10, folate: 81, potassium: 485 },
  "cucumber": { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, sugar: 1.7, vitaminC: 2.8, vitaminK: 16.4, potassium: 147 },
  "carrot": { calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8, sugar: 4.7, vitaminA: 835, vitaminC: 5.9, potassium: 320 },
  "bell pepper": { calories: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1, sugar: 4.2, vitaminA: 157, vitaminC: 128, vitaminB6: 0.3, folate: 46, potassium: 211 },
  "onion": { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7, sugar: 4.2, vitaminC: 7.4, potassium: 146 },
  "sugar snap peas": { calories: 42, protein: 2.8, carbs: 7.6, fat: 0.2, fiber: 2.6, sugar: 4, vitaminA: 54, vitaminC: 60, vitaminK: 25, folate: 42, iron: 2.1, calcium: 43, potassium: 200 },
  "kale": { calories: 49, protein: 4.3, carbs: 9, fat: 0.9, fiber: 3.6, sugar: 2.3, vitaminA: 500, vitaminC: 120, vitaminK: 817, iron: 1.5, calcium: 150, potassium: 491 },
  "olives": { calories: 115, protein: 0.8, carbs: 6, fat: 11, fiber: 3.2, sugar: 0, vitaminE: 3.8, iron: 3.3, calcium: 88, sodium: 735 },
  "banana": { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, vitaminB6: 0.4, vitaminC: 8.7, magnesium: 27, potassium: 358 },
  "apple": { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, vitaminC: 4.6, potassium: 107 },
  "orange": { calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, sugar: 9.4, vitaminC: 53, folate: 30, calcium: 40, potassium: 181 },
  "greek yogurt": { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2, vitaminB12: 0.8, calcium: 110, potassium: 141, zinc: 0.5 },
  "cheese": { calories: 402, protein: 25, carbs: 1.3, fat: 33, fiber: 0, sugar: 0.5, vitaminA: 265, vitaminB12: 1.1, calcium: 721, zinc: 3.1, sodium: 621 },
  "tofu": { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3, sugar: 0.6, calcium: 350, iron: 5.4, magnesium: 30, potassium: 121 },
  "chickpeas": { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, sugar: 4.8, folate: 172, iron: 2.9, calcium: 49, potassium: 291, zinc: 1.5 },
  "lentils": { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, sugar: 1.8, folate: 181, iron: 3.3, potassium: 369, zinc: 1.3 },
  "almonds": { calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 13, sugar: 4.4, vitaminE: 26, magnesium: 270, calcium: 269, iron: 3.7, zinc: 3.1 },
  "hummus": { calories: 166, protein: 7.9, carbs: 14, fat: 9.6, fiber: 6, sugar: 0.3, folate: 83, iron: 2.4, calcium: 38, potassium: 228, zinc: 1.8, sodium: 379 },
  "olive oil": { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, vitaminE: 14, vitaminK: 60 },
  "oats": { calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 11, sugar: 1, iron: 4.7, magnesium: 177, potassium: 429, zinc: 4 },
  "pizza": { calories: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, sugar: 3.6, calcium: 201, iron: 2.5, sodium: 598 },
  "burger": { calories: 295, protein: 17, carbs: 24, fat: 14, fiber: 1.3, sugar: 5, iron: 2.6, calcium: 75, sodium: 560 },
  "french fries": { calories: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, sugar: 0.3, vitaminC: 9.5, potassium: 579, sodium: 210 },
  "ice cream": { calories: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0.7, sugar: 21, calcium: 128, sodium: 80 },
  "pork": { calories: 242, protein: 27, carbs: 0, fat: 14, fiber: 0, sugar: 0, vitaminB12: 0.7, iron: 0.9, potassium: 362, zinc: 2.4, sodium: 62 },
  "shrimp": { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0, sugar: 0, vitaminB12: 1.1, iron: 0.5, calcium: 70, potassium: 259, zinc: 1.6, sodium: 111 },
  "tuna": { calories: 132, protein: 28.2, carbs: 0, fat: 1.3, fiber: 0, sugar: 0, vitaminD: 2.1, vitaminB12: 2.1, iron: 1.3, calcium: 12, potassium: 323, sodium: 47 },
  "milk": { calories: 42, protein: 3.4, carbs: 5, fat: 1, fiber: 0, sugar: 5, vitaminD: 1.2, vitaminB12: 0.5, calcium: 125, potassium: 150, sodium: 44 },
  "edamame": { calories: 121, protein: 12, carbs: 9, fat: 5, fiber: 5, sugar: 2, folate: 311, iron: 2.3, calcium: 63, magnesium: 64, potassium: 436, zinc: 1.4 },
  "nori": { calories: 35, protein: 5.8, carbs: 5.1, fat: 0.3, fiber: 0.3, sugar: 0.5, vitaminA: 260, vitaminC: 39, iron: 1.8, calcium: 70, magnesium: 2, potassium: 356, zinc: 1.1, sodium: 48 },
  "pickled ginger": { calories: 20, protein: 0.2, carbs: 4.6, fat: 0, fiber: 0.2, sugar: 2.5, sodium: 740 },
  "radish": { calories: 16, protein: 0.7, carbs: 3.4, fat: 0.1, fiber: 1.6, sugar: 1.9, vitaminC: 15, potassium: 233, calcium: 25 },
  "sesame seeds": { calories: 573, protein: 18, carbs: 23, fat: 50, fiber: 12, sugar: 0.3, calcium: 975, iron: 14.6, magnesium: 351, potassium: 468, zinc: 7.8 },
  "teriyaki sauce": { calories: 89, protein: 5.9, carbs: 16, fat: 0, fiber: 0.1, sugar: 14, iron: 1.1, sodium: 3833 },
  "soy sauce": { calories: 53, protein: 5, carbs: 5, fat: 0.1, fiber: 0.8, sugar: 1.7, iron: 2.4, sodium: 5493 },
  "wasabi": { calories: 109, protein: 4.8, carbs: 24, fat: 0.6, fiber: 7.8, sugar: 8.4, vitaminC: 42, calcium: 128, iron: 1, potassium: 568 },
  "honey": { calories: 304, protein: 0.3, carbs: 82, fat: 0, fiber: 0.2, sugar: 82, iron: 0.4, calcium: 6, potassium: 52 },
  "parsley": { calories: 36, protein: 3, carbs: 6.3, fat: 0.8, fiber: 3.3, sugar: 0.9, vitaminA: 421, vitaminC: 133, vitaminK: 1640, folate: 152, iron: 6.2, calcium: 138, potassium: 554 },
  "thai seafood dipping sauce": { calories: 78, protein: 2, carbs: 16, fat: 0.5, fiber: 0.3, sugar: 12, sodium: 2100, vitaminC: 15 },
};

// ─── Meal storage ────────────────────────────────────────────────

const DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/workspace/data';

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

interface FoodMemory {
  name: string;
  lastGrams: number;
  count: number;
  lastSeen: string;
}

function getFoodMemories(chatId: string): FoodMemory[] {
  ensureDataDir();
  const file = join(DATA_DIR, `food-memory-${chatId}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : [];
}

function getTodayMealCount(chatId: string): number {
  ensureDataDir();
  const file = join(DATA_DIR, `meals-${chatId}.json`);
  if (!existsSync(file)) return 0;
  const meals = JSON.parse(readFileSync(file, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];
  return meals.filter((m: any) => m.timestamp?.startsWith(today)).length;
}

// ─── Plugin ──────────────────────────────────────────────────────

export default function register(api: any) {
  debugLog("companion-food plugin registered");
  
  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      debugLog(`before_prompt_build fired. Keys: ${Object.keys(event || {}).join(', ')}`);
      
      const messages = event?.messages;
      if (!messages || !Array.isArray(messages)) {
        debugLog("No messages array");
        return;
      }
      
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg || lastMsg.role !== 'user') {
        debugLog(`Last msg role: ${lastMsg?.role}`);
        return;
      }
      
      // Detect images in multiple ways OpenClaw might structure them
      const content = lastMsg.content;
      let hasImage = false;
      let hasText = false;
      let textContent = '';
      
      if (typeof content === 'string') {
        textContent = content;
        // Check for image references in the text (OpenClaw may put image paths/refs)
        if (content.includes('[image]') || content.includes('[photo]') || content.includes('.jpg') || content.includes('.png') || content.includes('.jpeg') || content.includes('.webp')) {
          hasImage = true;
        }
        hasText = content.trim().length > 0;
      } else if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image' || part.type === 'image_url') {
            hasImage = true;
          }
          if (part.type === 'text') {
            textContent += part.text || '';
            hasText = true;
          }
        }
      }
      
      // Also check event-level image indicators
      if (event?.images?.length > 0) hasImage = true;
      if (event?.context?.hasImage) hasImage = true;
      if (event?.context?.attachments?.length > 0) hasImage = true;
      if (event?.context?.mediaType === 'photo') hasImage = true;
      
      // Check the raw prompt for image indicators
      if (event?.prompt && typeof event.prompt === 'string') {
        if (event.prompt.includes('[image]') || event.prompt.includes('[photo]')) {
          hasImage = true;
        }
      }
      
      debugLog(`Image detected: ${hasImage}, content type: ${typeof content}, isArray: ${Array.isArray(content)}, keys: ${JSON.stringify(Object.keys(event?.context || {}))}`);
      
      if (!hasImage) {
        debugLog("No image found, skipping injection");
        return;
      }
      
      debugLog("Image confirmed — building food analysis context");
      
      // Build context from user's food history
      const chatId = event?.context?.chatId || event?.context?.peer?.id || 'unknown';
      const memories = getFoodMemories(chatId);
      const todayCount = getTodayMealCount(chatId);
      
      let memoryBlock = '';
      if (memories.length > 0) {
        memoryBlock = '\n\nUSER FOOD MEMORY (their usual portions):\n' + 
          memories.slice(-20).map(m => `- ${m.name}: usually ${m.lastGrams}g (logged ${m.count}x)`).join('\n');
      }
      
      let todayBlock = '';
      if (todayCount > 0) {
        todayBlock = `\n\nThey've logged ${todayCount} meal(s) today already.`;
      }

      const foodDBEntries = Object.entries(FOOD_DB).map(([name, data]: [string, any]) => {
        return `${name}: cal=${data.calories} P=${data.protein}g C=${data.carbs}g F=${data.fat}g`;
      }).join('\n');

      const injection = `
[FOOD PHOTO ANALYSIS — MANDATORY RULES]
The user sent a photo of food. You MUST follow these rules STRICTLY:

## STEP 1: IDENTIFY (do this now)
- Look at the photo and list every ingredient you can see, individually
- For anything uncertain (sauces, dressings, garnishes), describe what you see and ask
- Be specific: "teriyaki chicken" not just "chicken"

## STEP 2: ASK FOR WEIGHTS (do this now, in the same message)
- After listing what you see, ASK the user for gram weights
- Say something like: "how much of each roughly? in grams if you can"
- If food memory has a match, suggest it: "[food] again? [X]g like last time?"
- NEVER guess weights. NEVER say "~150g" or "about 1.5 cups". ASK.
- NEVER present a calorie estimate before the user tells you weights.
- This is the #1 rule: ASK, DON'T GUESS.

## STEP 3: CALCULATE (only after user confirms weights)
- Only calculate nutrients AFTER the user gives you actual gram amounts
- Use the nutrient database below (values per 100g), scale to actual grams
- Show this format:

📋 breakdown:
  [food] — [grams]g → [calories] cal, [protein]g P

🔥 total: [cal] cal · [protein]g protein · [carbs]g carbs · [fat]g fat
  fiber [X]g · sugar [X]g

💊 vitamins: [vitamin] [amount] ([% daily value])
  DV reference: A 900mcg, C 90mg, D 20mcg, E 15mg, K 120mcg, B6 1.7mg, B12 2.4mcg, folate 400mcg

⚡ minerals: [mineral] [amount] ([% DV])
  DV reference: iron 18mg, calcium 1300mg, magnesium 420mg, potassium 4700mg, zinc 11mg, sodium 2300mg

- If a food isn't in the database, estimate and mark with ~
- After showing breakdown, add ONE brief personality comment (warm, not fake)

## WHAT NEVER TO DO
- NEVER estimate portions from a photo
- NEVER present calories before user confirms weights
- NEVER say "approximately" or "about" for portions
- NEVER use cups/tablespoons — grams only
- NEVER skip the vitamin/mineral section
${memoryBlock}
${todayBlock}

## NUTRIENT DATABASE (per 100g):
${foodDBEntries}
`;

      debugLog("Returning appendSystemContext injection");
      
      return {
        appendSystemContext: injection
      };
      
    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
