const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('the hero search opens the marketplace with its own filters (place and kind of space)', () => {
  const hero = read('components', 'landing', 'HeroSection.tsx');
  assert.match(hero, /<form\s+role="search"\s+aria-label="Find a space"/);
  assert.match(hero, /if \(place\.trim\(\)\) query\.q = place\.trim\(\);/);
  assert.match(hero, /if \(category !== 'all'\) query\.category = category;/);
  assert.match(hero, /void router\.push\(\{ pathname: '\/marketplace', query \}\);/, 'client-side, no full reload');
  // The kinds of space are the marketplace's own, so every choice filters something real.
  assert.match(hero, /Object\.entries\(CATEGORY_LABELS\)\.map/);
  assert.match(read('lib', 'marketplace', 'marketplace.ts'), /return \{ q: one\('q'\), category, guests: one\('guests'\)/);
  // Each field is labelled; the headline stays the largest content.
  assert.match(hero, /<span className=\{fieldLabel\}>Where<\/span>/);
  assert.match(hero, /<span className=\{fieldLabel\}>Type of space<\/span>/);
  assert.match(hero, /<h1 className="hero-headline /);
  assert.match(hero, /GPS-verified listings, trusted hosts\./);
});

test('the night hero: light top bar, dark fallback colour, phone crop', () => {
  const page = read('pages', 'index.tsx');
  assert.match(page, /\.hero-nav-link \{[\s\S]*?color: #f5efe7;/);
  assert.match(page, /\.hero-header \.landing-cta\.landing-cta-primary \{\s*background: #f5efe7 !important;/);
  assert.match(page, /overflow-hidden z-0 bg-\[#12141c\]"/, 'white text is readable before the photo arrives');
  assert.match(page, /<source media="\(max-width: 767px\)" srcSet=\{heroPhone\.src\} \/>/);
  assert.match(read('components', 'landing', 'Navbar.tsx'), /className="text-\[#f5efe7\]"[\s\S]*?Room/);
  for (const name of ['hero-desktop.webp', 'hero-phone.webp']) {
    assert.ok(fs.statSync(path.join(root, 'assets', 'landing', name)).size < 150 * 1024, `${name} stays small`);
  }
});
