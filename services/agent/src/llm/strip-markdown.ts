/**
 * Remove markdown from a reply.
 *
 * The prompt forbids it and both models comply, but a stray `**dish**` reaching
 * the chat bubble renders as literal asterisks — the app has no markdown
 * renderer, and the design system rules out bold for emphasis anyway. This is
 * the belt to the prompt's braces.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Fenced and inline code — keep the contents, drop the ticks.
      .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1')
      .replace(/`([^`]+)`/g, '$1')
      // Emphasis, longest delimiter first so ** is consumed before *.
      .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      // Underscore italics only between word boundaries, so snake_case names
      // and ids survive intact.
      .replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, '$1$2')
      // Headings and blockquotes.
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      // Links: keep the label, drop the target.
      .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
      // Bullets and numbered lists become sentences rather than stray glyphs.
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+[.)]\s+/gm, '')
      // Horizontal rules.
      .replace(/^\s*([-*_]\s?){3,}$/gm, '')
      // Collapse the blank lines those removals leave behind.
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * How much of a partially-received reply is safe to show the reader.
 *
 * Streaming raw deltas straight through would defeat `stripMarkdown`: the model
 * emits `**Shopska Salad**` across three chunks, and the reader watches literal
 * asterisks appear and then fail to disappear. Worse, the `[recipe:<id>]`
 * marker would be visible for the moment before its closing bracket arrives.
 *
 * So the tail is withheld from the first construct that is still open — an
 * unclosed bracket, or an odd number of emphasis runs — and released as soon as
 * the closing delimiter lands. In practice this holds back a few characters for
 * a few milliseconds and is invisible.
 */
export function streamSafePrefix(raw: string): string {
  // Completed markers are removed outright. `extractRecipeRef` does this for a
  // finished reply, but that runs only once the whole thing has arrived — mid
  // stream, nothing else would take the marker out before the reader saw it.
  const text = raw.replace(/\[recipe:[^\]]*\]/gi, '');

  let cut = text.length;

  // A marker that is still arriving is withheld along with everything after it.
  const lastOpen = text.lastIndexOf('[');
  if (lastOpen !== -1 && text.indexOf(']', lastOpen) === -1) {
    cut = Math.min(cut, lastOpen);
  }

  // Pair up delimiter runs left to right; whatever is left unmatched is still
  // open, and everything from the earliest of those onward is withheld.
  //
  // Counting runs alone is not enough, which a property test caught: while
  // `**bold**` is arriving, the string passes through the state `**bold*` —
  // two runs, an even count, apparently closed. Letting that through hands
  // `stripMarkdown` an unbalanced pair, and it emits a stray asterisk that
  // never disappears. Pairing by run length rejects that state instead.
  for (const delimiter of ['*', '_', '`']) {
    const runs = [...text.matchAll(new RegExp(`\\${delimiter}+`, 'g'))];
    const open: { index: number; length: number }[] = [];

    for (const run of runs) {
      const entry = { index: run.index ?? 0, length: run[0].length };
      const top = open[open.length - 1];

      if (top && top.length === entry.length) {
        open.pop();
      } else {
        open.push(entry);
      }
    }

    if (open.length > 0) cut = Math.min(cut, open[0].index);
  }

  return text.slice(0, cut);
}
