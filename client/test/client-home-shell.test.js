const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'pages', 'client-home.tsx');
const stylesPath = path.join(root, 'pages', 'ClientHome.module.css');
const legacyHomePath = path.join(root, 'legacy-pages', 'client-home.html');
const catchAllPath = path.join(root, 'pages', '[...slug].js');
const nextConfigPath = path.join(root, 'next.config.js');
const vercelConfigPath = path.join(root, 'vercel.json');
const { resolveClientHomeProfile } = require('../lib/clientHomeAccount');
const { loadTs } = require('./helpers/loadTs');
const { FALLBACK_SUPABASE_ANON_KEY: FALLBACK_ANON_KEY, SUPABASE_ANON_KEY } = loadTs(path.join(root, 'lib', 'supabase', 'config.ts'), {
  globals: { process: { env: {} } },
});

test('native Client Home shell uses the shared ClientLayout without rendering a duplicate sidebar', () => {
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.match(source, /import ClientLayout from '\.\.\/components\/ClientLayout';/);
  assert.match(source, /ClientHome\.getLayout[\s\S]*?<ClientLayout className="client-home-layout">\{page\}<\/ClientLayout>/);
  assert.doesNotMatch(source, /SharedClientSidebar/);
  assert.match(source, /<aside className=\{styles\.rightRail\}>/);
  assert.doesNotMatch(source, /className=\{styles\.sidebar\}/);
  assert.doesNotMatch(source, /<nav[^>]*>[\s\S]*?Discover[\s\S]*?Marketplace[\s\S]*?Saved/);
});

test('native Client Home shell preserves the legacy column and responsive breakpoints', () => {
  const source = fs.readFileSync(stylesPath, 'utf8');

  assert.match(source, /grid-template-columns:\s*minmax\(620px,\s*1\.3fr\)\s+1px\s+minmax\(380px,\s*1fr\)/);
  assert.match(source, /@media \(max-width: 1180px\)/);
  assert.match(source, /@media \(max-width: 860px\)/);
  assert.match(source, /\.feedArea \{[\s\S]*?overflow-y: auto/);
});

test('native page compatibility redirects remain configured after legacy templates retire', () => {
  assert.equal(fs.existsSync(legacyHomePath), false);
  const catchAll = fs.readFileSync(catchAllPath, 'utf8');
  const vercelConfig = fs.readFileSync(vercelConfigPath, 'utf8');
  const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
  assert.match(catchAll, /client-home\.html/);
  assert.match(catchAll, /'client-home\.html'\]\.includes\(file\)/);
  assert.match(vercelConfig, /"source": "\/:page\.html", "destination": "\/:page", "permanent": true/);
  assert.match(nextConfig, /source:\s*'\/property-news\.html',\s*destination:\s*'\/property-news'/);
  assert.match(nextConfig, /source:\s*'\/legacy-pages\/property-news\.html',\s*destination:\s*'\/property-news'/);
});

test('Client Home opens the native AuthPanel and never routes through retired login HTML', () => {
  const page = fs.readFileSync(pagePath, 'utf8');
  const catchAll = fs.readFileSync(catchAllPath, 'utf8');
  const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');

  assert.match(page, /pathname:\s*'\/',\s*query:\s*\{\s*auth:\s*'login',\s*redirect:\s*'\/client-home'/);
  assert.doesNotMatch(catchAll, /login\.html'\s*:\s*'login\.html'/);
  assert.doesNotMatch(catchAll, /slug:\s*\['login\.html'\]/);
  assert.match(nextConfig, /source:\s*'\/login\.html',\s*destination:\s*'\/\?auth=login'/);
  assert.match(nextConfig, /source:\s*'\/legacy-pages\/login\.html',\s*destination:\s*'\/\?auth=login'/);
});

test('native Client Home delegates feed storage and pagination to the established cache contract', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /loadListingFeedCache/);
  assert.match(source, /cache\.current\.snapshot/);
  assert.match(source, /cache\.current\.fetchPage/);
  assert.match(source, /cache\.current\.prefetchNext/);
  assert.match(source, /cache\.current\.revalidate/);
  assert.match(source, /\['client', user\.id, view, category/);
});

test('native Client Home preserves the legacy saved, likes, report, lazy media, carousel, and lightbox contracts', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /\.in\('id', Array\.from\(saved\)\)/);
  assert.match(source, /get_listing_like_summaries/);
  assert.match(source, /set_listing_like/);
  assert.match(source, /\/api\/listing-reports/);
  assert.match(source, /\/api\/discover\/video-media/);
  assert.match(source, /IntersectionObserver/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
});

