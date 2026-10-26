const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..');

test('Navbar mobile navigation stacking context fix elevates header to z-40', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verify that when mobileMenuOpen is true, the header receives z-40 to escape and exceed .hero-animated-content (z-30)
  assert.match(
    content,
    /mobileMenuOpen\s*\?\s*['"]z-40\s+bg-\[#faf6f0\]\s+md:bg-transparent['"]\s*:\s*['"]z-20['"]/,
    'Header must elevate to z-40 and apply opaque background when mobileMenuOpen is true, reverting to z-20 when closed'
  );
});

test('Navbar mobile drawer uses opaque background, independent scroll, and viewport boundary', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verify opaque background #faf6f0 (no /95 opacity)
  assert.match(
    content,
    /bg-\[#faf6f0\]/,
    'Mobile drawer must use opaque #faf6f0 background to completely obscure underlying hero content'
  );

  // Verify independent vertical scrolling and overscroll containment
  assert.match(
    content,
    /overflow-y-auto\s+overscroll-contain/,
    'Mobile drawer must specify overflow-y-auto and overscroll-contain for independent vertical scrolling'
  );

  // Verify viewport-relative height bounds calculated below header
  assert.match(
    content,
    /height:\s*`calc\(100dvh - \$\{headerHeight\}px\)`,/,
    'Mobile drawer must bind height to calc(100dvh - headerHeight)'
  );
});

test('Navbar locks body scroll and supports Escape-key dismissal while open', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verify body and html scroll locking
  assert.match(
    content,
    /document\.body\.style\.overflow\s*=\s*['"]hidden['"]/,
    'Body overflow must be set to hidden when mobile menu opens'
  );
  assert.match(
    content,
    /document\.body\.style\.overflow\s*=\s*previousBodyOverflow/,
    'Body overflow must be restored to its previous value when mobile menu closes'
  );

  // Verify Escape key event listener
  assert.match(
    content,
    /event\.key\s*===\s*['"]Escape['"]/,
    'Escape key listener must be registered to close the mobile menu'
  );
});

test('Navbar mobile navigation closes on anchor navigation and auth actions', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verify anchor navigation handler closes menu
  assert.match(
    content,
    /const handleNavAnchor = useCallback\(\(e: React\.MouseEvent<HTMLAnchorElement>,\s*hash: string\)\s*=>\s*\{[\s\S]*?closeMenu\(\);/,
    'Anchor clicks must trigger closeMenu()'
  );

  // Verify Elie navigation handler closes menu
  assert.match(
    content,
    /const handleElieClick = useCallback\(\(e: React\.MouseEvent<HTMLAnchorElement>\)\s*=>\s*\{[\s\S]*?closeMenu\(\);[\s\S]*?onTryElie\(e\);/,
    'Elie clicks must trigger closeMenu() and call onTryElie()'
  );

  // Verify Sign in action closes menu
  assert.match(
    content,
    /const handleSignInClick = useCallback\(\(\)\s*=>\s*\{[\s\S]*?closeMenu\(\);[\s\S]*?onOpenAuth\(\);/,
    'Sign-in clicks must trigger closeMenu() and call onOpenAuth()'
  );

  // Verify Get started action closes menu
  assert.match(
    content,
    /const handleGetStartedClick = useCallback\(\(\)\s*=>\s*\{[\s\S]*?closeMenu\(\);[\s\S]*?onOpenSignup\(\);/,
    'Get-started clicks must trigger closeMenu() and call onOpenSignup()'
  );
});

test('Desktop navigation links and actions remain intact and hidden on mobile', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // Verify desktop navigation remains hidden on mobile and flex on md
  assert.match(
    content,
    /className="hero-header-nav hidden md:flex items-center gap-5 lg:gap-8 shrink"/,
    'Desktop nav links must retain hidden md:flex styling'
  );
  assert.match(
    content,
    /className="hero-header-actions hidden md:flex items-center gap-3 shrink-0"/,
    'Desktop action buttons must retain hidden md:flex styling'
  );
});
