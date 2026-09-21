import type {
  CallOptions,
  ChatModel,
  CompletionResult,
  NodeName,
} from '../../src/llm/provider';
import type { ChatMessage } from '../../src/llm/types';

/**
 * A scripted model, for asserting graph behaviour without a network.
 *
 * Registered through `setModel`, the same seam an OpenRouter adapter or an eval
 * harness would use. Two things make it useful beyond "it returns a string":
 * it records the prompts it was given, so a test can assert that the compose
 * node actually told the model about the allergy; and it can return a different
 * reply per call, which is how the retry path gets exercised.
 */
export class FakeModel implements ChatModel {
  readonly node: NodeName;
  readonly modelId = 'fake-model';
  /** Every message list this model was handed, in order. */
  readonly calls: ChatMessage[][] = [];

  private readonly replies: string[];

  constructor(node: NodeName, replies: string | string[]) {
    this.node = node;
    this.replies = Array.isArray(replies) ? replies : [replies];
  }

  private next(messages: ChatMessage[]): CompletionResult {
    this.calls.push(messages);
    // The last reply repeats, so a test that scripts one answer does not have
    // to care how many times a node is reached.
    const index = Math.min(this.calls.length - 1, this.replies.length - 1);
    return { text: this.replies[index], model: this.modelId, tokensUsed: 10 };
  }

  async complete(messages: ChatMessage[], _opts?: CallOptions): Promise<CompletionResult> {
    return this.next(messages);
  }

  async stream(
    messages: ChatMessage[],
    onDelta: (delta: string) => void,
    _opts?: CallOptions
  ): Promise<CompletionResult> {
    const result = this.next(messages);
    // Split into small deltas so stream-sanitising logic is genuinely exercised
    // rather than handed the whole reply in one piece.
    for (let i = 0; i < result.text.length; i += 7) {
      onDelta(result.text.slice(i, i + 7));
    }
    return result;
  }

  /** Everything this model was told, flattened — for prompt assertions. */
  get promptText(): string {
    return this.calls.flat().map(m => m.content).join('\n');
  }
}

/** The JSON a well-behaved router returns. */
export const routerReply = (
  intent: string,
  ingredients: string[],
  servings: number | null = null,
  clarify: { question: string; options: string[] } | null = null
): string => JSON.stringify({ intent, ingredients, servings, clarify });
