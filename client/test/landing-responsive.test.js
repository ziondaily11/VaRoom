/**
 * Stage 2 — Landing & Auth Responsive Fixes
 * Static-analysis tests that verify the four CSS/layout fixes are present
 * in the affected source files. These tests do not start a browser.
 */

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ---------------------------------------------------------------------------
// Fix 1 & 2 — AuthPanel.tsx: scroll trap + responsive padding
// ---------------------------------------------------------------------------

test('AuthPanel scroll container no longer uses justify-center', () => {
  const src = read('components/landing/AuthPanel.tsx');
  // The outer flex wrapper must NOT have justify-center (that caused the negative-scroll trap)
  assert.doesNotMatch(
    src,
    /flex-col\s+justify-center\s+px-6/,
    'justify-center must be removed from the flex wrapper that wraps auth-content divs',
  );
});

test('AuthPanel has responsive vertical padding (py-8 on mobile)', () => {
  const src = read('components/landing/AuthPanel.tsx');
  assert.match(
    src,
    /py-8\b/,
    'AuthPanel must have py-8 for compact mobile padding',
  );
});

test('AuthPanel fits laptop screens without a visible scrollbar', () => {
  const src = read('components/landing/AuthPanel.tsx');
  // The content is centred (my-auto), so tall screens keep their space; the
  // smaller padding lets the login view fit 1280x720 and 1366x768 laptops.
  assert.match(src, /lg:px-10 lg:py-8\b/);
  assert.doesNotMatch(src, /lg:py-16\b/);
  // Very short screens can still scroll, but no scrollbar is drawn.
  assert.match(src, /className="auth-scroll h-full w-full overflow-y-auto overscroll-contain"/);
  assert.match(src, /\.auth-scroll \{\s*scrollbar-width: none;/);
  assert.match(src, /\.auth-scroll::-webkit-scrollbar \{\s*display: none;/);
});

test('auth-content divs use my-auto to center when space allows and top-align when overflowing', () => {
  const src = read('components/landing/AuthPanel.tsx');
  // All three auth-content divs (login, signup, recovery) must have my-auto on the same className line
  // Pattern: className starts with `auth-content my-auto`
  const matches = [...src.matchAll(/`auth-content my-auto/g)];
  assert.ok(
    matches.length >= 3,
    `Expected at least 3 auth-content divs with my-auto, found ${matches.length}`,
  );
});

// ---------------------------------------------------------------------------
// Fix 3 — index.tsx: hero overflow on short screens
// ---------------------------------------------------------------------------

test('index.tsx has max-height media query to unclip hero on landscape mobile', () => {
  const src = read('pages/index.tsx');
  assert.match(
    src,
    /@media\s*\(max-height:\s*600px\)/,
    'index.tsx must include @media (max-height: 600px) for landscape mobile fix',
  );
});

test('index.tsx max-height media query sets hero-section overflow to visible', () => {
  const src = read('pages/index.tsx');
  // The block should set overflow: visible inside the max-height query
  assert.match(
    src,
    /@media\s*\(max-height:\s*600px\)[^}]*\{[^}]*\.hero-section[^}]*overflow:\s*visible/s,
    'The max-height media query must set .hero-section { overflow: visible }',
  );
});

// ---------------------------------------------------------------------------
// Fix 4 — SignupForm.tsx: account-type description no longer clipped
// ---------------------------------------------------------------------------

test('SignupForm account-type description no longer uses max-h-5 overflow-hidden', () => {
  const src = read('components/landing/SignupForm.tsx');
  assert.doesNotMatch(
    src,
    /account-type-description[^"]*max-h-5[^"]*overflow-hidden/,
    'max-h-5 overflow-hidden must be removed from the account-type description span',
  );
});

test('SignupForm account-type description uses min-h to allow text wrapping', () => {
  const src = read('components/landing/SignupForm.tsx');
  assert.match(
    src,
    /account-type-description[^"]*min-h-\[1\.25rem\]/,
    'account-type description span must have min-h-[1.25rem] to allow text wrapping',
  );
});

test('SignupForm role button min-h increased to accommodate wrapped description text', () => {
  const src = read('components/landing/SignupForm.tsx');
  assert.match(
    src,
    /min-h-\[68px\]/,
    'role button min-h must be at least 68px to accommodate wrapped description lines',
  );
});

test('forgot-password and code panels keep only the words they need', () => {
  const recovery = read('components/landing/PasswordRecovery.tsx');
  const signup = read('components/landing/SignupForm.tsx');
  // No badges, security notes or hints that repeat the heading.
  for (const extra of ['PASSWORD RECOVERY', 'Step 2 of 3', 'Step 3 of 3', 'Authenticated', 'We protect your security', 'Check spam', 'Send OTP', 'Email verified.', 'Cancel and return to Log in']) {
    assert.doesNotMatch(recovery, new RegExp(extra), `recovery still says "${extra}"`);
  }
  assert.match(recovery, /'Forgot your password\?' : step === 'otp' \? 'Check your email\.' : 'New password\.'/);
  assert.match(recovery, /'We’ll email you a code\.'/);
  // The email is named once, in the subtitle.
  assert.doesNotMatch(signup, /We sent a verification code to/);
  assert.match(signup, /Enter the code sent to <strong[^>]*>\{verificationEmail\}<\/strong>\./);
  assert.match(signup, /`Resend code in \$\{resendSeconds\}s`/);
});

test('a code can be resent only when the server allows it, starting with the first sign-up code', () => {
  const flow = read('lib/auth/authFlow.ts');
  const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'server.js'), 'utf8');
  const seconds = Number(flow.match(/export const CODE_RESEND_SECONDS = (\d+);/)[1]);
  const cooldownMs = Number(server.match(/const AUTH_EMAIL_COOLDOWN_MS = (\d+);/)[1]);
  assert.equal(seconds * 1000, cooldownMs, 'the button waits exactly as long as the server');

  const signup = read('components/landing/SignupForm.tsx');
  const recovery = read('components/landing/PasswordRecovery.tsx');
  assert.doesNotMatch(signup + recovery, /setResendSeconds\([1-9]\d*\)/, "no hard-coded wait");
  // Sign-up starts the wait when the first code is sent, before the code step shows.
  assert.match(signup, /setResendSeconds\(CODE_RESEND_SECONDS\);\s*setIsVerifying\(true\);/);
});

test('landing page 3: the host section, after Spaces, opens sign-up as a host', () => {
  const page = read('pages/index.tsx');
  const section = read('components/landing/HostFeaturesSection.tsx');
  assert.ok(page.indexOf('<SpacesSection') < page.indexOf('<HostFeaturesSection'), 'Spaces first, then hosts');
  assert.match(page, /<HostFeaturesSection onListSpace=\{openHostSignup\} \/>/);
  assert.match(page, /openSignup\(trigger, 'host'\)/);
  assert.match(page, /const openSignup = useCallback\(\(trigger\?: HTMLElement, role: 'host' \| 'client' = 'client'\)/);
  // Six cards; their product pictures are hidden from screen readers, the titles carry the meaning.
  assert.equal((section.match(/^\s{4}title: '/gm) || []).length, 6);
  assert.match(section, /aria-hidden="true"/);
  assert.match(section, /<Link href="\/pricing"/);
  // The interface font is loaded with the serif, in one request.
  assert.match(page, /family=Source\+Serif\+4[^"]*&family=Plus\+Jakarta\+Sans:wght@500;600;700&display=swap/);
});

test('the sign-in panel backdrop draws no border over the page', () => {
  // Tailwind preflight is off, so a button keeps the browser's border unless it is reset.
  assert.match(read('components/landing/AuthPanel.tsx'), /aria-label="Close sign-in panel"\s+className="absolute inset-0 m-0 border-0 bg-transparent p-0"/);
});
