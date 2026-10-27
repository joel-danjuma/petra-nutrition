import type { z, ZodTypeAny } from 'zod';
import {
  chatResponseTypeSchema,
  generatedRecipeSchema,
  nutritionBreakdownSchema,
  type ChatResponse,
  type ChatResponseType,
  type GeneratedRecipe,
  type NutritionBreakdown,
} from '@petra/agent-contract';

import type {
  ChatMessageResponse,
  ChatRecipeCard,
  StoredChatMessage,
} from '../types/chat';

/**
 * One assistant reply, however it reached the client.
 *
 * A reply arrives three ways — the `done` frame of a stream, the whole-reply
 * endpoint, and a stored message reloaded from history — and each screen used
 * to read each of them by hand. The web page read history's metadata but not
 * its suggestions; mobile read neither. This is the one shape all three are
 * mapped to, so a reloaded conversation renders what the live one did.
 */
export interface ChatReply {
  /** The stored message's id, when the reply came from storage. */
  messageId?: string;
  /** The final text. On a stream, this replaces whatever was accumulated. */
  content: string;
  type: ChatResponseType;
  confidence?: number;
  structuredData?: unknown;
  /** A library recipe the reply recommended. */
  recipeId?: string;
  /**
   * The library recipe, hydrated — only from the whole-reply endpoint. A
   * streamed or reloaded reply has the `recipeId` alone, and the screen
   * fetches the card itself.
   */
  recipe?: ChatRecipeCard | null;
  /** A dish the assistant composed. Ephemeral until the user saves it. */
  generatedRecipe?: GeneratedRecipe;
  nutrition?: NutritionBreakdown;
  /** What the assistant decided on the user's behalf. */
  assumptions: string[];
  /** Where a constraint could not be fully met, said plainly. */
  compromises: string[];
  /** Tappable follow-ups. On a clarifying question, its answers. */
  suggestions: string[];
  /**
   * The clarifying question, when the turn asked one. Live turns only: it is
   * not stored, but its answers are, as `suggestions`.
   */
  question?: string;
}

/**
 * `ChatMessage.content` is a JSON block array on new rows and a plain string
 * on old ones. Either way, the text.
 */
export function messageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map(block =>
      block && typeof block === 'object' && 'text' in block
        ? String((block as { text: unknown }).text ?? '')
        : ''
    )
    .filter(Boolean)
    .join('\n');
}

/** A stored message's role, as the apps compare it. */
export function messageRole(message: StoredChatMessage): 'user' | 'assistant' {
  return message.role.toLowerCase() === 'user' ? 'user' : 'assistant';
}

/** The reply in a stream's `done` frame, already validated by the decoder. */
export function replyFromResponse(response: ChatResponse): ChatReply {
  return {
    content: response.content,
    type: response.type,
    confidence: response.confidence,
    structuredData: response.structuredData,
    recipeId: response.recipeId,
    generatedRecipe: response.generatedRecipe,
    nutrition: response.nutrition,
    assumptions: response.assumptions,
    compromises: response.compromises,
    suggestions: response.suggestions ?? [],
  };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** The field when it matches its schema, otherwise nothing. */
const parsed = <S extends ZodTypeAny>(
  schema: S,
  value: unknown
): z.infer<S> | undefined => {
  if (value === undefined || value === null) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
};

/**
 * A stored assistant message as a reply: the nine metadata fields the API
 * writes (`storedMetadata` in services/api/src/services/chat-turn.ts).
 *
 * Read field by field, each against the contract's schema, rather than
 * trusting the column. Rows outlive the code that wrote them, and one row
 * from before a schema change should cost that message its card, not crash
 * the screen rendering the whole conversation.
 */
export function replyFromStoredMessage(message: StoredChatMessage): ChatReply {
  const meta =
    message.metadata && typeof message.metadata === 'object'
      ? (message.metadata as Record<string, unknown>)
      : {};

  return {
    messageId: message.id,
    content: messageText(message.content),
    type: parsed(chatResponseTypeSchema, meta.type) ?? 'text',
    confidence:
      typeof meta.confidence === 'number' ? meta.confidence : undefined,
    structuredData: meta.structuredData ?? undefined,
    recipeId: typeof meta.recipeId === 'string' ? meta.recipeId : undefined,
    generatedRecipe: parsed(generatedRecipeSchema, meta.generatedRecipe),
    nutrition: parsed(nutritionBreakdownSchema, meta.nutrition),
    assumptions: strings(meta.assumptions),
    compromises: strings(meta.compromises),
    suggestions: strings(meta.suggestions),
  };
}

/**
 * The whole-reply endpoint's answer. Its stored message carries the metadata
 * (`type` exists nowhere else in the body); the hydrated card and the plain
 * text come from beside it.
 */
export function replyFromMessageResponse(
  response: ChatMessageResponse
): ChatReply {
  const stored = replyFromStoredMessage(response.message);
  return {
    ...stored,
    content: response.content || stored.content,
    recipe: response.recipe,
  };
}
