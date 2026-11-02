const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const { toExcerpt, EXCERPT_MAX_LENGTH } = loadTs(path.join(root, 'lib', 'propertyNewsExcerpt.ts'));

// Every word of the excerpt (minus the ellipsis) must be a whole word of the source.
function assertWholeWords(excerpt, source) {
  const words = excerpt.replace(/…$/, '').split(' ');
  const sourceWords = new Set(source.split(/\s+/).flatMap((w) => [w, w.replace(/[,;:—–-]+$/, '')]));
  for (const word of words) assert.ok(sourceWords.has(word), `"${word}" is not a whole source word`);
}

const sentence = (n) => `Sentence number ${n} explains how the county land board will review property rates for landlords.`;

test('short and empty content is returned unchanged without an ellipsis', () => {
  assert.equal(toExcerpt('Nairobi approves new zoning rules.'), 'Nairobi approves new zoning rules.');
  assert.equal(toExcerpt('  Spaced   out\ntext  '), 'Spaced out text');
  assert.equal(toExcerpt(''), '');
  assert.equal(toExcerpt(undefined), '');
  assert.equal(toExcerpt(null), '');
});

test('content under the limit, and complete text of exactly the limit, is untouched', () => {
  const under = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
  assert.equal(toExcerpt(under), under);

  const exact = ('word '.repeat(60)).slice(0, EXCERPT_MAX_LENGTH - 1) + '.';
  assert.equal(exact.length, EXCERPT_MAX_LENGTH);
  assert.equal(toExcerpt(exact), exact);
});

test('long text prefers the last complete sentence that fits', () => {
  const text = [1, 2, 3, 4].map(sentence).join(' ');
  const result = toExcerpt(text);
  assert.ok(result.length <= EXCERPT_MAX_LENGTH);
  assert.equal(result, [1, 2].map(sentence).join(' '));
  assert.ok(!result.endsWith('…'), 'a complete sentence needs no ellipsis');
});

test('a long single sentence falls back to the last complete word with an ellipsis', () => {
  const text = 'The proposed public-private partnership '.repeat(10).trim() + '.';
  const result = toExcerpt(text);
  assert.ok(result.length <= EXCERPT_MAX_LENGTH, `length ${result.length}`);
  assert.ok(result.endsWith('…'));
  assert.ok(!/[\s,;:]…$/.test(result));
  assertWholeWords(result, text);
});

test('a short first sentence is not used when it would drop most of the excerpt', () => {
  const text = 'Rates rise. ' + 'Landlords across Nairobi and Kiambu counties must now file revised valuations '.repeat(5);
  const result = toExcerpt(text);
  assert.notEqual(result, 'Rates rise.');
  assert.ok(result.endsWith('…'));
  assert.ok(result.length <= EXCERPT_MAX_LENGTH);
  assertWholeWords(result, text);
});

test('text near the limit: 279, 280 and 281 characters', () => {
  const base = 'Kenya lands ministry '.repeat(20);

  const t279 = base.slice(0, 278).trimEnd().padEnd(278, 'x') + '.';
  assert.equal(t279.length, 279);
  assert.equal(toExcerpt(t279), t279);

  const t281 = (base.slice(0, 280) + 'z').replace(/\s+/g, ' ');
  assert.ok(t281.length > EXCERPT_MAX_LENGTH);
  const r281 = toExcerpt(t281);
  assert.ok(r281.length <= EXCERPT_MAX_LENGTH);
  assert.ok(r281.endsWith('…'));
  assertWholeWords(r281, base);

  // A word ending exactly at the limit boundary is kept whole.
  // 31 nine-character words fill 279 characters, so the last one ends right where the ellipsis goes.
  const fits = Array.from({ length: 31 }, () => 'abcdefgh').join(' ') + 'x';
  assert.equal(fits.length, EXCERPT_MAX_LENGTH - 1);
  const atBoundary = fits + ' tail words continue here';
  assert.equal(toExcerpt(atBoundary), fits + '…');
});

test('summaries already hard-cut at 280 characters drop the partial final word', () => {
  const lead = 'The county government announced a new framework that will see developers and landlords share '
    + 'infrastructure costs with the state while tenants benefit from capped rents across Nairobi, Kiambu and Machakos under the ';
  // One padding word sized so the 280-character cut lands inside "partnership".
  const tail = 'new public-private partnership rules for housing.';
  const padLength = EXCERPT_MAX_LENGTH - lead.length - 'new public-private pa'.length;
  const original = lead + 'k'.repeat(padLength - 1) + ' ' + tail;
  const stored = original.slice(0, EXCERPT_MAX_LENGTH);
  assert.equal(stored.length, EXCERPT_MAX_LENGTH);
  assert.match(stored, /pa$/, 'fixture reproduces the "public-private pa" cut');

  const result = toExcerpt(stored);
  assert.ok(result.length <= EXCERPT_MAX_LENGTH);
  assert.ok(result.endsWith('…'));
  assert.ok(!/\bpa…$/.test(result), result);
  assertWholeWords(result, original);
});

test('All News lead and cards use the shared excerpt helper; the article view does not', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'property-news.tsx'), 'utf8');
  assert.match(source, /import \{ toExcerpt \} from '\.\.\/lib\/propertyNewsExcerpt'/);
  assert.match(source, /toExcerpt\(lead\.summary\)/);
  assert.match(source, /toExcerpt\(news\.summary\)/);
  assert.doesNotMatch(source, /toExcerpt\(summaryText\)|toExcerpt\(detailItem/);
  assert.equal((source.match(/toExcerpt\(/g) || []).length, 2);
});
