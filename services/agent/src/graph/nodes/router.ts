import { parseJson } from '../../llm/enrich';
import { modelFor } from '../../llm/provider';
import { FOOD_TOKENS, normalise } from '../../retrieval/terms';
import { DESCRIPTORS } from '../constraints';
import { logger } from '../../utils/logger';
import { emitNode, turnSignal } from '../turn-context';
import type { GraphStateType, GraphUpdate, Intent } from '../state';

/**
 * What kind of turn is this?
 *
 * Four answers, and the interesting one is the distinction between `search` and
 * `compose`. "What can I make tonight?" is a question about the corpus.
 * "Create a recipe with chicken breasts, linguine and bell peppers" is not — it
 * names a fixed ingredient set and asks for a dish built around it, and
 * answering it by returning the nearest thing in the library is the failure
 * this whole graph exists to fix.
 *
 * The router also does the extraction the compose node depends on: which
 * ingredients were named, and how many people for. Those cannot be inferred
 * downstream, because by then the phrasing is gone.
 *
 * Validated in code and defaulted rather than trusted, exactly like
 * `validateEnrichment`. A router that throws takes the whole turn with it,
 * which is a much worse outcome than a turn routed to plain chat.
 */

const PROMPT = `You classify a cooking assistant's incoming message. Reply with ONE JSON object and nothing else.

{
  "intent": "chat" | "search" | "compose" | "nutrition",
  "ingredients": ["<ingredients the user named IN THIS MESSAGE, singular, no quantities>"],
  "servings": <int, or null if not stated>,
  "clarify": null | { "question": "<one short question>", "options": ["<2-4 short answers>"] }
}

intent:
- "compose" — the user names ingredients and asks for a recipe, dish or meal built from them. Also when they ask you to invent, create, make up, or come up with something.
- "search" — the user wants a recipe recommendation, or asks what they could cook, without pinning the dish to a specific ingredient list.
- "nutrition" — the user asks about calories, macros, protein, carbs, fat, or how healthy something is.
- "chat" — anything else: storage, food safety, technique, substitutions, conversation.

ingredients:
- Only what the user actually named. Never add anything.
- Drop quantities and preparation: "2 diced chicken breasts" -> "chicken breast".
- Empty array when they named nothing.

clarify:
- Almost always null. Only ask when the answer would materially change the dish and you genuinely cannot pick a sensible default — a protein could be served hot or cold, a batch could be one meal or five.
- Never ask about something you can assume and state, like serving count or spice level.`;

const INTENTS: Intent[] = ['chat', 'search', 'compose', 'nutrition'];

/**
 * A backstop for the case where the model's JSON does not parse.
 *
 * Defaulting a failed parse to `chat` is right in general, but "create a recipe
 * with chicken, linguine and peppers" routed to `chat` is the exact bug this
 * work fixes — silently, and only for the users whose turn happened to hit a
 * malformed response. So the obvious phrasings are recognised without a model.
 * This is a floor, not a classifier: it only fires when the model's answer was
 * unusable.
 */
const COMPOSE_PHRASES =
  /\b(create|make|invent|come up with|design|write|give me|suggest)\b[^.?!]*\b(recipe|dish|meal|something)\b/i;
