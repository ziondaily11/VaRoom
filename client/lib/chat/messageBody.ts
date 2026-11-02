// Chat message bodies may carry the desktop editor's formatting as HTML.
// They are parsed into a tree of allowlisted elements and text; every
// attribute is dropped and text is rendered by React as text, so a body can
// never inject markup or script (the rule the legacy chat-data.js applied
// with DOMParser). Tags outside the allowlist are removed and their content
// kept, except script/style/template, whose content is dropped.

export type MessageBodyTag = 'strong' | 'b' | 'em' | 'i' | 'u' | 'ul' | 'ol' | 'li' | 'p' | 'div' | 'br';
export type MessageBodyNode = string | { tag: MessageBodyTag; children: MessageBodyNode[] };

const ALLOWED = new Set<MessageBodyTag>(['strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'p', 'div', 'br']);
const DROP_CONTENT = new Set(['script', 'style', 'template']);
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const NBSP = String.fromCharCode(0xa0);

/** Same test as legacy: only bodies containing formatting tags are parsed. */
export function hasMessageMarkup(body: string): boolean {
  return /<(?:strong|b|em|i|u|ul|ol|li|p|div|br)\b/i.test(body);
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: NBSP };

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
    if (DROP_CONTENT.has(name) && !token.startsWith('</')) {
      // Skip to the matching close tag (or the end of the body).
      const close = new RegExp(`</${name}\\s*>`, 'ig');
      close.lastIndex = tokens.lastIndex;
      tokens.lastIndex = close.exec(body) ? close.lastIndex : body.length;
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

/**
 * Plain text of a message body, as the legacy previewText produced it: line
 * breaks from <br> and block elements kept, formatting removed. Used for
 * Copy, reply quotes and the pinned banner.
 */
export function messagePlainText(body: string | null | undefined): string {
  const text = (nodes: MessageBodyNode[]): string => nodes.map((node) => {
    if (typeof node === 'string') return node;
    if (node.tag === 'br') return '\n';
    const inner = text(node.children);
    return node.tag === 'p' || node.tag === 'div' || node.tag === 'li' ? `${inner}\n` : inner;
  }).join('');
  return text(parseMessageBody(String(body || '')))
    .split(NBSP).join(' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
