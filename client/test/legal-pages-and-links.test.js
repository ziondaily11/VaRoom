const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..');

test('Landing Page Footer links to Privacy and Terms open in a new tab', () => {
  const footerPath = path.join(clientRoot, 'components', 'landing', 'Footer.tsx');
  const footerContent = fs.readFileSync(footerPath, 'utf8');

  // Both Privacy and Terms must have target="_blank" and rel="noopener noreferrer"
  assert.match(
    footerContent,
    /<Link\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer">Privacy<\/Link>/,
    'Footer Privacy link must open in a new tab with noopener noreferrer'
  );
  assert.match(
    footerContent,
    /<Link\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer">Terms<\/Link>/,
    'Footer Terms link must open in a new tab with noopener noreferrer'
  );
});

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
  const clientHomePath = path.join(clientRoot, 'legacy-pages', 'client-home.html');
  const content = fs.readFileSync(clientHomePath, 'utf8');

  assert.match(
    content,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="rail-legal-link">Privacy Policy<\/a>/,
    'Client Home Privacy Policy link must have target="_blank" and rel="noopener noreferrer"'
  );
  assert.match(
    content,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="rail-legal-link">Terms &amp; Conditions<\/a>/,
    'Client Home Terms link must have target="_blank" and rel="noopener noreferrer"'
  );
});

test('Host Home rail legal links open in a new tab', () => {
  const hostHomePath = path.join(clientRoot, 'legacy-pages', 'host-home.html');
  const content = fs.readFileSync(hostHomePath, 'utf8');

  assert.match(
    content,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="rail-legal-link">Privacy Policy<\/a>/,
    'Host Home Privacy Policy link must have target="_blank" and rel="noopener noreferrer"'
  );
  assert.match(
    content,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="rail-legal-link">Terms &amp; Conditions<\/a>/,
    'Host Home Terms link must have target="_blank" and rel="noopener noreferrer"'
  );
});

test('Help & Support footer legal links open in a new tab', () => {
  const supportPath = path.join(clientRoot, 'legacy-pages', 'support.html');
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
  const settingsPath = path.join(clientRoot, 'legacy-pages', 'settings.html');
  const content = fs.readFileSync(settingsPath, 'utf8');

  assert.match(
    content,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="info-row clickable">/,
    'Settings Privacy Policy link must open in a new tab'
  );
  assert.match(
    content,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer"\s+class="info-row clickable">/,
    'Settings Terms link must open in a new tab'
  );
});

test('Legacy signup pages consent links open in a new tab', () => {
  const clientSignupPath = path.join(clientRoot, 'legacy-pages', 'signup-client.html');
  const clientContent = fs.readFileSync(clientSignupPath, 'utf8');
  assert.match(
    clientContent,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer">Privacy Policy<\/a>/
  );
  assert.match(
    clientContent,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer">Terms of Service<\/a>/
  );

  const hostSignupPath = path.join(clientRoot, 'legacy-pages', 'signup-host.html');
  const hostContent = fs.readFileSync(hostSignupPath, 'utf8');
  assert.match(
    hostContent,
    /<a\s+href="\/privacy"\s+target="_blank"\s+rel="noopener noreferrer">Privacy Policy<\/a>/
  );
  assert.match(
    hostContent,
    /<a\s+href="\/terms"\s+target="_blank"\s+rel="noopener noreferrer">Terms of Service<\/a>/
  );
});

test('Next.js config contains permanent redirects for /terms.html and /privacy.html', () => {
  const nextConfigPath = path.join(clientRoot, 'next.config.js');
  const configContent = fs.readFileSync(nextConfigPath, 'utf8');

  assert.match(configContent, /source:\s*['"]\/privacy\.html['"],\s*destination:\s*['"]\/privacy['"]/);
  assert.match(configContent, /source:\s*['"]\/terms\.html['"],\s*destination:\s*['"]\/terms['"]/);
});

test('LegalDocumentPage provides independent scrolling panes on desktop with hidden scrollbars', () => {
  const legalDocPath = path.join(clientRoot, 'legacy-pages', 'LegalDocumentPage.tsx');
  const docContent = fs.readFileSync(legalDocPath, 'utf8');

  // Must render table of contents and content pane
  assert.match(docContent, /TableOfContents/, 'Must include TableOfContents');
  assert.match(docContent, /className="pp-content-pane"/, 'Must include right scroll pane container');
  assert.match(docContent, /ref=\{contentPaneRef\}/, 'Must bind content pane ref for controlled scrolling');
  assert.match(docContent, /onSelectSection=\{handleSelectSection\}/, 'Must pass section select handler');
  assert.match(docContent, /pane\.scrollTo/, 'Must scroll right content pane smoothly on selection');
  assert.match(docContent, /has-legal-page/, 'Must tag document for overflow lock on desktop');
});

test('PrivacyPolicyPage reuses shared LegalDocumentPage with full feature parity', () => {
  const privacyPagePath = path.join(clientRoot, 'legacy-pages', 'PrivacyPolicyPage.tsx');
  const content = fs.readFileSync(privacyPagePath, 'utf8');

  assert.match(content, /import LegalDocumentPage from ["']\.\/LegalDocumentPage["']/);
  assert.match(content, /<LegalDocumentPage[\s\S]*title="Privacy Policy"/);
});

test('privacy.css defines desktop independent scrolling rules, hidden scrollbars, and dark mode tokens', () => {
  const cssPath = path.join(clientRoot, 'legacy-pages', 'privacy.css');
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
