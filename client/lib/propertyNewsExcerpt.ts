export const EXCERPT_MAX_LENGTH = 280;

const ELLIPSIS = '…';
// A sentence boundary is only worth using if it keeps a reasonable share of the excerpt.
const MIN_SENTENCE_SHARE = 0.4;
const SENTENCE_END = /[.!?]["'”’)]?(?=\s|$)/;
const TERMINAL_PUNCTUATION = /[.!?…]["'”’)]?$/;
const TRAILING_SEPARATORS = /[\s,;:—–-]+$/;

/**
 * Shortens text for Property News card excerpts without breaking words.
 * Prefers the last complete sentence that fits, falls back to the last
 * complete word plus an ellipsis, and never exceeds `maxLength`.
 *
 * Text of exactly `maxLength` characters without closing punctuation is
 * treated as already cut: the news pipeline hard-slices summaries at 280
 * characters, which can leave a partial final word.
 */
export function toExcerpt(text: string | null | undefined, maxLength: number = EXCERPT_MAX_LENGTH): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const alreadyCut = clean.length === maxLength && !TERMINAL_PUNCTUATION.test(clean);
  if (clean.length <= maxLength && !alreadyCut) return clean;

  let sentenceEnd = -1;
  const sentenceEnds = new RegExp(SENTENCE_END.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = sentenceEnds.exec(clean)) !== null) {
    const end = match.index + match[0].length;
    if (end > maxLength) break;
    sentenceEnd = end;
  }
  if (sentenceEnd >= maxLength * MIN_SENTENCE_SHARE) {
    return clean.slice(0, sentenceEnd);
  }

  const limit = maxLength - ELLIPSIS.length;
  // When the source is already cut, its final token may be partial, so it is never kept whole.
  const wordEnd = !alreadyCut && clean.length > limit && clean[limit] === ' '
    ? limit
    : clean.lastIndexOf(' ', limit - 1);
  const cut = wordEnd > 0 ? clean.slice(0, wordEnd) : clean.slice(0, limit);
  return cut.replace(TRAILING_SEPARATORS, '') + ELLIPSIS;
}
