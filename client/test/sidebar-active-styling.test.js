const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.resolve(__dirname, '..');

test('varoom-dark-theme.css removes red completely from active navigation items', () => {
  const css = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-dark-theme.css'), 'utf8');

  // Verify red is completely eliminated from active navigation rules
  assert.doesNotMatch(
    css,
    /\.nav-item\.active\s*\{[^}]*rgba\(196,\s*30,\s*58/i,
    'varoom-dark-theme.css must not use red tint rgba(196,30,58) on active navigation items'
  );
  assert.doesNotMatch(
    css,
    /\.nav-item\.active\s*\{[^}]*(#c41e3a|#8f1229|#ff385c|var\(--red\))/i,
    'varoom-dark-theme.css must not use red backgrounds or borders on active navigation items'
  );

  // Verify subtle dark-grey styling is applied to active nav
  assert.match(
    css,
    /\[data-theme="dark"\]\s*\.nav-item\.active[\s\S]*?background:\s*var\(--nav-active-bg/i,
    'Active nav in dark mode must use the subtle grey variable'
  );

  // Verify text and icons remain visible
  assert.match(
    css,
    /\[data-theme="dark"\]\s*\.nav-item\.active[\s\S]*?color:\s*var\(--ink/i,
    'Active nav text must remain clearly visible with ink text color'
  );
  assert.match(
    css,
    /\[data-theme="dark"\]\s*\.nav-item\.active\s+svg/i,
    'Active nav icons must be styled for clear visibility'
  );

  // Verify brand elements like logo and tabs retain their branding
  assert.match(
    css,
    /\[data-theme="dark"\]\s*\.tab\.active[\s\S]*?var\(--red/i,
    'Tab active states retain intended styling without affecting navigation items'
  );
});

test('varoom-sidebar.css provides consistent subtle grey active-state styling for light and dark modes', () => {
  const css = fs.readFileSync(path.join(clientRoot, 'public', 'js', 'varoom-sidebar.css'), 'utf8');

  // Verify light mode active background is subtle light-grey #E9E7E2
  assert.match(css, /--nav-active-bg:\s*#E9E7E2;/, 'Light mode nav-active-bg must be subtle light-grey #E9E7E2');

  // Verify dark mode active background is subtle dark-grey (not faint .06)
  assert.match(css, /\[data-theme="dark"\]\s*\{[\s\S]*?--nav-active-bg:\s*rgba\(255,\s*255,\s*255,\s*0?\.14\);/, 'Dark mode nav-active-bg must be subtle dark-grey');

  // Verify active nav items have no red background or border
  assert.doesNotMatch(
    css,
    /\.sidebar\s+\.nav-item\.active\s*\{[^}]*(#c41e3a|#8f1229|rgba\(196|var\(--red\))/i,
    '.sidebar .nav-item.active must not contain red'
  );

  // Verify beta-pill in sidebar does not use red-tinted active pill
  assert.doesNotMatch(
    css,
    /\.sidebar\s+\.beta-pill\s*\{[^}]*#FBE4E7/i,
    '.sidebar .beta-pill must not use red background #FBE4E7'
  );
  assert.doesNotMatch(
    css,
    /\[data-theme="dark"\]\s+\.sidebar\s+\.beta-pill\s*\{[^}]*rgba\(196/i,
    '.sidebar .beta-pill in dark mode must not use red tint rgba(196,...)'
  );

  // Verify VaRoom red branding is preserved for logo and list-space CTA button
  assert.match(css, /\.sidebar\s+\.logo\s+\.va\s*\{\s*color:\s*var\(--red\);/, 'Logo va must preserve red branding');
  assert.match(css, /\.list-space-btn[\s\S]*?var\(--red/i, 'List a space CTA must preserve red branding');
});

test('HostLayout and ClientLayout enforce non-red subtle grey active navigation states', () => {
  const hostLayout = fs.readFileSync(path.join(clientRoot, 'components', 'HostLayout.jsx'), 'utf8');
  const clientLayout = fs.readFileSync(path.join(clientRoot, 'components', 'ClientLayout.jsx'), 'utf8');

  for (const [name, code] of [['HostLayout', hostLayout], ['ClientLayout', clientLayout]]) {
    // Light mode subtle grey token
    assert.match(code, /--layout-control-active:\s*#E1E8ED;/, `${name} must define light mode subtle grey token`);

    // Dark mode subtle grey token
    assert.match(code, /--layout-control-active:\s*rgba\(239,\s*243,\s*244,\s*0\.15\);/, `${name} must define dark mode subtle grey token`);

    // Active nav item styling
    assert.match(code, /\.nav-item\.active\s*\{[\s\S]*?var\(--control-active,\s*var\(--layout-control-active\)\)/, `${name} active nav must use control-active / layout-control-active`);

    // No red on active nav item
    assert.doesNotMatch(code, /\.nav-item\.active\s*\{[^}]*(#c41e3a|rgba\(196|var\(--red\))/i, `${name} active nav must not have red`);

    // Active notif badge is non-red when active
    assert.match(code, /\.nav-item\.active\s+\.notif-nav-badge/, `${name} must override notif badge when parent is active`);

    // Logo retains red branding
    assert.match(code, /\.logo\s+\.va\s*\{\s*color:\s*var\(--red/i, `${name} logo must preserve red branding`);
  }
});

test('Legacy pages define consistent non-red active navigation background tokens', () => {
  const pages = ['bookings.html', 'settings.html', 'profile.html', 'marketplace.html', 'booking.html'];
  const legacyDir = path.join(clientRoot, 'legacy-pages');

  for (const page of pages) {
    const content = fs.readFileSync(path.join(legacyDir, page), 'utf8');
    assert.match(
      content,
      /--nav-active-bg:\s*rgba\(255,\s*255,\s*255,\s*0?\.14\);/,
      `${page} dark mode must define subtle dark-grey --nav-active-bg: rgba(255,255,255,.14)`
    );
  }
});
