const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..');

test('Navbar mobile menu is a full-screen dark panel above the hero, revealed from its button', () => {
  const content = fs.readFileSync(path.join(clientRoot, 'components', 'landing', 'Navbar.tsx'), 'utf8');

  // The header rises above the hero copy (z-30) while the menu is shown, so the fixed panel covers it.
  assert.match(content, /menuShown \? 'z-40' : 'z-20'/);
  // Same surface as the auth panel, never the old cream drop-down.
  assert.match(content, /fixed inset-0 z-50[^"]*bg-\[#1c1b1a\][^"]*text-\[#f5efe7\]/);
  assert.doesNotMatch(content, /bg-\[#faf6f0\]/);
  assert.match(content, /overflow-y-auto overscroll-contain/);
  // Opens from the menu button and folds back into it.
  assert.match(content, /setMenuOrigin\(originOf\(e\.currentTarget\)\)/);
  assert.match(content, /useTriggerReveal\(menuRef, mobileMenuOpen, menuOrigin\)/);
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

test('Navbar mobile navigation closes on auth actions', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // The landing page is one screen: no in-page section links.
  assert.doesNotMatch(content, /href="#/, 'Navbar must not link to in-page sections');

  // Verify Sign in action closes menu
  assert.match(
    content,
    /const handleSignInClick = useCallback\(\(e[^)]*\)\s*=>\s*\{[\s\S]*?closeMenu\(\);[\s\S]*?onOpenAuth\(e\.currentTarget\);/,
    'Sign-in clicks must trigger closeMenu() and call onOpenAuth()'
  );

  // Verify Get started action closes menu
  assert.match(
    content,
    /const handleGetStartedClick = useCallback\(\(e[^)]*\)\s*=>\s*\{[\s\S]*?closeMenu\(\);[\s\S]*?onOpenSignup\(e\.currentTarget\);/,
    'Get-started clicks must trigger closeMenu() and call onOpenSignup()'
  );
});

test('Desktop navigation links and actions remain intact and hidden on mobile', () => {
  const navbarPath = path.join(clientRoot, 'components', 'landing', 'Navbar.tsx');
  const content = fs.readFileSync(navbarPath, 'utf8');

  // No page links until the new sections exist; only the actions.
  assert.doesNotMatch(content, /<nav\b/, 'Navbar must not render page links yet');
  assert.match(
    content,
    /className="hero-header-actions hidden md:flex items-center gap-3 shrink-0"/,
    'Desktop action buttons must retain hidden md:flex styling'
  );
});
