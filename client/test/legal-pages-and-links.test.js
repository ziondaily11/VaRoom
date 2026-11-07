const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadTs } = require('./helpers/loadTs');

const clientRoot = path.join(__dirname, '..');
const legal = loadTs(path.join(clientRoot, 'lib', 'legal', 'legalDocument.ts'));

test('Landing Page SignupForm consent links to Privacy and Terms open in a new tab', () => {
  const signupPath = path.join(clientRoot, 'components', 'landing', 'SignupForm.tsx');
  const signupContent = fs.readFileSync(signupPath, 'utf8');

  assert.match(
    signupContent,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer"[^>]*>Privacy Policy<\/a>/,
    'SignupForm Privacy Policy link must open in a new tab'
  );
  assert.match(
    signupContent,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer"[^>]*>Terms of Service<\/a>/,
    'SignupForm Terms of Service link must open in a new tab'
  );
});

test('Client Home rail legal links open in a new tab', () => {
  const clientHomePath = path.join(clientRoot, 'pages', 'client-home.tsx');
  const content = fs.readFileSync(clientHomePath, 'utf8');

  assert.match(
    content,
    /<a href="\/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy<\/a>/,
    'Client Home Privacy Policy link must have target="_blank" and rel="noopener noreferrer"'
  );
  assert.match(
    content,
    /<a href="\/terms" target="_blank" rel="noopener noreferrer">Terms &amp; Conditions<\/a>/,
    'Client Home Terms link must have target="_blank" and rel="noopener noreferrer"'
  );
});

test('Host Home rail legal links open in a new tab', () => {
  const hostHomePath = path.join(clientRoot, 'components', 'hostHome', 'HostRail.tsx');
  const content = fs.readFileSync(hostHomePath, 'utf8');

  assert.match(
    content,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer"\s+className="rail-legal-link">Privacy Policy<\/a>/,
    'Host Home Privacy Policy link must have target="_blank" and rel="noopener noreferrer"'
  );
  assert.match(
    content,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer"\s+className="rail-legal-link">Terms &amp; Conditions<\/a>/,
    'Host Home Terms link must have target="_blank" and rel="noopener noreferrer"'
  );
});

test('Help & Support footer legal links open in a new tab', () => {
  const supportPath = path.join(clientRoot, 'pages', 'support.tsx');
  const content = fs.readFileSync(supportPath, 'utf8');

  assert.match(
    content,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer">Terms &amp; Conditions<\/a>/,
    'Support Terms link must have target="_blank" and rel="noopener noreferrer"'
  );
  assert.match(
    content,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer">Privacy Policy<\/a>/,
    'Support Privacy link must have target="_blank" and rel="noopener noreferrer"'
  );
});

test('Settings page policy links open in a new tab', () => {
  const content = fs.readFileSync(path.join(clientRoot, 'components', 'settings', 'SettingsSections.tsx'), 'utf8');
  assert.match(content, /<LinkRow href="\/privacy" [^>]*external \/>/, 'Settings Privacy Policy link must open in a new tab');
  assert.match(content, /<LinkRow href="\/terms" [^>]*external \/>/, 'Settings Terms link must open in a new tab');
  assert.match(content, /external \? \{ target: '_blank', rel: 'noopener noreferrer' \}/);
});

test('the legacy sign-up pages are retired (E2)', () => {
  for (const file of ['signup-client.html', 'signup-host.html']) assert.equal(fs.existsSync(path.join(clientRoot, 'legacy-pages', file)), false, `${file} is retired (E2)`);
});

