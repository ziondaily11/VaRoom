// Host Home upgrade: styles scoped to the page (no document root, body or
// shared-sidebar rules), the shared phone bar's own colours, search by name,
// no dead links, a plain chat error, Escape closes the post menu.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Host Home styles stay inside the page and leave the shared sidebar alone', () => {
  const css = read('components', 'hostHome', 'hostHomeStyles.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const body = css.split('export const HOST_HOME_STYLES = `')[1];
  for (const rule of body.match(/^\s*[^@\s}][^{};]*\{/gm) || []) {
    if (/^\s*(from|to|\d+%)/.test(rule)) continue;
    assert.match(rule, /host-home-page/, `unscoped rule: ${rule.trim()}`);
  }
  assert.doesNotMatch(body, /:root|(^|[\s,])body\s*\{/m);
  assert.doesNotMatch(body, /\.sidebar(?![-\w])|\.nav-item|\.notif-nav-badge|\.sidebar-backdrop/, 'the shell owns its sidebar');
  const page = read('pages', 'host-home.tsx');
  assert.match(page, /<div className="host-home-page">/);
  assert.doesNotMatch(page, /fonts\.googleapis/);
});

test('no bottom bar: its styles are gone from the shell', () => {
  const shell = read('components', 'shell', 'shellStyles.ts');
  assert.doesNotMatch(shell, /varoom-mobile-nav|MOBILE_NAV_STYLES|has-varoom-mobile-nav/);
});

test('search, links, errors and the post menu', () => {
  const lib = read('lib', 'hostHome', 'hostHome.ts');
  assert.match(lib, /\.or\(`title\.ilike\.%\$\{safeTerm\}%,location_text\.ilike\.%\$\{safeTerm\}%`\)/);
  const page = read('pages', 'host-home.tsx');
  assert.match(page, /placeholder="Search places or @user"/);
  assert.match(page, /notify\("We couldn't open the chat\. Please try again\."\)/);
  assert.match(page, /if \(event\.key === 'Escape'\) setOpenMenu\(null\);/);
  const rail = read('components', 'hostHome', 'HostRail.tsx');
  assert.doesNotMatch(rail, /href="#"/);
  assert.match(rail, />Property News<\/h2>/);
});