test('native Client Home sizes media from all source proportions and retains ambient, skeleton, and failure states', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(source, /function calculateMediaFrames\(/);
  assert.match(source, /Math\.min\(560, available \* 1\.6\) : 460/);
  assert.match(source, /Math\.max\(\.\.\.frames\.map/);
  assert.match(source, /className=\{styles\.mediaAmbient\}/);
  assert.match(source, /className=\{styles\.imageSkeleton\}/);
  assert.match(source, /className=\{styles\.photoUnavailable\}/);
  assert.match(styles, /\.mediaAmbient \{[\s\S]*?filter: blur\(24px\) saturate\(1\.12\)/);
  assert.match(styles, /\.listingImage \{[\s\S]*?object-fit: initial/);
  assert.match(styles, /\.mediaLoading,[\s\S]*?aspect-ratio: 4 \/ 3/);
  assert.doesNotMatch(source, /document\.head\.appendChild/);
});

test('native Client Home cards retain the approved middle-feed composition', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  const styles = fs.readFileSync(stylesPath, 'utf8');

  assert.match(source, /function ListingCard\(/);
  assert.match(source, /className=\{styles\.cardBody\}/);
  assert.match(source, /className=\{styles\.caption\}/);
  assert.match(source, /className=\{styles\.actions\}/);
  assert.match(styles, /\.card \{[\s\S]*?gap: 0\.65rem;[\s\S]*?padding: 0\.7rem 0/);
  assert.match(styles, /\.avatar \{[\s\S]*?width: 34px;[\s\S]*?height: 34px/);
  assert.match(styles, /\.caption \{[\s\S]*?font-size: 0\.87rem;[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(styles, /\.actions \{[\s\S]*?gap: 0\.4rem;[\s\S]*?padding-top: 0\.4rem/);
  assert.match(source, /CalendarIcon/);
  assert.match(source, /ChatIcon/);
  assert.match(source, /BookmarkIcon/);
  assert.match(source, /View on Map/);
  assert.match(source, /This is your listing/);
  assert.doesNotMatch(styles, /padding:\s*2\.15rem/);
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
  const styles = fs.readFileSync(stylesPath, 'utf8');
  const legacySource = fs.readFileSync(path.join(root, 'public', 'js', 'supabase-client.js'), 'utf8');

  assert.match(legacySource, new RegExp(FALLBACK_ANON_KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(SUPABASE_ANON_KEY, FALLBACK_ANON_KEY);
  assert.match(source, /import \{ getSupabaseClient \} from '\.\.\/lib\/supabase\/client';/);
  assert.match(source, /\/api\/photos\//);
  assert.match(source, /photoUrl\('listing-photos', path\)/);
  assert.match(source, /calculateMediaFrames\(/);
  assert.match(styles, /blur\(24px\) saturate\(1\.12\)/);
  assert.doesNotMatch(FALLBACK_ANON_KEY, /2102096444/);
});

test('an authenticated session with a failed profile query stays signed in and can retry', () => {
  const session = { user: { id: 'client-1', email: 'client@example.com' } };
  const failed = resolveClientHomeProfile(session, { data: null, error: { code: '401', message: 'Unauthorized' } });
  const recovered = resolveClientHomeProfile(session, { data: { role: 'client', onboarding_completed: true } });
  const source = fs.readFileSync(pagePath, 'utf8');

  assert.deepEqual(failed, { kind: 'profile-error', user: session.user });
  assert.equal(recovered.kind, 'ready');
  assert.match(source, /setAuthRetry\(\(current\) => current \+ 1\)/);
  assert.match(source, /onClick=\{retryAccount\}/);
  assert.match(source, /account\.kind === 'profile-error'/);
});
