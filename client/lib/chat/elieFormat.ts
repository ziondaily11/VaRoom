// Elie's replies, read as a small, safe subset of Markdown: paragraphs and
// line breaks, **bold**, *italic*, `code`, "- " and "1." lists, "#" headings
// (bold lines), and fenced ``` blocks. A fenced block is text the person will
// use elsewhere (a listing description, a summary highlight, a reply to a
// guest): it is shown with a Copy button, its first line naming it. Nothing
// is ever turned into HTML; the page renders these blocks as React elements.

export type ElieInline = { kind: 'text' | 'bold' | 'italic' | 'code'; text: string };
export type ElieBlock =
  | { kind: 'paragraph'; lines: ElieInline[][] }
  | { kind: 'list'; ordered: boolean; items: ElieInline[][] }
  | { kind: 'copy'; label: string | null; text: string };

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\*[^*\s][^*\n]*?\*)/g;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
// A fence's language tag is not a name worth showing.
const PLAIN_FENCES = new Set(['', 'text', 'txt', 'plaintext', 'markdown', 'md']);

export function parseInline(text: string): ElieInline[] {
  const parts: ElieInline[] = [];
  let last = 0;
  const pattern = new RegExp(INLINE.source, 'g');
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const token = match[0];
    const at = match.index;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    if (token.startsWith('**')) parts.push({ kind: 'bold', text: token.slice(2, -2) });
    else if (token.startsWith('`')) parts.push({ kind: 'code', text: token.slice(1, -1) });
    else parts.push({ kind: 'italic', text: token.slice(1, -1) });
    last = at + token.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

/** "summary_highlight" → "Summary highlight"; a language tag → null. */
export function copyLabel(tag: string): string | null {
  const words = tag.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (PLAIN_FENCES.has(words.toLowerCase())) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parseElieText(text: string): ElieBlock[] {
  const blocks: ElieBlock[] = [];
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let paragraph: ElieInline[][] | null = null;
  let list: Extract<ElieBlock, { kind: 'list' }> | null = null;
  const close = () => { paragraph = null; list = null; };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      close();
      const body: string[] = [];
      for (index += 1; index < lines.length && lines[index].trim() !== '```'; index += 1) body.push(lines[index]);
      const copied = body.join('\n').trim();
      if (copied) blocks.push({ kind: 'copy', label: copyLabel(trimmed.slice(3)), text: copied });
      continue;
    }
    if (!trimmed) { close(); continue; }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        paragraph = null;
        list = { kind: 'list', ordered, items: [] };
        blocks.push(list);
      }
      list.items.push(parseInline((bullet || numbered)![1]));
      continue;
    }
    const heading = HEADING.exec(line);
    const inline = heading ? [{ kind: 'bold' as const, text: heading[1].replace(/\*\*/g, '') }] : parseInline(trimmed);
    if (!paragraph) {
      list = null;
      paragraph = [];
      blocks.push({ kind: 'paragraph', lines: paragraph });
    }
    paragraph.push(inline);
  }
  return blocks;
}
