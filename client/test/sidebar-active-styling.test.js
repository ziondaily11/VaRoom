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

test('HostLayout and ClientLayout enforce non-red subtle grey active navigation states', () => {
  const hostLayout = fs.readFileSync(path.join(clientRoot, 'components', 'shell', 'shellStyles.ts'), 'utf8');
  const clientLayout = fs.readFileSync(path.join(clientRoot, 'components', 'shell', 'shellStyles.ts'), 'utf8');

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
  const pages = ['components/settings/settingsStyles.ts', 'components/profile/profileStyles.ts', 'components/marketplace/marketplaceStyles.ts', 'components/booking/bookingStyles.ts'];

  for (const page of pages) {
    const content = fs.readFileSync(path.join(clientRoot, page), 'utf8');
    assert.match(
      content,
      /--nav-active-bg:\s*rgba\(255,\s*255,\s*255,\s*0?\.14\);/,
      `${page} dark mode must define subtle dark-grey --nav-active-bg: rgba(255,255,255,.14)`
    );
  }
});

test('the legacy sidebar script and styles are retired (E2)', () => {
  for (const file of ['varoom-sidebar.js', 'varoom-sidebar.css']) assert.equal(fs.existsSync(path.join(clientRoot, 'public', 'js', file)), false, file);
});
