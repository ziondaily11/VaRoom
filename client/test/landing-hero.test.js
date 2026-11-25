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
  assert.match(hero, /const SPACE_TYPES: \[string, string\]\[\] = \[\['all', 'Any space'\], \.\.\.Object\.entries\(CATEGORY_LABELS\)\];/);
  assert.match(read('lib', 'marketplace', 'marketplace.ts'), /return \{ q: one\('q'\), category, guests: one\('guests'\)/);
  // Each field is labelled; the headline stays the largest content.
  assert.match(hero, /<span className=\{fieldLabel\}>Where<\/span>/);
  assert.match(hero, /<span className=\{fieldLabel\}>Type of space<\/span>/);
  assert.match(hero, /<h1 className="hero-headline /);
  assert.match(hero, /GPS-verified listings, trusted hosts\./);
});

test('the kind of space opens a frosted list (not the system select), upwards, from the keyboard too', () => {
  const hero = read('components', 'landing', 'HeroSection.tsx');
  assert.doesNotMatch(hero, /<select/);
  assert.match(hero, /aria-haspopup="listbox"\s+aria-expanded=\{open\}/);
  assert.match(hero, /role="listbox"[\s\S]*?aria-activedescendant=/);
  assert.match(hero, /role="option"\s+aria-selected=\{index === selected\}/);
  // The shared animated menu (animation.md §8.2), opening above: the hero clips below the search.
  assert.match(hero, /<AnimatedMenu\s+open=\{open\}\s+placement="above-start"/);
  assert.match(hero, /style=\{menuItemStyle\(index\)\}/);
  // The active row is grey, never the system blue.
  assert.match(hero, /index === active \? 'bg-white\/\[0\.12\] text-white' : 'text-white\/80'/);
  assert.match(hero, /transition-transform duration-200 ease-out motion-reduce:transition-none \$\{open \? 'rotate-180' : ''\}/);
  const menu = read('components', 'chat', 'AnimatedMenu.tsx');
  assert.match(menu, /scale\(\.95\)/, 'menus start at .95 (animation.md B10)');
  assert.doesNotMatch(menu, /scale\(\.9\)/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Enter']) assert.match(hero, new RegExp(key));
  assert.match(hero, /document\.addEventListener\('pointerdown', outside\)/);
  assert.match(hero, /return \(\) => document\.removeEventListener\('pointerdown', outside\);/);
});

test('the headline and the line under it are small and in one face; the search is compact', () => {
  const hero = read('components', 'landing', 'HeroSection.tsx');
  // No width cap: each stays on one line wherever the screen is wide enough.
  // Hierarchy: a firmer, tighter headline with balanced breaks; a lighter, airier line under it.
  assert.match(hero, /hero-headline m-0 font-serif font-semibold text-\[27px\] sm:text-\[clamp\(30px,2\.6vw,42px\)\] text-white tracking-\[-0\.03em\] leading-\[1\.08\] \[text-wrap:balance\]/);
  assert.match(hero, />\s*Every kind of space, one place to book&nbsp;it\.\s*</, 'no italic word: one style');
  assert.match(hero, /hero-subtitle m-0 mt-2\.5 sm:mt-3 font-serif font-normal text-\[14px\] sm:text-\[15px\] text-white\/70 tracking-\[0\.005em\] leading-\[1\.6\] \[text-wrap:pretty\]/);
  assert.doesNotMatch(hero, /hero-eyebrow|Stays · Workspaces · Venues/, 'no line above the headline');
  assert.match(hero, /hero-search flex w-full max-w-\[500px\]/);
  assert.match(hero, /landing-cta landing-cta-primary landing-cta-compact/);
});

test('phone search: aligned rows with icons and a divider, thumb-sized, no zoom on tap', () => {
  const hero = read('components', 'landing', 'HeroSection.tsx');
  assert.match(hero, /const fieldValue = '[^']*text-base sm:text-\[13px\]/, 'iPhones zoom into fields under 16px');
  assert.match(hero, /const fieldRow = 'flex w-full min-w-0 items-center gap-3 rounded-\[14px\] px-3\.5 py-2\.5/);
  assert.match(hero, /<MapPin size=\{15\} className=\{fieldIcon\}/);
  assert.match(hero, /<Building2 size=\{15\} className=\{fieldIcon\}/);
  assert.match(hero, /className="mx-3\.5 h-px shrink-0 bg-white\/10 sm:mx-0\.5 sm:h-7 sm:w-px/);
  assert.match(hero, /!min-h-\[46px\] w-full/);
  assert.match(hero, /className="w-full sm:w-\[200px\] rounded-2xl/, 'the list spans the card on phones');
});

test('the phone menu button is visible without hover (its own transparent background)', () => {
  const nav = read('components', 'landing', 'Navbar.tsx');
  assert.match(nav, /className="flex h-10 w-10 items-center justify-center rounded-full border border-white\/15 bg-white\/5 p-0 text-\[#f5efe7\]/);
  assert.match(nav, /aria-label="Open navigation menu"/);
});

test('the top bar is a floating frosted pill; the phone menu stays outside its blur', () => {
  const nav = read('components', 'landing', 'Navbar.tsx');
  assert.match(nav, /className="hero-header-bar relative flex items-center justify-between rounded-full border border-white\/15 bg-\[rgba\(14,15,20,0\.5\)\][^"]*backdrop-blur-md/);
  // The bar closes before the menu: a blurred ancestor would hold the fixed, full-screen menu inside it.
  assert.match(nav, /<Menu size=\{20\} \/>\s*<\/button>\s*<\/div>\s*<\/div>[\s\S]*id="mobile-navigation-menu"/, 'menu after the bar');
  assert.match(nav, /landing-cta-secondary landing-cta-compact/);
  assert.match(read('pages', 'index.tsx'), /\.hero-header \.landing-cta,\s*\.hero-header \.landing-cta-secondary \{\s*border-radius: 9999px !important;/);
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