const WITH_INGREDIENTS = /\b(with|using|from|out of|i(?:'ve| have) got|i have)\b/i;
const NUTRITION_PHRASES = /\b(calorie|calories|kcal|macro|macros|protein|carbs?|fat|nutrition|how healthy)\b/i;
const SEARCH_PHRASES = /\b(what can i (?:make|cook)|recipe for|find me|show me|recommend|ideas? for)\b/i;

/**
 * Pull named ingredients out of a message without a model.
 *
 * Needed for the same reason as `heuristicIntent`, and it has to be here
 * rather than downstream: compose is only as good as its allowed set, and an
 * allowed set of "pantry plus staples" answers a different question from the
 * one that was asked. Losing the named ingredients turns the exact failing case
 * back into the exact failing behaviour.
 *
 * Reads each comma- or "and"-delimited fragment right to left, keeping the
 * trailing run of words that either name a food or describe one. That pulls
 * "chicken breasts" out of "I've got chicken breasts" — `got` is neither, so
 * the run stops there — and nothing at all out of "create a recipe for me with
 * those ingredients".
 */
export function heuristicIngredients(message: string): string[] {
  const out: string[] = [];

  for (const fragment of message.split(/[,;.?!]|\band\b|\bwith\b|\busing\b/i)) {
    const words = fragment.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;

    let start = words.length;
    let sawFood = false;

    for (let i = words.length - 1; i >= 0; i--) {
      const tokens = normalise(words[i]);

      // Quantities and short connectives ("2", "of", "a") normalise away
      // entirely. Once a food word has been seen they are stepped over rather
      // than ending the run, so "2 salmon fillets" survives whole; the
      // leading junk is stripped from the result below.
      if (!tokens.length) {
        if (!sawFood) break;
        start = i;
        continue;
      }

      if (tokens.some(t => FOOD_TOKENS.has(t))) {
        sawFood = true;
        start = i;
        continue;
      }

      // Only a recognised descriptor extends the run leftwards. Anything else
      // is a verb or a pronoun, and including it is how "I've got chicken"
      // becomes an ingredient called "Ive got chicken".
      if (sawFood && tokens.every(t => DESCRIPTORS.has(t))) {
        start = i;
        continue;
      }

      break;
    }

    if (!sawFood) continue;

    const name = words
      .slice(start)
      .join(' ')
      // Leading quantity, then leading filler, then punctuation.
      .replace(/^[\d\s/.½⅓⅔¼¾⅕⅙⅛⅜⅝⅞-]+/, '')
      .replace(/^(?:some|a|an|the|my|of|few)\s+/i, '')
      .replace(/[^\w\s-]/g, '')
      .trim();

    if (name.length > 1 && !out.some(x => x.toLowerCase() === name.toLowerCase())) {
      out.push(name);
    }
  }

  return out.slice(0, 12);
}

/**
 * Is this a refinement of the turn before it rather than a new subject?
 *
 * "Under 30 minutes", "something lighter", "no fish" are all continuations of
 * whatever was just asked. Read alone — which is how the router used to read
 * them — they are short fragments with no food and no request in them, so they
 * classify as chat, retrieval is skipped, and the model answers from nothing.
 *
 * Deliberately narrow. It requires brevity AND a constraint vocabulary AND the
 * absence of a question shape, because the cost of a false positive is a recipe
 * card offered when the user asked a technique question.
 */
const REFINEMENT_CONSTRAINT =
  /\b(under|less than|within|max|no more than)?\s*\d+\s*(min|mins|minute|minutes|hour|hours)\b|\b(lighter|heavier|healthier|simpler|quicker|faster|easier|cheaper|spicier|milder|lighter|richer|more|less|fewer)\b|\b(vegetarian|vegan|gluten[- ]?free|dairy[- ]?free|keto|low[- ]?carb|pescatarian|halal|kosher)\b|\b(one[- ]pot|one[- ]pan|no[- ]cook|leftovers?|quick|cheap)\b/i;

/** A question about technique or storage is never a refinement, however short. */
const TECHNIQUE_SHAPE =
  /\b(how|why|when|where|can i|should i|do i|is it|store|keep|freeze|fridge|safe|instead of|substitute|difference)\b/i;

const NEGATED_FOOD = /\b(no|without|not|avoid|skip)\b\s+(\w+)/i;

export function isRefinement(message: string): boolean {
  const trimmed = message.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);

  // A refinement is an aside, not a sentence. Anything longer is stating a new
  // request and should be classified on its own terms.
  if (words.length > 8 || trimmed.length > 48) return false;
  if (TECHNIQUE_SHAPE.test(trimmed) || NUTRITION_PHRASES.test(trimmed)) return false;

  if (REFINEMENT_CONSTRAINT.test(trimmed)) return true;

  // "no fish", "without dairy" — a negation whose object is a food word.
  const negated = trimmed.match(NEGATED_FOOD);
  if (negated) return normalise(negated[2]).some(t => FOOD_TOKENS.has(t));

  return false;
}

/**
 * A stated time limit, in minutes.
 *
 * Read in code rather than asked of the model: it is a number in the sentence,
 * the phrasings are few, and a filter that silently reads null because a router
 * omitted a field is exactly the failure this is meant to close. "An hour" and
 * "half an hour" are spelled out often enough to be worth handling.
 */
export function parseMaxMinutes(message: string): number | null {
  const text = message.toLowerCase();

  if (/\bhalf an hour\b/.test(text)) return 30;

  const numeric = text.match(
    /\b(?:under|less than|within|in|max|maximum|no more than|at most|only)?\s*(\d{1,3})\s*(min|mins|minute|minutes|hour|hours|hr|hrs)\b/
  );
  if (numeric) {
    const value = Number(numeric[1]);
    const minutes = /^h/.test(numeric[2]) ? value * 60 : value;
    // Bounds keep a misread quantity ("500g") from becoming a filter.
    return minutes >= 5 && minutes <= 480 ? minutes : null;
  }

  if (/\ban hour\b/.test(text)) return 60;

  return null;
}

/**
 * `previousIntent` is optional so the JSON-failure floor agrees with the happy
 * path without every existing caller having to pass it.
 */
export function heuristicIntent(message: string, previousIntent?: Intent): Intent {
  if (NUTRITION_PHRASES.test(message)) return 'nutrition';
  if (COMPOSE_PHRASES.test(message) && WITH_INGREDIENTS.test(message)) return 'compose';
  if (SEARCH_PHRASES.test(message)) return 'search';
  if (COMPOSE_PHRASES.test(message)) return 'compose';
  if (
    (previousIntent === 'search' || previousIntent === 'compose') &&
    isRefinement(message)
  ) {
    return previousIntent;
  }
  return 'chat';
}

/** Shape the model's answer, or say precisely why it could not be used. */
export function parseRouterOutput(
  raw: unknown
): { intent: Intent; ingredients: string[]; servings: number | null; clarification: { question: string; options: string[] } | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;

  const intent = String(d.intent ?? '').toLowerCase() as Intent;
  if (!INTENTS.includes(intent)) return null;

  const ingredients = Array.isArray(d.ingredients)
    ? d.ingredients
        .filter((x): x is string => typeof x === 'string')
        .map(x => x.trim())
        .filter(x => x.length > 1 && x.length < 60)
        // A router that pads the list produces a dish with phantom
        // ingredients; twelve named items is already more than anyone types.
        .slice(0, 12)
    : [];

  const rawServings = typeof d.servings === 'number' ? d.servings : null;
  const servings =
    rawServings !== null && Number.isInteger(rawServings) && rawServings >= 1 && rawServings <= 12
      ? rawServings
      : null;

  let clarification: { question: string; options: string[] } | null = null;
  const c = d.clarify as Record<string, unknown> | null | undefined;
  if (c && typeof c === 'object' && typeof c.question === 'string' && c.question.trim().length > 8) {
    clarification = {
      question: c.question.trim(),
      options: Array.isArray(c.options)
        ? c.options.filter((x): x is string => typeof x === 'string').slice(0, 4)
        : [],
    };
  }

  return { intent, ingredients, servings, clarification };
}

/**
 * Everything this turn must start clean.
 *
 * State is checkpointed per thread and a thread is the whole chat session, so
 * every channel below survives into the next turn unless something overwrites
 * it. The router is the first node on every path, so it owns the reset. Without
 * it, turn three re-emits turn one's draft as a freshly composed dish, and both
 * clients render a recipe card for a question that never asked for one.
 */
const perTurnReset = {
  draft: null,
  retrieved: [],
  retrievalSufficient: false,
  overflow: [],
  macros: null,
  failures: [],
  assumptions: [],
  compromises: [],
  // 0 is the reset sentinel for this channel; see state.ts.
  composeAttempts: 0,
  // Re-read from this turn's message below. A limit stated five turns ago is
  // not a standing instruction.
  maxMinutes: null,
} satisfies GraphUpdate;

/** The last few turns, so a three-word refinement has an antecedent. */
function recentTurns(state: GraphStateType): string {
  const recent = state.messages.slice(-5, -1).filter(m => m.role !== 'system');
  if (!recent.length) return '';

  const lines = recent.map(m => `${m.role}: ${m.content.slice(0, 200)}`);
  return `\n\nThe conversation so far, oldest first:\n${lines.join('\n')}`;
}

export async function router(state: GraphStateType): Promise<GraphUpdate> {
  emitNode('router');

  const message = state.userMessage;
  if (!message) return { intent: 'chat', ...perTurnReset };

  // LangGraph applies a node's update after it returns, so on entry `intent` is
  // still what the previous turn decided.
  const previousIntent = state.intent;

  try {
    const result = await modelFor('router').complete(
      [
        {
          role: 'system',
          content: `${PROMPT}

The previous turn was classified: ${previousIntent}.

REFINEMENT: a short message that only adds, removes or relaxes a constraint
("under 30 minutes", "something lighter", "no fish", "more protein", "cheaper",
"vegetarian instead") continues the previous turn. Classify it as the previous
intent, not "chat", and carry forward the ingredients already named unless this
message names different ones.${recentTurns(state)}`,
        },
        { role: 'user', content: message },
      ],
      { signal: turnSignal() }
    );

    const parsed = parseRouterOutput(parseJson(result.text));
    if (!parsed) throw new Error('router output failed validation');

    // The prompt asks for this; the override is what makes it reliable. A
    // constraint-shaped aside after a food-finding turn is a continuation of it.
    const carried =
      parsed.intent === 'chat' &&
      (previousIntent === 'search' || previousIntent === 'compose') &&
      isRefinement(message)
        ? previousIntent
        : null;

    const intent = carried ?? parsed.intent;

    // A refinement rarely restates the ingredients it is refining.
    const namedIngredients =
      carried && !parsed.ingredients.length ? state.namedIngredients : parsed.ingredients;

    logger.info('Routed chat turn', {
      intent,
      ...(carried ? { carriedFrom: previousIntent } : {}),
      named: namedIngredients.length,
      clarifying: !!parsed.clarification,
    });

    return {
      ...perTurnReset,
      intent,
      previousIntent,
      namedIngredients,
      maxMinutes: parseMaxMinutes(message),
      servings: parsed.servings,
      clarification: parsed.clarification,
      model: result.model,
      tokensUsed: result.tokensUsed ?? 0,
    };
  } catch (error) {
    const intent = heuristicIntent(message, previousIntent);
    const heuristic = heuristicIngredients(message);
    const namedIngredients =
      !heuristic.length && (intent === 'search' || intent === 'compose') && isRefinement(message)
        ? state.namedIngredients
        : heuristic;

    logger.warn('Router fell back to the phrase heuristic', {
      intent,
      named: namedIngredients.length,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      ...perTurnReset,
      intent,
      previousIntent,
      namedIngredients,
      maxMinutes: parseMaxMinutes(message),
      servings: null,
      clarification: null,
    };
  }
}
