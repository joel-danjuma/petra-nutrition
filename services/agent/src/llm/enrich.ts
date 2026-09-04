import type {
  EnrichRecipeRequest,
  EnrichRecipeResponse,
} from '@petra/agent-contract';

import { AIChatService } from './groq';

/**
 * Fill in what the recipe import doesn't carry: nutrition, prep/cook times, a
 * "Cook it safe" note, a "Nothing gets binned" note, and per-step tips for Cook
 * Mode. These are the fields the recipe screen's callouts are built on and
 * nothing upstream provides them.
 *
 * This is inference, so it lives in the agent. Persistence does not: the caller
 * receives validated fields and writes them itself. A malformed or implausible
 * response throws here and is never returned, so nothing reaches the database
 * that wasn't checked.
 */

const PROMPT = `You are a recipe data extractor. Reply with ONE JSON object and nothing else — no prose, no markdown fence.

Schema:
{
  "prepTime": <int minutes>,
  "cookTime": <int minutes>,
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "nutrition": { "calories": <num per serving>, "protein": <g>, "carbs": <g>, "fat": <g>, "fiber": <g>, "sugar": <g>, "sodium": <mg> },
  "safetyNote": "<1-2 sentences: the food-safety thing that actually matters here — probe temperature, raw protein handling, allergen cross-contact. Omit generic advice like 'wash your hands'.>",
  "zeroWasteNote": "<1-2 sentences: how to use the whole ingredient, and what to do with the leftovers tomorrow. Be specific to THIS dish.>",
  "stepTips": [ { "step": <int>, "tip": "<the technique note a good cook would say out loud at this step>" } ]
}

Rules:
- Nutrition is PER SERVING and must be a realistic estimate for the ingredients given.
- Give stepTips for at most 3 steps — only where a tip genuinely helps.
- Write plainly. No exclamation marks.`;

/** Strip a markdown fence if the model added one, then parse. */
export function parseJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(text.slice(start, end + 1));
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/** Reject anything that would put a wrong number on screen. */
export function validateEnrichment(
  raw: unknown,
  stepCount: number
): EnrichRecipeResponse {
  const d = raw as Record<string, any>;
  if (!d || typeof d !== 'object') throw new Error('not an object');

  const prepTime = num(d.prepTime);
  const cookTime = num(d.cookTime);
  if (prepTime === null || cookTime === null) throw new Error('missing times');
  if (prepTime > 480 || cookTime > 1440) throw new Error('implausible times');

  const difficulty = String(d.difficulty ?? '').toUpperCase();
  if (!['EASY', 'MEDIUM', 'HARD'].includes(difficulty)) throw new Error('bad difficulty');

  const n = d.nutrition ?? {};
  const calories = num(n.calories);
  const protein = num(n.protein);
  const carbs = num(n.carbs);
  const fat = num(n.fat);
  if (calories === null || protein === null || carbs === null || fat === null) {
    throw new Error('missing macros');
  }
  if (calories > 3000 || protein > 300 || carbs > 500 || fat > 300) {
    throw new Error('implausible macros');
  }

  const safetyNote = String(d.safetyNote ?? '').trim();
  const zeroWasteNote = String(d.zeroWasteNote ?? '').trim();
  if (safetyNote.length < 15 || zeroWasteNote.length < 15) throw new Error('notes too short');

  const stepTips = Array.isArray(d.stepTips)
    ? d.stepTips
        .map((t: any) => ({ step: Number(t?.step), tip: String(t?.tip ?? '').trim() }))
        .filter(
          (t: { step: number; tip: string }) =>
            Number.isInteger(t.step) && t.step >= 1 && t.step <= stepCount && t.tip.length > 10
        )
        .slice(0, 3)
    : [];

  return {
    prepTime,
    cookTime,
    difficulty: difficulty as EnrichRecipeResponse['difficulty'],
    nutrition: {
      calories,
      protein,
      carbs,
      fat,
      fiber: num(n.fiber) ?? undefined,
      sugar: num(n.sugar) ?? undefined,
      sodium: num(n.sodium) ?? undefined,
    },
    safetyNote,
    zeroWasteNote,
    stepTips,
  };
}

export async function enrichRecipe(
  ai: AIChatService,
  recipe: EnrichRecipeRequest
): Promise<EnrichRecipeResponse> {
  const ingredients = recipe.ingredients
    .map(i => `${i.amount} ${i.unit} ${i.name}`.trim())
    .join('; ');
  const steps = recipe.instructions.map(s => `${s.step}. ${s.instruction}`).join('\n');

  const userMessage = `Recipe: ${recipe.title}
Cuisine: ${recipe.cuisine ?? 'unspecified'}
Servings: ${recipe.servings}
Ingredients: ${ingredients}
Method:
${steps}`;

  const response = await ai.sendMessage(
    [
      { role: 'system', content: PROMPT },
      { role: 'user', content: userMessage },
    ],
    undefined,
    // Fast model: this is structured extraction against a strict schema, and
    // `validateEnrichment` rejects anything malformed. Running it on the large
    // model drained the whole 200k/day token budget in one pass and left chat
    // unusable.
    false
  );

  return validateEnrichment(parseJson(response.content), recipe.instructions.length);
}
