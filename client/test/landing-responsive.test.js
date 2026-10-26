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

test('AuthPanel has comfortable padding on large screens (lg:py-16)', () => {
  const src = read('components/landing/AuthPanel.tsx');
  assert.match(
    src,
    /lg:py-16\b/,
    'AuthPanel must preserve lg:py-16 for comfortable spacing on large screens',
  );
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
