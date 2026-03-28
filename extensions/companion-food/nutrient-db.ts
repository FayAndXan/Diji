// Local nutrient database — per 100g values from USDA
// Covers common foods. Falls back to GPT estimation for unknowns.

export interface Nutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  vitaminA?: number;   // mcg RAE
  vitaminC?: number;   // mg
  vitaminD?: number;   // mcg
  vitaminE?: number;   // mg
  vitaminK?: number;   // mcg
  vitaminB6?: number;  // mg
  vitaminB12?: number; // mcg
  folate?: number;     // mcg
  iron?: number;       // mg
  calcium?: number;    // mg
  magnesium?: number;  // mg
  potassium?: number;  // mg
  zinc?: number;       // mg
  sodium?: number;     // mg
  saturatedFat?: number; // g
  omega3?: number;     // g
}

// All values per 100g
const DB: Record<string, Nutrients> = {
  // ─── Fish & Seafood ────────────────────────
  "salmon": { calories: 208, protein: 20.4, carbs: 0, fat: 13.4, fiber: 0, sugar: 0, vitaminD: 11, vitaminB12: 3.2, vitaminB6: 0.6, iron: 0.3, calcium: 12, magnesium: 29, potassium: 363, zinc: 0.4, sodium: 59, saturatedFat: 3.1, omega3: 2.3 },
  "salmon sashimi": { calories: 127, protein: 20.5, carbs: 0, fat: 4.4, fiber: 0, sugar: 0, vitaminD: 11, vitaminB12: 3.2, vitaminB6: 0.6, iron: 0.3, calcium: 12, magnesium: 29, potassium: 363, zinc: 0.4, sodium: 59, saturatedFat: 0.9, omega3: 1.8 },
  "salmon raw": { calories: 127, protein: 20.5, carbs: 0, fat: 4.4, fiber: 0, sugar: 0, vitaminD: 11, vitaminB12: 3.2, vitaminB6: 0.6, iron: 0.3, calcium: 12, magnesium: 29, potassium: 363, zinc: 0.4, sodium: 59, saturatedFat: 0.9, omega3: 1.8 },
  "tuna": { calories: 132, protein: 28.2, carbs: 0, fat: 1.3, fiber: 0, sugar: 0, vitaminD: 2.1, vitaminB12: 2.1, vitaminB6: 0.5, iron: 1.3, calcium: 12, magnesium: 35, potassium: 323, zinc: 0.4, sodium: 47, saturatedFat: 0.3 },
  "shrimp": { calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0, sugar: 0, vitaminB12: 1.1, vitaminB6: 0.1, iron: 0.5, calcium: 70, magnesium: 37, potassium: 259, zinc: 1.6, sodium: 111, saturatedFat: 0.1 },
  
  // ─── Meat ──────────────────────────────────
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sugar: 0, vitaminB6: 0.6, vitaminB12: 0.3, iron: 1, calcium: 15, magnesium: 29, potassium: 256, zinc: 1, sodium: 74, saturatedFat: 1 },
  "beef steak": { calories: 271, protein: 26, carbs: 0, fat: 18, fiber: 0, sugar: 0, vitaminB12: 2.6, vitaminB6: 0.6, iron: 2.6, calcium: 18, magnesium: 22, potassium: 318, zinc: 6.3, sodium: 57, saturatedFat: 7 },
  "pork": { calories: 242, protein: 27, carbs: 0, fat: 14, fiber: 0, sugar: 0, vitaminB12: 0.7, vitaminB6: 0.5, iron: 0.9, calcium: 19, magnesium: 23, potassium: 362, zinc: 2.4, sodium: 62, saturatedFat: 5.2 },
  
  // ─── Vegetables ────────────────────────────
  "sugar snap peas": { calories: 42, protein: 2.8, carbs: 7.6, fat: 0.2, fiber: 2.6, sugar: 4, vitaminA: 54, vitaminC: 60, vitaminK: 25, vitaminB6: 0.2, folate: 42, iron: 2.1, calcium: 43, magnesium: 24, potassium: 200, zinc: 0.3, sodium: 4 },
  "snap peas": { calories: 42, protein: 2.8, carbs: 7.6, fat: 0.2, fiber: 2.6, sugar: 4, vitaminA: 54, vitaminC: 60, vitaminK: 25, vitaminB6: 0.2, folate: 42, iron: 2.1, calcium: 43, magnesium: 24, potassium: 200, zinc: 0.3, sodium: 4 },
  "tomato": { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sugar: 2.6, vitaminA: 42, vitaminC: 14, vitaminK: 7.9, vitaminB6: 0.1, folate: 15, iron: 0.3, calcium: 10, magnesium: 11, potassium: 237, zinc: 0.2, sodium: 5 },
  "tomatoes": { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sugar: 2.6, vitaminA: 42, vitaminC: 14, vitaminK: 7.9, vitaminB6: 0.1, folate: 15, iron: 0.3, calcium: 10, magnesium: 11, potassium: 237, zinc: 0.2, sodium: 5 },
  "diced tomatoes": { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sugar: 2.6, vitaminA: 42, vitaminC: 14, vitaminK: 7.9, vitaminB6: 0.1, folate: 15, iron: 0.3, calcium: 10, magnesium: 11, potassium: 237, zinc: 0.2, sodium: 5 },
  "broccoli": { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, sugar: 1.7, vitaminA: 31, vitaminC: 89, vitaminK: 102, vitaminB6: 0.2, folate: 63, iron: 0.7, calcium: 47, magnesium: 21, potassium: 316, zinc: 0.4, sodium: 33 },
  "spinach": { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, sugar: 0.4, vitaminA: 469, vitaminC: 28, vitaminK: 483, vitaminB6: 0.2, folate: 194, iron: 2.7, calcium: 99, magnesium: 79, potassium: 558, zinc: 0.5, sodium: 79 },
  "edamame": { calories: 121, protein: 12, carbs: 9, fat: 5, fiber: 5, sugar: 2, vitaminA: 9, vitaminC: 6, vitaminK: 27, vitaminB6: 0.1, folate: 311, iron: 2.3, calcium: 63, magnesium: 64, potassium: 436, zinc: 1.4, sodium: 6 },
  "cucumber": { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, sugar: 1.7, vitaminC: 2.8, vitaminK: 16.4, iron: 0.3, calcium: 16, magnesium: 13, potassium: 147, zinc: 0.2, sodium: 2 },
  "avocado": { calories: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7, sugar: 0.7, vitaminE: 2.1, vitaminK: 21, vitaminC: 10, vitaminB6: 0.3, folate: 81, iron: 0.6, calcium: 12, magnesium: 29, potassium: 485, zinc: 0.6, sodium: 7, saturatedFat: 2.1 },
  "lettuce": { calories: 15, protein: 1.4, carbs: 2.9, fat: 0.2, fiber: 1.3, sugar: 0.8, vitaminA: 370, vitaminC: 9.2, vitaminK: 126, folate: 38, iron: 0.9, calcium: 36, magnesium: 13, potassium: 194, sodium: 28 },
  "carrot": { calories: 41, protein: 0.9, carbs: 9.6, fat: 0.2, fiber: 2.8, sugar: 4.7, vitaminA: 835, vitaminC: 5.9, vitaminK: 13.2, vitaminB6: 0.1, folate: 19, iron: 0.3, calcium: 33, magnesium: 12, potassium: 320, zinc: 0.2, sodium: 69 },
  "kale": { calories: 49, protein: 4.3, carbs: 9, fat: 0.9, fiber: 3.6, sugar: 2.3, vitaminA: 500, vitaminC: 120, vitaminK: 817, vitaminB6: 0.3, folate: 141, iron: 1.5, calcium: 150, magnesium: 47, potassium: 491, zinc: 0.6, sodium: 38 },
  "bell pepper": { calories: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1, sugar: 4.2, vitaminA: 157, vitaminC: 128, vitaminB6: 0.3, folate: 46, iron: 0.4, calcium: 7, magnesium: 12, potassium: 211, zinc: 0.3, sodium: 4 },
  "onion": { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7, sugar: 4.2, vitaminC: 7.4, vitaminB6: 0.1, folate: 19, iron: 0.2, calcium: 23, magnesium: 10, potassium: 146, zinc: 0.2, sodium: 4 },
  "parsley": { calories: 36, protein: 3, carbs: 6.3, fat: 0.8, fiber: 3.3, sugar: 0.9, vitaminA: 421, vitaminC: 133, vitaminK: 1640, vitaminB6: 0.1, folate: 152, iron: 6.2, calcium: 138, magnesium: 50, potassium: 554, zinc: 1.1, sodium: 56 },
  "chili pepper": { calories: 40, protein: 1.9, carbs: 8.8, fat: 0.4, fiber: 1.5, sugar: 5.3, vitaminA: 48, vitaminC: 144, vitaminB6: 0.5, iron: 1, calcium: 14, magnesium: 23, potassium: 322, zinc: 0.3, sodium: 9 },
  
  // ─── Fruits ────────────────────────────────
  "apple": { calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, sugar: 10, vitaminC: 4.6, potassium: 107, sodium: 1 },
  "banana": { calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, sugar: 12, vitaminB6: 0.4, vitaminC: 8.7, magnesium: 27, potassium: 358, sodium: 1 },
  "orange": { calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, sugar: 9.4, vitaminC: 53, folate: 30, calcium: 40, potassium: 181, sodium: 0 },
  "blueberries": { calories: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4, sugar: 10, vitaminC: 9.7, vitaminK: 19, iron: 0.3, potassium: 77, sodium: 1 },
  
  // ─── Grains & Starches ─────────────────────
  "white rice": { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sugar: 0, iron: 0.2, magnesium: 12, potassium: 35, sodium: 1 },
  "brown rice": { calories: 112, protein: 2.3, carbs: 24, fat: 0.8, fiber: 1.8, sugar: 0.4, magnesium: 39, potassium: 79, iron: 0.4, zinc: 0.6, sodium: 1 },
  "quinoa": { calories: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8, sugar: 0.9, folate: 42, iron: 1.5, magnesium: 64, potassium: 172, zinc: 1.1, sodium: 7 },
  "oats": { calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 11, sugar: 1, iron: 4.7, magnesium: 177, potassium: 429, zinc: 4, sodium: 2 },
  "pasta": { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, sugar: 0.6, iron: 1.3, magnesium: 18, potassium: 44, zinc: 0.5, sodium: 1 },
  "bread": { calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, sugar: 5, iron: 3.6, calcium: 260, magnesium: 25, potassium: 100, zinc: 0.7, sodium: 491 },
  "sweet potato": { calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, sugar: 4.2, vitaminA: 709, vitaminC: 2.4, vitaminB6: 0.2, iron: 0.6, calcium: 30, magnesium: 25, potassium: 337, sodium: 55 },
  "potato": { calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, sugar: 0.8, vitaminC: 20, vitaminB6: 0.3, iron: 0.8, calcium: 12, magnesium: 23, potassium: 421, sodium: 6 },
  
  // ─── Legumes ───────────────────────────────
  "black beans": { calories: 132, protein: 8.9, carbs: 24, fat: 0.5, fiber: 8.7, sugar: 0.3, folate: 149, iron: 2.1, calcium: 27, magnesium: 70, potassium: 355, zinc: 1, sodium: 1 },
  "chickpeas": { calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, sugar: 4.8, folate: 172, iron: 2.9, calcium: 49, magnesium: 48, potassium: 291, zinc: 1.5, sodium: 7 },
  "lentils": { calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, sugar: 1.8, folate: 181, iron: 3.3, calcium: 19, magnesium: 36, potassium: 369, zinc: 1.3, sodium: 2 },
  
  // ─── Dairy & Eggs ──────────────────────────
  "egg": { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, sugar: 1.1, vitaminA: 160, vitaminD: 2, vitaminB12: 0.9, vitaminB6: 0.2, iron: 1.8, calcium: 56, magnesium: 12, potassium: 126, zinc: 1.3, sodium: 124, saturatedFat: 3.3 },
  "greek yogurt": { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, sugar: 3.2, vitaminB12: 0.8, calcium: 110, magnesium: 11, potassium: 141, zinc: 0.5, sodium: 36 },
  "cheese": { calories: 402, protein: 25, carbs: 1.3, fat: 33, fiber: 0, sugar: 0.5, vitaminA: 265, vitaminB12: 1.1, calcium: 721, magnesium: 28, potassium: 98, zinc: 3.1, sodium: 621, saturatedFat: 21 },
  "milk": { calories: 42, protein: 3.4, carbs: 5, fat: 1, fiber: 0, sugar: 5, vitaminD: 1.2, vitaminB12: 0.5, calcium: 125, magnesium: 11, potassium: 150, zinc: 0.4, sodium: 44 },
  
  // ─── Nuts & Seeds ──────────────────────────
  "almonds": { calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 13, sugar: 4.4, vitaminE: 26, magnesium: 270, potassium: 733, calcium: 269, iron: 3.7, zinc: 3.1, sodium: 1, saturatedFat: 3.8 },
  "walnuts": { calories: 654, protein: 15, carbs: 14, fat: 65, fiber: 6.7, sugar: 2.6, magnesium: 158, potassium: 441, iron: 2.9, zinc: 3.1, sodium: 2, omega3: 9.1, saturatedFat: 6.1 },
  "sesame seeds": { calories: 573, protein: 18, carbs: 23, fat: 50, fiber: 12, sugar: 0.3, calcium: 975, iron: 14.6, magnesium: 351, potassium: 468, zinc: 7.8, sodium: 11 },
  
  // ─── Condiments & Others ───────────────────
  "olive oil": { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sugar: 0, vitaminE: 14, vitaminK: 60, saturatedFat: 14 },
  "olives": { calories: 115, protein: 0.8, carbs: 6, fat: 11, fiber: 3.2, sugar: 0, vitaminE: 3.8, iron: 3.3, calcium: 88, sodium: 735, saturatedFat: 1.4 },
  "green olives": { calories: 145, protein: 1, carbs: 3.8, fat: 15.3, fiber: 3.3, sugar: 0.5, vitaminE: 3.8, iron: 0.5, calcium: 52, sodium: 1556, saturatedFat: 2 },
  "soy sauce": { calories: 53, protein: 5, carbs: 5, fat: 0.1, fiber: 0.8, sugar: 1.7, iron: 2.4, sodium: 5493 },
  "wasabi": { calories: 109, protein: 4.8, carbs: 24, fat: 0.6, fiber: 7.8, sugar: 8.4, vitaminC: 42, calcium: 128, iron: 1, magnesium: 69, potassium: 568, sodium: 17 },
  "wasabi paste": { calories: 109, protein: 4.8, carbs: 24, fat: 0.6, fiber: 7.8, sugar: 8.4, vitaminC: 42, calcium: 128, iron: 1, magnesium: 69, potassium: 568, sodium: 17 },
  "chimichurri": { calories: 180, protein: 1.5, carbs: 3, fat: 18, fiber: 1, sugar: 0.5, vitaminA: 200, vitaminC: 30, vitaminK: 300, iron: 2, calcium: 40, potassium: 200, sodium: 400, saturatedFat: 2.5 },
  "green chili sauce": { calories: 20, protein: 0.5, carbs: 4, fat: 0.3, fiber: 0.5, sugar: 2, vitaminC: 30, iron: 0.3, sodium: 400 },
  "salsa": { calories: 36, protein: 2, carbs: 7, fat: 0.2, fiber: 2, sugar: 4, vitaminC: 16, iron: 1, sodium: 580 },
  "hummus": { calories: 166, protein: 7.9, carbs: 14, fat: 9.6, fiber: 6, sugar: 0.3, folate: 83, iron: 2.4, calcium: 38, magnesium: 71, potassium: 228, zinc: 1.8, sodium: 379 },
  "peanut butter": { calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, sugar: 9.2, vitaminE: 9, vitaminB6: 0.4, iron: 1.7, magnesium: 168, potassium: 649, zinc: 2.8, sodium: 17, saturatedFat: 10 },
  "tofu": { calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3, sugar: 0.6, calcium: 350, iron: 5.4, magnesium: 30, potassium: 121, zinc: 0.8, sodium: 7 },
  "honey": { calories: 304, protein: 0.3, carbs: 82, fat: 0, fiber: 0.2, sugar: 82, iron: 0.4, calcium: 6, potassium: 52, sodium: 4 },
};

// Fuzzy match: try exact, then partial, then first word
export function lookupFood(name: string): Nutrients | null {
  const key = name.toLowerCase().trim();
  
  // Exact match
  if (DB[key]) return DB[key];
  
  // Try without common prefixes
  const stripped = key
    .replace(/^(grilled|steamed|roasted|raw|fresh|fried|baked|boiled|sauteed|pan-fried|sliced|diced|chopped|mixed|cooked|dried) /, '')
    .replace(/^(grilled|steamed|roasted|raw|fresh|fried|baked|boiled|sauteed|pan-fried|sliced|diced|chopped|mixed|cooked|dried) /, '');
  if (DB[stripped]) return DB[stripped];
  
  // Partial match
  for (const [dbKey, nutrients] of Object.entries(DB)) {
    if (key.includes(dbKey) || dbKey.includes(key)) return nutrients;
  }
  
  // Try first significant word
  const words = key.split(' ').filter(w => w.length > 3);
  for (const word of words) {
    for (const [dbKey, nutrients] of Object.entries(DB)) {
      if (dbKey.includes(word)) return nutrients;
    }
  }
  
  return null;
}

export function getAllFoods(): string[] {
  return Object.keys(DB);
}
