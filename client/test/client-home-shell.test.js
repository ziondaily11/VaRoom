const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'pages', 'client-home.tsx');
const legacyHomePath = path.join(root, 'legacy-pages', 'client-home.html');
const catchAllPath = path.join(root, 'pages', '[...slug].js');
const { resolveClientHomeProfile } = require('../lib/clientHomeAccount');
const { FALLBACK_ANON_KEY, getClientHomeSupabaseConfig } = require('../lib/clientHomeSupabase');

test('native Client Home shell uses the shared ClientLayout without rendering a duplicate sidebar', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /import ClientLayout from '\.\.\/components\/ClientLayout';/);
  assert.match(source, /ClientHome\.getLayout[\s\S]*?<ClientLayout activeNav="home">\{page\}<\/ClientLayout>/);
  assert.doesNotMatch(source, /SharedClientSidebar/);
  assert.doesNotMatch(source, /<aside[^>]+(?:id|className)=["'][^"']*sidebar/);
});

test('native Client Home shell preserves the legacy column and responsive breakpoints', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /grid-template-columns:minmax\(620px,1\.3fr\) 1px minmax\(380px,1fr\)/);
  assert.match(source, /@media\(max-width:1180px\)/);
  assert.match(source, /@media\(max-width:860px\)/);
  assert.match(source, /overflow-y:auto/);
});

test('legacy Client Home remains present as the rollback reference during shell migration', () => {
  assert.equal(fs.existsSync(legacyHomePath), true);
  const catchAll = fs.readFileSync(catchAllPath, 'utf8');
  assert.match(catchAll, /client-home\.html/);
  assert.match(catchAll, /'client-home\.html'\]\.includes\(file\)/);
});

test('native Client Home delegates feed storage and pagination to the established cache contract', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /loadListingFeedCache/);
  assert.match(source, /cache\.current\.snapshot/);
  assert.match(source, /cache\.current\.fetchPage/);
  assert.match(source, /cache\.current\.prefetchNext/);
  assert.match(source, /cache\.current\.revalidate/);
  assert.match(source, /\['client',user\.id,view,category/);
});

test('native Client Home preserves the legacy saved, likes, report, lazy media, carousel, and lightbox contracts', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /\.in\('id',Array\.from\(saved\)\)/);
  assert.match(source, /get_listing_like_summaries/);
  assert.match(source, /set_listing_like/);
  assert.match(source, /\/api\/listing-reports/);
  assert.match(source, /\/api\/discover\/video-media/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /document\.body\.style\.overflow='hidden'/);
});

test('native Client Home confines the ambient layer to a bounded, natural-ratio listing stage', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /function mediaFrame\(/);
  assert.match(source, /maxHeight=mobile\?Math\.min\(560,available\*1\.6\):460/);
  assert.match(source, /className="listing-media-stage"/);
  assert.match(source, /className="listing-media-ambient"/);
  assert.match(source, /isolation:'isolate'/);
  assert.match(source, /\.listing-media-stage\{display:flex;align-items:center;justify-content:center;max-width:100%;touch-action:pan-y\}/);
  assert.match(source, /\.listing-media-ambient\{position:absolute;inset:-28px;z-index:0/);
  assert.match(source, /\.listing-media-image\{position:relative;z-index:1;display:block;max-width:100%;max-height:100%/);
  assert.doesNotMatch(source, /<i aria-hidden style=\{ambient\}/);
});

test('Client Home redirects to onboarding only after an explicit successful profile result', () => {
  const session = { user: { id: 'client-1' } };
  const incomplete = resolveClientHomeProfile(session, {
    data: { role: 'client', onboarding_completed: false },
  });
  const failed = resolveClientHomeProfile(session, { data: null, error: { code: '401' } });

  assert.equal(incomplete.kind, 'onboarding');
  assert.equal(failed.kind, 'profile-error');
});

test('Client Home uses the shared valid Supabase credentials and legacy R2 photo route', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  const legacySource = fs.readFileSync(path.join(root, 'public', 'js', 'supabase-client.js'), 'utf8');

  assert.match(legacySource, new RegExp(FALLBACK_ANON_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(getClientHomeSupabaseConfig({}).anonKey, FALLBACK_ANON_KEY);
  assert.match(source, /\/api\/photos\//);
  assert.match(source, /photoPath\('listing-photos',p\)/);
  assert.match(source, /mediaFrame\(active\.width,active\.height/);
  assert.match(source, /blur\(24px\) saturate\(1\.12\)/);
  assert.doesNotMatch(FALLBACK_ANON_KEY, /2102096444/);
});

test('an authenticated session with a failed profile query stays signed in and can retry', () => {
  const session = { user: { id: 'client-1', email: 'client@example.com' } };
  const failed = resolveClientHomeProfile(session, { data: null, error: { code: '401', message: 'Unauthorized' } });
  const recovered = resolveClientHomeProfile(session, { data: { role: 'client', onboarding_completed: true } });
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.deepEqual(failed, { kind: 'profile-error', user: session.user });
  assert.equal(recovered.kind, 'ready');
  assert.match(source, /setAuthRetry\(x=>x\+1\)/);
  assert.match(source, /onClick=\{retryAccount\}/);
  assert.doesNotMatch(source, /account\.kind==='profile-error'\)\{router\.replace/);
});
