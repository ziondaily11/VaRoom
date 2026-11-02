// Chat message bodies may carry the desktop editor's formatting as HTML.
// They are parsed into a tree of allowlisted elements and text; every
// attribute is dropped and text is rendered by React as text, so a body can
// never inject markup or script (the rule the legacy chat-data.js applied
// with DOMParser). Tags outside the allowlist are removed and their content
// kept.

export type MessageBodyTag = 'strong' | 'b' | 'em' | 'i' | 'u' | 'ul' | 'ol' | 'li' | 'p' | 'div' | 'br';
export type MessageBodyNode = string | { tag: MessageBodyTag; children: MessageBodyNode[] };

const ALLOWED = new Set<MessageBodyTag>(['strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'p', 'div', 'br']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);

/** Same test as legacy: only bodies containing formatting tags are parsed. */
export function hasMessageMarkup(body: string): boolean {
  return /<(?:strong|b|em|i|u|ul|ol|li|p|div|br)\b/i.test(body);
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named === undefined ? match : named;
  });
}

interface OpenElement { tag: string; children: MessageBodyNode[] }

export function parseMessageBody(body: string): MessageBodyNode[] {
  const root: OpenElement = { tag: '#root', children: [] };
  const stack: OpenElement[] = [root];
  const tokens = /<!--[\s\S]*?(?:-->|$)|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|[^<]+|</g;
  let match: RegExpExecArray | null;

  while ((match = tokens.exec(body))) {
    const token = match[0];
    const name = match[1] ? match[1].toLowerCase() : null;
    const current = stack[stack.length - 1];
    if (token.startsWith('<!--')) continue;
    if (!name) {
      current.children.push(decodeEntities(token));
      continue;
    }
    if (token.startsWith('</')) {
      // Close the nearest matching open element (and anything left open inside it).
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === name) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    if (!ALLOWED.has(name as MessageBodyTag)) continue;
    const element: OpenElement = { tag: name, children: [] };
    current.children.push(element as MessageBodyNode);
    if (!VOID.has(name) && !token.endsWith('/>')) stack.push(element);
  }
  return root.children;
}
