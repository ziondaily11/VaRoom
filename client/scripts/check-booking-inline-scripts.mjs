import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const file = new URL('../legacy-pages/booking.html', import.meta.url);
const html = readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
let checked = 0;

for (const [index, [, attributes, source]] of scripts.entries()) {
  if (/\bsrc\s*=/i.test(attributes)) continue;

  const type = attributes.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
  if (type && !['text/javascript', 'application/javascript'].includes(type)) continue;

  new Script(source, { filename: `${file.pathname}#inline-${index + 1}` });
  checked += 1;
}

if (checked === 0) {
  throw new Error('No inline JavaScript found in booking.html.');
}

console.log(`Validated ${checked} inline script(s) in booking.html.`);
