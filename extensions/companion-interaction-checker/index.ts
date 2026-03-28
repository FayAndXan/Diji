// Companion Interaction Checker Plugin
// Checks supplement-to-supplement interactions and injects warnings

import { appendFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

function debugLog(msg: string) {
  try {
    appendFileSync("/tmp/companion-interaction-checker.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const DATA_DIR = process.env.USER_DATA_DIR || '/root/.openclaw-companion/.openclaw/workspace/data';
const STACK_FILE = join(DATA_DIR, 'supplements-stack.json');

// Known supplement interactions database
interface Interaction {
  pair: [string, string]; // ingredient names (lowercase)
  severity: 'warning' | 'caution' | 'info';
  message: string;
  action: string;
}

const KNOWN_INTERACTIONS: Interaction[] = [
  // Absorption conflicts
  {
    pair: ['calcium', 'iron'],
    severity: 'warning',
    message: 'Calcium blocks iron absorption.',
    action: 'Separate by 2+ hours. Take iron in morning, calcium in evening.'
  },
  {
    pair: ['calcium', 'magnesium'],
    severity: 'caution',
    message: 'Calcium and magnesium compete for absorption.',
    action: 'Take at different times for best absorption.'
  },
  {
    pair: ['calcium', 'zinc'],
    severity: 'caution',
    message: 'Calcium can reduce zinc absorption.',
    action: 'Take at different times.'
  },
  {
    pair: ['zinc', 'copper'],
    severity: 'warning',
    message: 'High zinc supplementation depletes copper over time.',
    action: 'If taking zinc >30mg/day, add 1-2mg copper. Check copper levels in blood work.'
  },
  {
    pair: ['iron', 'zinc'],
    severity: 'caution',
    message: 'Iron and zinc compete for absorption when taken together.',
    action: 'Take at different times for better absorption.'
  },

  // Synergistic (positive but important to note)
  {
    pair: ['vitamin d', 'vitamin k2'],
    severity: 'info',
    message: 'Vitamin D increases calcium absorption. K2 directs calcium to bones instead of arteries.',
    action: 'Take together. If supplementing D without K2, calcium may deposit in arteries.'
  },
  {
    pair: ['vitamin d', 'calcium'],
    severity: 'info',
    message: 'Vitamin D enhances calcium absorption.',
    action: 'Take together with a fat-containing meal.'
  },
  {
    pair: ['vitamin c', 'iron'],
    severity: 'info',
    message: 'Vitamin C significantly enhances iron absorption.',
    action: 'Take together if iron-deficient. AVOID taking together if ferritin is already high.'
  },

  // Sedation stacking
  {
    pair: ['magnesium', 'ashwagandha'],
    severity: 'caution',
    message: 'Both have calming/sedating effects.',
    action: 'Take both in evening. May enhance sleepiness — good if that\'s the goal.'
  },
  {
    pair: ['magnesium', 'melatonin'],
    severity: 'caution',
    message: 'Both promote sleep.',
    action: 'Together is fine for sleep but may cause excessive drowsiness. Start with one.'
  },
  {
    pair: ['ashwagandha', 'melatonin'],
    severity: 'caution',
    message: 'Both have sedating effects.',
    action: 'Evening only. Monitor for excessive drowsiness.'
  },

  // Blood thinner interactions
  {
    pair: ['omega-3', 'vitamin e'],
    severity: 'warning',
    message: 'Both have blood-thinning effects.',
    action: 'Combined high doses may increase bleeding risk. If on blood thinners, consult doctor.'
  },
  {
    pair: ['omega-3', 'vitamin k'],
    severity: 'caution',
    message: 'Omega-3 thins blood while K promotes clotting.',
    action: 'May partially counteract each other. If on warfarin, keep K intake consistent.'
  },

  // Thyroid interactions
  {
    pair: ['iodine', 'selenium'],
    severity: 'info',
    message: 'Both important for thyroid function.',
    action: 'Selenium helps convert T4 to T3. Take together for thyroid support.'
  },

  // Energy/stimulant stacking
  {
    pair: ['b vitamins', 'coq10'],
    severity: 'info',
    message: 'Both support energy metabolism.',
    action: 'Take both in the morning. May cause restlessness if taken late.'
  },

  // NAD+ precursors
  {
    pair: ['nmn', 'resveratrol'],
    severity: 'info',
    message: 'Often stacked together in longevity protocols.',
    action: 'Take in morning with a fat source (for resveratrol absorption).'
  },

  // Berberine interactions
  {
    pair: ['berberine', 'metformin'],
    severity: 'warning',
    message: 'Both lower blood glucose. Combining may cause dangerous hypoglycemia.',
    action: 'Do NOT combine without doctor supervision. Choose one.'
  },

  // Curcumin/turmeric
  {
    pair: ['curcumin', 'iron'],
    severity: 'caution',
    message: 'Curcumin may chelate iron and reduce absorption.',
    action: 'Separate by 2+ hours if iron levels are a concern.'
  },

  // Fiber and minerals
  {
    pair: ['psyllium', 'iron'],
    severity: 'caution',
    message: 'Fiber supplements can reduce mineral absorption.',
    action: 'Take fiber supplements 2+ hours away from iron and other minerals.'
  },
  {
    pair: ['psyllium', 'zinc'],
    severity: 'caution',
    message: 'Fiber supplements can reduce mineral absorption.',
    action: 'Take fiber supplements 2+ hours away from minerals.'
  },
];

// Normalize ingredient name for matching
function normalizeIngredient(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/vitamin\s+/g, 'vitamin ')
    .replace(/vit\s+/g, 'vitamin ')
    .replace(/\(.*?\)/g, '')
    .replace(/mk-7|mk7|menaquinone/gi, 'vitamin k2')
    .replace(/cholecalciferol/gi, 'vitamin d')
    .replace(/d3/gi, 'vitamin d')
    .replace(/k2/gi, 'vitamin k2')
    .replace(/ascorbic acid/gi, 'vitamin c')
    .replace(/tocopherol/gi, 'vitamin e')
    .replace(/pyridoxine/gi, 'vitamin b6')
    .replace(/cobalamin|methylcobalamin|cyanocobalamin/gi, 'vitamin b12')
    .replace(/fish oil|epa|dha|epa\/dha/gi, 'omega-3')
    .replace(/magnesium (glycinate|citrate|threonate|oxide|taurate|malate)/gi, 'magnesium')
    .replace(/zinc (picolinate|gluconate|citrate|bisglycinate)/gi, 'zinc')
    .replace(/iron (bisglycinate|sulfate|fumarate|gluconate)/gi, 'iron')
    .replace(/calcium (citrate|carbonate|hydroxyapatite)/gi, 'calcium')
    .replace(/curcumin|turmeric/gi, 'curcumin')
    .replace(/psyllium|fiber supplement|metamucil/gi, 'psyllium')
    .trim();
}

function checkInteractions(ingredients: string[]): Interaction[] {
  const normalized = ingredients.map(normalizeIngredient);
  const found: Interaction[] = [];

  for (const interaction of KNOWN_INTERACTIONS) {
    const [a, b] = interaction.pair;
    const hasA = normalized.some(i => i.includes(a));
    const hasB = normalized.some(i => i.includes(b));
    if (hasA && hasB) {
      found.push(interaction);
    }
  }

  return found;
}

function loadSupplementStack(): string[] {
  try {
    if (!existsSync(STACK_FILE)) return [];
    const data = JSON.parse(readFileSync(STACK_FILE, 'utf-8'));

    const ingredients: string[] = [];
    const supplements = data.supplements || data;

    if (Array.isArray(supplements)) {
      for (const supp of supplements) {
        // Add supplement name
        if (supp.name) ingredients.push(supp.name);
        // Add individual ingredients
        if (Array.isArray(supp.ingredients)) {
          for (const ing of supp.ingredients) {
            if (ing.name) ingredients.push(ing.name);
          }
        }
      }
    }

    return ingredients;
  } catch (err) {
    debugLog(`Error loading stack: ${err}`);
    return [];
  }
}

// Check if the current turn involves supplements
function isSupplementContext(event: any): boolean {
  const messages = event?.messages;
  if (!messages || !Array.isArray(messages)) return false;

  // Only check the very last message. If it's not a user message,
  // this is a heartbeat/cron/system turn — don't trigger.
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return false;

  let text = '';
  if (typeof last.content === 'string') text = last.content;
  else if (Array.isArray(last.content)) {
    text = last.content.filter((p: any) => p.type === 'text').map((p: any) => p.text || '').join(' ');
  }
  return /supplement|vitamin|mineral|stack|pill|capsule|tablet|take|taking|dose|mg\b|mcg\b|iu\b/i.test(text);
}

export default function register(api: any) {
  debugLog("companion-interaction-checker plugin registered");

  api.on("before_prompt_build", async (event: any, ctx: any) => {
    try {
      // Only activate in supplement-related conversations
      if (!isSupplementContext(event)) return;

      const ingredients = loadSupplementStack();
      if (ingredients.length < 2) {
        debugLog(`Stack has ${ingredients.length} ingredients, need 2+ for interaction check`);
        return;
      }

      debugLog(`Checking interactions for ${ingredients.length} ingredients`);

      const interactions = checkInteractions(ingredients);
      if (interactions.length === 0) {
        debugLog("No interactions found");
        return;
      }

      debugLog(`Found ${interactions.length} interactions`);

      const warnings = interactions
        .filter(i => i.severity === 'warning')
        .map(i => `⚠️ ${i.pair[0].toUpperCase()} + ${i.pair[1].toUpperCase()}: ${i.message} → ${i.action}`);

      const cautions = interactions
        .filter(i => i.severity === 'caution')
        .map(i => `⚡ ${i.pair[0]} + ${i.pair[1]}: ${i.message} → ${i.action}`);

      const infos = interactions
        .filter(i => i.severity === 'info')
        .map(i => `ℹ️ ${i.pair[0]} + ${i.pair[1]}: ${i.message} → ${i.action}`);

      let injection = '\n[SUPPLEMENT INTERACTION CHECK — companion-interaction-checker]\n';
      injection += `Checked ${ingredients.length} ingredients in the user's supplement stack.\n\n`;

      if (warnings.length > 0) {
        injection += `WARNINGS (mention these to the user):\n${warnings.join('\n')}\n\n`;
      }
      if (cautions.length > 0) {
        injection += `CAUTIONS (mention if relevant to the conversation):\n${cautions.join('\n')}\n\n`;
      }
      if (infos.length > 0) {
        injection += `INFO (mention only if user asks about timing/stacking):\n${infos.join('\n')}\n\n`;
      }

      injection += `Weave relevant interactions into your response naturally. Don't dump the full list unless the user specifically asks about interactions.`;

      return { appendSystemContext: injection };

    } catch (err) {
      debugLog(`Error: ${err}`);
    }
  });
}