test('Next.js config contains permanent redirects for /terms.html and /privacy.html', () => {
  const nextConfigPath = path.join(clientRoot, 'next.config.js');
  const configContent = fs.readFileSync(nextConfigPath, 'utf8');

  assert.match(configContent, /source:\s*['"]\/privacy\.html['"],\s*destination:\s*['"]\/privacy['"]/);
  assert.match(configContent, /source:\s*['"]\/terms\.html['"],\s*destination:\s*['"]\/terms['"]/);
});

test('legal documents: web links open in a new tab; email and in-app links do not', () => {
  assert.deepEqual({ ...legal.legalLinkTarget('https://varoom.co.ke') }, { target: '_blank', rel: 'noopener noreferrer' });
  assert.deepEqual({ ...legal.legalLinkTarget('mailto:privacy@varoom.co.ke') }, { target: undefined, rel: undefined });
  assert.deepEqual({ ...legal.legalLinkTarget('/terms') }, { target: undefined, rel: undefined });
});

test('legal documents: on desktop the section list scrolls the content pane, which tracks the active section', () => {
  const css = fs.readFileSync(path.join(clientRoot, 'styles', 'privacy.css'), 'utf8');
  // The JS breakpoint matches the stylesheet's independent-pane layout.
  assert.match(css, /@media\s*\(\s*min-width:\s*901px\s*\)/);
  assert.equal(legal.isPaneLayout(901), true);
  assert.equal(legal.isPaneLayout(900), false, 'below it the window scrolls');
  // Selecting a section scrolls the pane so it sits 24 px below the pane's top, never above 0.
  assert.equal(legal.paneScrollTopFor(500, 100, 200), 576);
  assert.equal(legal.paneScrollTopFor(110, 100, 0), 0);
  // The active section is the last one whose top reached the line (140 px in the pane, 180 px in the window).
  assert.equal(legal.activeSectionLimit(true), 140);
  assert.equal(legal.activeSectionLimit(false), 180);
  const tops = [{ id: 'intro', top: -400 }, { id: 'data', top: 120 }, { id: 'cookies', top: 600 }];
  assert.equal(legal.activeSectionId(tops, 140), 'data');
  assert.equal(legal.activeSectionId(tops, 100), 'intro');
  assert.equal(legal.activeSectionId([{ id: 'intro', top: 300 }], 180), '', 'none yet (the previous one stays active)');
  const page = fs.readFileSync(path.join(clientRoot, 'components', 'legal', 'LegalDocumentPage.tsx'), 'utf8');
  assert.match(page, /has-legal-page/, 'tags the document for the desktop overflow lock in privacy.css');
  assert.match(css, /html\.has-legal-page/);
});

test('Privacy Policy and Terms share the legal document layout with well-formed content', () => {
  const privacyPage = fs.readFileSync(path.join(clientRoot, 'components', 'legal', 'PrivacyPolicyPage.tsx'), 'utf8');
  assert.match(privacyPage, /<LegalDocumentPage[\s\S]*title="Privacy Policy"/);
  for (const file of ['privacyContent.ts', 'termsContent.ts']) {
    const content = loadTs(path.join(clientRoot, 'lib', 'legal', file));
    const ids = content.sections.map((section) => section.id);
    assert.ok(ids.length > 0, file);
    assert.equal(new Set(ids).size, ids.length, `${file}: section ids are unique (they are the URL hashes)`);
    for (const section of content.sections) assert.ok(section.title && section.blocks.length, `${file}: ${section.id}`);
    assert.match(content.LAST_UPDATED, /\d{4}$/);
  }
});

test('privacy.css defines desktop independent scrolling rules, hidden scrollbars, and dark mode tokens', () => {
  const cssPath = path.join(clientRoot, 'styles', 'privacy.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Desktop media query
  assert.match(cssContent, /@media\s*\(\s*min-width:\s*901px\s*\)/, 'Must contain desktop media query');
  assert.match(cssContent, /html:has\(\.pp-root\)/, 'Must contain html overflow rules for desktop');
  assert.match(cssContent, /overflow:\s*hidden/, 'Must lock window overflow on desktop');

  // Both .pp-toc and .pp-content-pane must have independent scroll and hidden scrollbars
  assert.match(cssContent, /\.pp-toc\s*\{[\s\S]*?overflow-y:\s*auto;/, 'TOC must have overflow-y: auto on desktop');
  assert.match(cssContent, /\.pp-content-pane\s*\{[\s\S]*?overflow-y:\s*auto;/, 'Content pane must have overflow-y: auto on desktop');
  assert.match(cssContent, /scrollbar-width:\s*none;/, 'Must specify scrollbar-width: none');
  assert.match(cssContent, /-ms-overflow-style:\s*none;/, 'Must specify -ms-overflow-style: none');
  assert.match(cssContent, /::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none;/, 'Must hide webkit scrollbars');

  // Overscroll containment to prevent chaining
  assert.match(cssContent, /overscroll-behavior:\s*contain;/, 'Must contain overscroll behavior');

  // Dark mode compatibility
  assert.match(cssContent, /\[data-theme="dark"\]\s+\.pp-root/, 'Must include dark mode root overrides');
  assert.match(cssContent, /--pp-bg:\s*#000000;/, 'Must use pure black for dark mode');

  // Mobile layout without nested scrolling
  assert.match(cssContent, /@media\s*\(\s*max-width:\s*900px\s*\)/, 'Must contain mobile media query');
  assert.match(cssContent, /\.pp-content-pane\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/, 'Mobile must remove nested scrolling container');
});
