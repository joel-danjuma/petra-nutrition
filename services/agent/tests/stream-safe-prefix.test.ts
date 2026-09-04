import { streamSafePrefix, stripMarkdown } from '../src/llm/groq';

/**
 * These guard the one place where the split could reintroduce the formatting
 * bug we already fixed once: streaming.
 *
 * The non-streaming path strips markdown from a complete reply, which is easy.
 * Streaming has to decide what is safe to show while the reply is still
 * arriving — and a naive pass-through shows the reader a literal `**` for the
 * few hundred milliseconds before its closing pair lands, plus the raw
 * `[recipe:<uuid>]` marker before its bracket closes.
 */
describe('streamSafePrefix', () => {
  it('withholds an unclosed emphasis run', () => {
    expect(streamSafePrefix('A fresh **Shopska')).toBe('A fresh ');
  });

  it('releases the text once the pair closes', () => {
    expect(streamSafePrefix('A fresh **Shopska Salad**')).toBe('A fresh **Shopska Salad**');
  });

  it('never reveals a partial recipe marker', () => {
    expect(streamSafePrefix('Try this. [recipe:3076f97b')).toBe('Try this. ');
  });

  it('removes a closed marker rather than showing it', () => {
    // extractRecipeRef strips this from a finished reply, but that runs only
    // once the whole reply has arrived — mid-stream nothing else would.
    expect(streamSafePrefix('Try this. [recipe:3076f97b]')).toBe('Try this. ');
  });

  it('leaves ordinary prose entirely alone', () => {
    const plain = 'Shakshuka with feta keeps well and reheats without drying out.';
    expect(streamSafePrefix(plain)).toBe(plain);
  });

  it('holds back only the open construct, not everything after it', () => {
    expect(streamSafePrefix('First sentence. Then *ital')).toBe('First sentence. Then ');
  });

  /**
   * The property that actually matters: whatever a reader sees mid-stream must
   * never contain markdown, at any point in the reply's arrival.
   */
  it('emits no markdown at any prefix length of a marked-up reply', () => {
    const full = 'Try the **Shopska Salad** — it is *quick*. [recipe:abc123]';

    for (let i = 0; i <= full.length; i++) {
      const visible = stripMarkdown(streamSafePrefix(full.slice(0, i)));
      expect(visible).not.toContain('*');
      expect(visible).not.toContain('[recipe:');
    }
  });
});
