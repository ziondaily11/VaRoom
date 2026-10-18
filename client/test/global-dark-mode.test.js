const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');

test('varoom-dark-theme.css defines true #000000 canvas and X Lights Out tokens', () => {
  const css = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-dark-theme.css'), 'utf8');

  // Verify core surfaces are pitch black #000000
  assert.match(css, /--paper:\s*#000000;/, 'var(--paper) must be #000000');
  assert.match(css, /--white:\s*#000000;/, 'var(--white) in dark mode must be #000000');
  assert.match(css, /--surface:\s*#000000;/, 'var(--surface) must be #000000');
  assert.match(css, /\[data-theme="dark"\] body\s*\{\s*background:\s*#000000 !important;/, 'Dark body must be #000000');
  assert.match(css, /--line:\s*rgba\(255,255,255,\.12\);/, 'Divider lines must be visible against black');

  // Verify text tokens
  assert.match(css, /--ink:\s*#E7E9EA;/, 'Primary text must be crisp light');
  assert.match(css, /--muted:\s*#71767b;/, 'Muted text must have sufficient contrast');

  // Verify no warm-brown legacy variables in core tokens
  assert.doesNotMatch(css, /--paper:\s*#0F0D0D;/, 'Old #0F0D0D must be removed from --paper');
  assert.doesNotMatch(css, /--white:\s*#0F0D0D;/, 'Old #0F0D0D must be removed from --white');
  assert.doesNotMatch(css, /--paper:\s*#15100F;/, 'Old #15100F must not be in tokens');
  assert.doesNotMatch(css, /--white:\s*#241C1A;/, 'Old #241C1A must not be in tokens');
});

test('varoom-sidebar.css and varoom-sidebar.js use Lights Out black tokens', () => {
  const sidebarCss = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-sidebar.css'), 'utf8');
  assert.match(sidebarCss, /\[data-theme="dark"\]\s*\{\s*--white:\s*#000000;\s*--paper:\s*#000000;/, 'Sidebar dark mode must use #000000');
  assert.match(sidebarCss, /--muted:\s*#71767b;/, 'Sidebar dark muted text must be #71767b');

  const sidebarJs = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-sidebar.js'), 'utf8');
  assert.match(sidebarJs, /\[data-theme="dark"\]\{--nav-badge-bg:#2f3336;--nav-badge-color:#E7E9EA;\}/, 'Sidebar badge styles must use clean dark tokens');
});

test('_document.js and _app.js avoid FOUC with true black background', () => {
  const docJs = fs.readFileSync(path.join(clientRoot, 'pages', '_document.js'), 'utf8');
  assert.match(docJs, /html\[data-theme="dark"\]\{background:#000000;color-scheme:dark\}/, '_document.js anti-FOUC must use #000000');
  assert.match(docJs, /html\[data-theme="dark"\] body\{background:#000000\}/, '_document.js body anti-FOUC must use #000000');

  const appJs = fs.readFileSync(path.join(clientRoot, 'pages', '_app.js'), 'utf8');
  assert.match(appJs, /html\[data-theme="dark"\],\s*html\[data-theme="dark"\] body,\s*html\[data-theme="dark"\] #__next\s*\{\s*background:\s*#000000;/, '_app.js must use #000000 for dark canvas');
  assert.match(appJs, /--color-bg:\s*#000000;/, '_app.js design tokens must include dark #000000');
});

test('HostLayout and ClientLayout use X Lights Out tokens', () => {
  const hostLayout = fs.readFileSync(path.join(clientRoot, 'components', 'HostLayout.jsx'), 'utf8');
  assert.match(hostLayout, /--layout-bg:\s*#000000;/, 'HostLayout must use #000000');
  assert.match(hostLayout, /--layout-ink:\s*#FFFFFF;/, 'HostLayout text must be #FFFFFF');
  assert.match(hostLayout, /--layout-popover-bg:\s*#000000;/, 'HostLayout popovers must be #000000');

  const clientLayout = fs.readFileSync(path.join(clientRoot, 'components', 'ClientLayout.jsx'), 'utf8');
  assert.match(clientLayout, /--layout-bg:\s*#000000;/, 'ClientLayout must use #000000');
  assert.match(clientLayout, /--layout-ink:\s*#FFFFFF;/, 'ClientLayout text must be #FFFFFF');
  assert.match(clientLayout, /--layout-popover-bg:\s*#000000;/, 'ClientLayout popovers must be #000000');
});

test('admin.css and AnalyticsShell.module.css support dark mode with #000000 canvas', () => {
  const adminCss = fs.readFileSync(path.join(clientRoot, 'styles', 'admin.css'), 'utf8');
  assert.match(adminCss, /--admin-canvas:\s*#000000;/, 'admin.css canvas must be #000000');
  assert.match(adminCss, /--admin-surface:\s*#000000;/, 'admin.css surface must be #000000');
  assert.doesNotMatch(adminCss, /--admin-canvas:\s*#120F0F;/, 'Old #120F0F must be removed from admin.css');

  const shellCss = fs.readFileSync(path.join(clientRoot, 'legacy-pages', 'AnalyticsShell.module.css'), 'utf8');
  assert.match(shellCss, /var\(--color-bg,\s*#fff\)/, 'AnalyticsShell must use theme variable for background');
});

test('Legacy pages define consistent true black tokens', () => {
  const legacyDir = path.join(clientRoot, 'legacy-pages');
  const pagesToCheck = [
    'booking-approved.html',
    'booking.html',
    'bookings.html',
    'chats.html',
    'client-home.html',
    'host-home.html',
    'list.html',
    'map.html',
    'marketplace.html',
    'notifications.html',
    'payments.html',
    'pricing.html',
    'profile.html',
    'settings.html',
    'transactions.html'
  ];

  for (const pageName of pagesToCheck) {
    const filePath = path.join(legacyDir, pageName);
    assert.ok(fs.existsSync(filePath), `${pageName} must exist`);
    const content = fs.readFileSync(filePath, 'utf8');

    // Confirm that old warm browns are gone from dark token blocks
    assert.doesNotMatch(content, /--paper:\s*#15100F;/, `${pageName} must not contain old --paper: #15100F`);
    assert.doesNotMatch(content, /--white:\s*#241C1A;/, `${pageName} must not contain old --white: #241C1A`);
    assert.doesNotMatch(content, /--paper:\s*#120D0C;/, `${pageName} must not contain old --paper: #120D0C`);
  }
});

test('Light mode tokens remain intact and untouched', () => {
  const sidebarCss = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-sidebar.css'), 'utf8');
  assert.match(sidebarCss, /:root\s*\{[\s\S]*--white:\s*#FFFFFF;[\s\S]*--paper:\s*#F7F6F3;/, 'Light mode sidebar tokens must remain intact');

  const appJs = fs.readFileSync(path.join(clientRoot, 'pages', '_app.js'), 'utf8');
  assert.match(appJs, /:root\s*\{[\s\S]*--color-bg:\s*#f7f3ec;[\s\S]*--color-surface:\s*#fffdfb;/, 'Light mode design tokens in _app.js must remain intact');

  const clientHome = fs.readFileSync(path.join(clientRoot, 'legacy-pages', 'client-home.html'), 'utf8');
  assert.match(clientHome, /:root\{[\s\S]*--white:#FFFFFF;[\s\S]*--paper:#FFFFFF;/, 'Light mode client-home tokens must remain intact');
});

test('Landing page is exempted from global dark mode and CTA buttons have high contrast', () => {
  const docJs = fs.readFileSync(path.join(clientRoot, 'pages', '_document.js'), 'utf8');
  assert.match(docJs, /window\.location\.pathname === '\/'/, '_document.js must check for landing page to force light mode');

  const appJs = fs.readFileSync(path.join(clientRoot, 'pages', '_app.js'), 'utf8');
  assert.match(appJs, /var isLanding = window\.location\.pathname === '\/'/, '_app.js fontSizeScript must exempt landing page');
  assert.match(appJs, /html\[data-theme="dark"\] \.va-button-primary[\s\S]*color:\s*#0F1419 !important;/, 'Dark primary buttons must have dark text');
  assert.match(appJs, /\.landing-cta:not\(\.landing-cta-secondary\),[\s\S]*background:\s*#111111 !important;/, 'Landing CTA must preserve vintage #111111');

  const indexTsx = fs.readFileSync(path.join(clientRoot, 'pages', 'index.tsx'), 'utf8');
  assert.match(indexTsx, /document\.documentElement\.setAttribute\('data-theme',\s*'light'\)/, 'index.tsx must ensure light mode');
});

test('Hero headline, support text, and CTA are centered strictly on mobile while desktop remains left aligned', () => {
  const heroTsx = fs.readFileSync(path.join(clientRoot, 'components', 'landing', 'HeroSection.tsx'), 'utf8');
  assert.match(heroTsx, /hero-animated-content[\s\S]*items-start justify-end text-left max-\[639px\]:items-center max-\[639px\]:justify-center max-\[639px\]:text-center/, 'Hero container must center on mobile and align left on desktop');
  assert.match(heroTsx, /hero-headline[\s\S]*max-\[639px\]:text-center max-\[639px\]:mx-auto/, 'Headline must center on mobile');
  assert.match(heroTsx, /hero-subtitle[\s\S]*max-\[639px\]:text-center max-\[639px\]:mx-auto/, 'Subtitle must center on mobile');
  assert.match(heroTsx, /hero-cta[\s\S]*max-\[639px\]:justify-center/, 'CTA must center on mobile');

  const indexTsx = fs.readFileSync(path.join(clientRoot, 'pages', 'index.tsx'), 'utf8');
  assert.match(indexTsx, /@media \(max-width:\s*639px\)[\s\S]*\.hero-headline\s*\{\s*text-align:\s*center !important;/, 'index.tsx media query must center headline on mobile');
  assert.match(indexTsx, /@media \(max-width:\s*639px\)[\s\S]*\.hero-subtitle\s*\{\s*text-align:\s*center !important;/, 'index.tsx media query must center subtitle on mobile');
});
