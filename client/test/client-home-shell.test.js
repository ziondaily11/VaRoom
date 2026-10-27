const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'pages', 'client-home.tsx');
const legacyHomePath = path.join(root, 'legacy-pages', 'client-home.html');
const catchAllPath = path.join(root, 'pages', '[...slug].js');

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

test('Client Home redirects to onboarding only after an explicit successful profile result', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /if\(profile\.error\|\|!profile\.data\)/);
  assert.match(source, /profile\.data\.onboarding_completed!==true/);
  assert.match(source, /authEpoch/);
  assert.match(source, /setReady\(false\)/);
  assert.doesNotMatch(source, /if\(!p\.data\?\.onboarding_completed\)/);
});

test('Client Home uses the shared valid Supabase credentials and legacy R2 photo route', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /ImRlYXBoeW1pbWRheWdlYXZoeWVr/);
  assert.match(source, /\/api\/photos\//);
  assert.match(source, /photoPath\('listing-photos',p\)/);
  assert.match(source, /aspectRatio/);
  assert.match(source, /blur\(24px\) saturate\(1\.12\)/);
  assert.doesNotMatch(source, /ImRlYXBoeW1pbWRheWdlYXZoeWtz/);
});
