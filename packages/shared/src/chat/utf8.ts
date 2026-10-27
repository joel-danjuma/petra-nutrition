/**
 * A streaming UTF-8 decoder, for a runtime with no `TextDecoder`.
 *
 * The contract's frame decoder reaches for `TextDecoder` when handed bytes.
 * Browsers have one, and Expo's runtime installs one on native — but an older
 * Hermes build did not, and a missing global there would fail every streamed
 * turn with a ReferenceError rather than a message. So bytes are decoded here
 * when there is nothing to delegate to, and the frame decoder is fed strings.
 *
 * Streaming matters for the same reason it does in `TextDecoder`: a read can
 * end halfway through a multi-byte character ("crème", "½ tsp"), and the tail
 * has to wait for the next read rather than become U+FFFD.
 */
export interface Utf8Decoder {
  decode(bytes: Uint8Array): string;
  /** Anything left over is an incomplete character: U+FFFD, as the spec says. */
  end(): string;
}

const REPLACEMENT = '�';

/** Total bytes in a sequence, from its lead byte; 0 for an invalid lead. */
const sequenceLength = (lead: number): number => {
  if (lead < 0x80) return 1;
  if (lead >= 0xc2 && lead < 0xe0) return 2;
  if (lead >= 0xe0 && lead < 0xf0) return 3;
  if (lead >= 0xf0 && lead < 0xf5) return 4;
  return 0;
};

const isContinuation = (byte: number): boolean => (byte & 0xc0) === 0x80;

export function createUtf8Decoder(): Utf8Decoder {
  let pending: number[] = [];

  const decode = (bytes: Uint8Array): string => {
    const input = pending.length ? [...pending, ...bytes] : Array.from(bytes);
    pending = [];
    let out = '';
    let i = 0;

    while (i < input.length) {
      const lead = input[i];
      const length = sequenceLength(lead);
      if (length === 0) {
        out += REPLACEMENT;
        i += 1;
        continue;
      }
      if (length === 1) {
        out += String.fromCharCode(lead);
        i += 1;
        continue;
      }
      // Split across reads: keep the start for next time.
      if (i + length > input.length) {
        const tail = input.slice(i);
        if (tail.slice(1).every(isContinuation)) {
          pending = tail;
          break;
        }
      }

      let codePoint = lead & (0xff >> (length + 1));
      let valid = true;
      for (let k = 1; k < length; k += 1) {
        const byte = input[i + k];
        if (byte === undefined || !isContinuation(byte)) {
          valid = false;
          break;
        }
        codePoint = (codePoint << 6) | (byte & 0x3f);
      }
      if (!valid) {
        out += REPLACEMENT;
        i += 1;
        continue;
      }
      out += String.fromCodePoint(codePoint);
      i += length;
    }
    return out;
  };

  return {
    decode,
    end() {
      const leftover = pending.length ? REPLACEMENT : '';
      pending = [];
      return leftover;
    },
  };
}
