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

test('landing page 3 fits one screen on laptops and desktops', () => {
  const css = read('components/landing/HostFeaturesSection.module.css');
  const section = read('components/landing/HostFeaturesSection.tsx');
  const block = (query) => css.slice(css.indexOf(query));
  // Every laptop and desktop: exactly one screen.
  assert.match(block('@media (min-width: 1001px) and (min-height: 600px) {'), /\.section \{\s*height: 100vh;\s*height: 100dvh;/);
  // Tall screens: two rows share the space.
  const tall = block('@media (min-width: 1001px) and (min-height: 1040px) {');
  assert.match(tall, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(tall, /\.visual \{\s*flex: 1 1 0;\s*height: auto;\s*min-height: 0;/);
  // Shorter screens: one row of three full-size cards, arrows and dots for the rest.
  const row = block('@media (min-width: 1001px) and (min-height: 600px) and (max-height: 1039.98px) {');
  assert.match(row, /transform: translateX\(calc\(var\(--page, 0\) \* \(-100% - var\(--gap\)\)\)\);/);
  assert.match(row, /\.card \{ flex: 0 0 calc\(\(100% - 2 \* var\(--gap\)\) \/ 3\); \}/);
  assert.match(row, /\.visual \{ height: clamp\(170px, calc\(100dvh - 405px\), 250px\); \}/);
  assert.match(row, /\.pager \{\s*display: flex;/);
  assert.match(section, /aria-label="Previous host features"/);
  assert.match(section, /aria-label="Next host features"/);
  assert.match(section, /style=\{\{ '--page': page \} as React\.CSSProperties\}/);
  // Pictures are size containers and drop detail as they get short; the photo tiles always stay.
  assert.match(css, /container-type: size;/);
  for (const h of [200, 170, 140, 110]) assert.match(css, new RegExp(`@container \\(max-height: ${h}px\\)`));
  assert.doesNotMatch(css, /\.tiles \{ display: none; \}/);
});

test('landing page 3 motion: plays once, never replays on return, honours reduced motion', () => {
  const css = read('components/landing/HostFeaturesSection.module.css');
  const section = read('components/landing/HostFeaturesSection.tsx');
  // Rendered visible; only what is still off screen waits, measured after the scroll is restored.
  assert.match(section, /requestAnimationFrame\(\(\) => \{ frame = requestAnimationFrame\(begin\); \}\)/);
  assert.match(section, /prefersReducedMotion\(\) \|\| playedThisTab\(PLAYED_KEY\)\) return undefined;/);
  assert.match(section, /const PLAYED_KEY = 'varoom_landing_hosts_played';/);
  assert.match(section, /rememberPlayed\(PLAYED_KEY\)/);
  assert.match(read('lib/landing/entrance.ts'), /window\.sessionStorage\.setItem\(key, '1'\)/);
  // Cards beside the others in the one-row layout settle their details but do not rise.
  assert.match(section, /setRises\(rects\.map\(\(rect, i\) => waits\[i\] && !beside\(rect\)\)\);/);
  // Tokens: entrances ease out; the carousel move eases in and out in 300 ms; press .97.
  assert.match(css, /transition: transform 300ms var\(--ease-in-out\);/);
  assert.doesNotMatch(css, /cubic-bezier/, 'motion tokens from styles/motion.css');
  assert.match(css, /\.arrow:active:not\(:disabled\) \{ scale: 0\.97; \}/);
  assert.doesNotMatch(css, /transition:\s*all\b/);
  // Keyframes move only opacity and the translate/scale properties.
  for (const [, body] of css.matchAll(/@keyframes host\w+ \{([\s\S]*?)\n\}/g)) {
    assert.doesNotMatch(body.replace(/\b(opacity|translate|scale)\s*:/g, ''), /[a-z-]+\s*:/, 'only opacity, translate and scale animate');
  }
  // Reduced motion: final state at once.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.section \.head,\s*\.section \.pager,\s*\.section \.cta,\s*\.section \.card,\s*\.section \.settle \{\s*animation: none !important;\s*opacity: 1 !important;/);
});

test('landing page 4: review, trust points, last call and footer, after the host section', () => {
  const page = read('pages/index.tsx');
  const section = read('components/landing/TrustSection.tsx');
  const css = read('components/landing/TrustSection.module.css');
  assert.ok(page.indexOf('<HostFeaturesSection') < page.indexOf('<TrustSection'), 'hosts first, then the last page');
  assert.match(page, /<TrustSection review=\{review\} onListSpace=\{openHostSignup\} \/>/);
  // The real featured review with picture and handle; a heading when there is none.
  assert.match(section, /<ReviewAvatar review=\{review\} \/>/);
  assert.match(section, /\{reviewAuthorHandle\(review\)\}/);
  assert.match(section, /Book with <em>confidence\.<\/em>/);
  // Last call and footer links.
  assert.match(section, /<Link href="\/marketplace"/);
  for (const href of ['/property-news', '/support', '/terms', '/privacy']) assert.match(section, new RegExp(`<Link href="${href}">`));
  assert.match(section, /href=\{SOCIAL_LINKS\.instagram\} target="_blank" rel="noopener noreferrer"/);
  // One source for the social links.
  for (const file of ['pages/client-home.tsx', 'components/hostHome/HostRail.tsx', 'components/landing/TrustSection.tsx']) {
    assert.doesNotMatch(read(file), /https:\/\/www\.(instagram|tiktok)\.com/, `${file} uses SOCIAL_LINKS`);
  }
  // One screen tall; long reviews are shown in full on phones.
  assert.match(css, /\.section \{[^}]*min-height: 100dvh;/);
  assert.match(css, /@media \(min-width: 641px\) \{\s*\.quoteLong \{[^}]*-webkit-line-clamp: 9;/);
  // Motion: played once with the shared helper, tokens, reduced motion.
  assert.match(section, /useSectionEntrance\(sectionRef, 'varoom_landing_trust_played'\)/);
  assert.match(css, /animation: trustRise 700ms var\(--ease-out\) backwards;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.section \.enter \{ animation: none !important; opacity: 1 !important; \}/);
});

test('landing page 3: the listing card shows three real photos, as small copies', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const section = read('components/landing/HostFeaturesSection.tsx');
  const photos = [...section.matchAll(/'(\/assets\/landing\/host-tile-[a-z]+\.webp)'/g)].map((m) => m[1]);
  assert.equal(photos.length, 3);
  for (const photo of photos) {
    const file = path.join(__dirname, '..', 'public', photo);
    assert.ok(fs.existsSync(file), `${photo} exists`);
    assert.ok(fs.statSync(file).size < 25 * 1024, `${photo} stays small`);
  }
  assert.match(section, /<img src=\{src\} alt="" width=\{280\} height=\{340\} loading="lazy" decoding="async"/);
  assert.match(section, /\{i === 0 && <span className=\{styles\.play\}>▶<\/span>\}/);
  assert.match(section, /<span className=\{styles\.addMore\}>\+<\/span>/);
});

test('landing page 3: the contact card shows the booking page contact buttons, scattered', () => {
  const section = read('components/landing/HostFeaturesSection.tsx');
  const css = read('components/landing/HostFeaturesSection.module.css');
  const booking = read('components/booking/ListingDetails.tsx');
  assert.match(section, /title: 'Be reached your way',/);
  assert.match(section, /text: 'Choose how guests contact you: WhatsApp, email, a call or VaRoom chat\.',/);
  // The same logos and icons as the booking page's contact buttons.
  for (const logo of ['/assets/whatsapp.svg', '/assets/gmail.svg']) {
    assert.ok(booking.includes(`src="${logo}"`) && section.includes(`src="${logo}"`), logo);
  }
  assert.match(section, /import \{ ICON_MESSAGE, ICON_PHONE \} from '\.\.\/\.\.\/lib\/booking\/bookingIcons';/);
  assert.match(section, /import Svg from '\.\.\/booking\/Svg';/);
  // Round, bordered, and placed loosely with a tilt.
  assert.match(css, /\.contact \{[^}]*border-radius: 50%;[^}]*rotate: var\(--tilt\);/);
  assert.equal((css.match(/^\.contact(Whatsapp|Email|Phone|Chat) \{ --x: \d+%; --y: \d+%; --size: clamp\([^)]*\); --tilt: -?\d+deg; \}$/gm) || []).length, 4);
  // The booking-request picture is gone, with its styles.
  assert.doesNotMatch(section + css, /bookingStack|dayEdge|Booking request/);
});

test('landing page 3: niche chips stay on one row; the brand logo images are never drawn turned', () => {
  const css = read('components/landing/HostFeaturesSection.module.css');
  // One row; on a narrow picture the last chip fades at the edge instead of wrapping alone.
  assert.match(css, /\.niches \{\s*display: flex;\s*flex-wrap: nowrap;\s*gap: 6px;\s*overflow: hidden;\s*\}/);
  assert.match(css, /@container \(max-width: 440px\) \{\s*\.niches \{[^}]*mask-image: linear-gradient\(to right, #000 calc\(100% - 32px\), transparent\);/);
  assert.doesNotMatch(css, /\.niches span:nth-child\(n \+ 4\) \{ display: none; \}/);
  // A turned image can show a dark edge line on Windows: the logo cancels its circle's tilt.
  assert.match(css, /\.contact img \{ rotate: calc\(var\(--tilt\) \* -1\); \}/);
});

test('landing page 3: the share card shows the profile share panel and the profile address', () => {
  const section = read('components/landing/HostFeaturesSection.tsx');
  const css = read('components/landing/HostFeaturesSection.module.css');
  const share = read('lib/profile/profilePage.ts');
  assert.match(section, /title: 'Your profile is your website',/);
  assert.match(section, /text: 'Copy your link, share it anywhere, or use it as your website\.',/);
  // The same places the profile's share panel offers.
  for (const target of ['x', 'whatsapp', 'email']) assert.match(share, new RegExp(`\\b${target}: `));
  assert.match(section, /\{ label: 'X', icon: <Svg markup=\{SOCIAL_ICONS\.x\} \/> \}/);
  assert.match(section, /\{ label: 'WhatsApp', icon: <img src="\/assets\/whatsapp\.svg"/);
  assert.match(section, /\{ label: 'Email', icon: <img src="\/assets\/gmail\.svg"/);
  // The profile address format (lib/profile/usernames.ts), with a placeholder name.
  assert.match(read('lib/profile/usernames.ts'), /export const profileAddress = \(username: string\) => `\/\$\{encodeURIComponent/);
  assert.match(section, /varoom\.co\.ke\/\[username\]/);
  // The chat card is gone, with its styles.
  assert.doesNotMatch(section + css, /bubbleOut|quickReplies|Reply, even when/);
});
