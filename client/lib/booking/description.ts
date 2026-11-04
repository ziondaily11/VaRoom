// The listing description on the booking page: a clean preview of up to
// three lines (220 characters, 140 on phones) with Read more / Show less.
// Ported unchanged from legacy-pages/booking.html.

const TRAILING = /[\s,;:\-–—.*•]+(\s*and)?$/i;

function trimAtWord(text: string): string {
  let result = text;
  const lastSpace = result.search(/\s+[^\s]*$/);
  if (lastSpace > result.length * 0.5) result = result.slice(0, lastSpace);
  return result.replace(TRAILING, '').trim();
}

const normalize = (text: string | null | undefined) => (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

export function getCleanTruncatedDescription(fullText: string | null | undefined, maxChars = 220, maxLines = 3): { text: string; hasOverflow: boolean } {
  const normalized = normalize(fullText);
  if (!normalized) return { text: '', hasOverflow: false };

  const rawLines = normalized.split('\n');
  if (rawLines.length <= maxLines && normalized.length <= maxChars) {
    return { text: normalized, hasOverflow: false };
  }

  const accumulated: string[] = [];
  let currentLength = 0;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (accumulated.length >= maxLines) break;
    if (currentLength + line.length > maxChars && accumulated.length > 0) {
      const remaining = Math.max(30, maxChars - currentLength);
      const partial = trimAtWord(line.slice(0, remaining));
      if (partial) accumulated.push(partial);
      break;
    }
    accumulated.push(line);
    currentLength += line.length + 1;
    if (currentLength >= maxChars) {
      const longLine = accumulated.pop() as string;
      const cut = trimAtWord(longLine.slice(0, maxChars));
      if (cut) accumulated.push(cut);
      break;
    }
  }

  let result = accumulated.join('\n').trim();
  if (!result) result = trimAtWord(normalized.slice(0, maxChars));
  result = result.replace(TRAILING, '').trim();

  if (result.length >= normalized.length) {
    return { text: normalized, hasOverflow: false };
  }
  return { text: result, hasOverflow: true };
}

/** Paragraphs (split on blank lines), each trimmed. */
export function descriptionParagraphs(text: string | null | undefined): string[] {
  const normalized = normalize(text);
  if (!normalized) return [];
  return normalized.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0).map((paragraph) => paragraph.trim());
}

/** Preview length: 140 characters on phones (under 640 px wide), else 220; 220 when the width is unknown (server render). */
export const descriptionPreviewChars = (viewportWidth: number | null) => (viewportWidth !== null && viewportWidth < 640 ? 140 : 220);

/** The paragraphs shown: the whole description when expanded, else the preview. */
export const visibleParagraphs = (fullText: string, preview: { text: string }, expanded: boolean) =>
  descriptionParagraphs(expanded ? fullText : preview.text);
