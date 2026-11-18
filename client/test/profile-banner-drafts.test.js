const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

// The two profile pages (/profile and /<username>) share one banner fade and
// put the host's bio in the same place; drafts on /profile can be discarded.

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n');

test('one banner fade on both pages, ending exactly on each page\'s own background (light and dark)', () => {
  const fade = loadTs(path.join(root, 'components', 'profile', 'BannerFade.tsx'), { mocks: { react: { createElement: () => null } } });
  const stops = fade.BANNER_FADE_STOPS;
  assert.deepEqual(stops[0], [0, 0], 'transparent at the top');
  assert.deepEqual(stops[stops.length - 1], [100, 100], 'the page colour itself at the bottom: no edge');
  for (let i = 1; i < stops.length; i += 1) {
    assert.ok(stops[i][0] > stops[i - 1][0] && stops[i][1] >= stops[i - 1][1], 'smooth: positions and amounts only grow');
    assert.ok(stops[i][1] - stops[i - 1][1] <= 17, 'no big jump (no band)');
  }
  assert.match(fade.bannerFadeGradient('var(--x)'), /^linear-gradient\(to bottom, color-mix\(in srgb, var\(--x\) 0%, transparent\) 0%,[\s\S]*color-mix\(in srgb, var\(--x\) 100%, transparent\) 100%\)$/);
  assert.match(fade.BANNER_FADE_STYLES, /\.vr-banner-fade::after\{[\s\S]*var\(--vr-banner-fade-to\)/);

  // Owner page: the class, the page's own background, and no second gradient.
  const header = read('components', 'profile', 'ProfileHeader.tsx');
  assert.match(header, /<BannerFadeStyles \/>/);
  assert.match(header, /className="profile-banner vr-banner-fade"/);
  const ownerStyles = read('components', 'profile', 'profileStyles.ts');
  assert.match(ownerStyles, /--vr-banner-fade-to:var\(--main-bg\); --vr-banner-fade-z:0;/);
  assert.doesNotMatch(ownerStyles, /\.profile-banner::before/, 'the old white/black gradient is gone');
  // Dark: the page is painted #000 by the shared dark theme; the fade's colour must be that same colour.
  assert.match(read('public', 'js', 'varoom-dark-theme.css'), /\[data-theme="dark"\] \.profile-main,[\s\S]*?background: #000000 !important;/);
  assert.match(ownerStyles, /html\[data-theme="dark"\] \.profile-page \.profile-main\{--main-bg:#000000;/);
  // Public page: the same.
  const banner = read('components', 'hostProfile', 'ProfileBanner.tsx');
  assert.match(banner, /<BannerFadeStyles \/>/);
  assert.match(banner, /className="profile-banner vr-banner-fade"/);
  assert.match(banner, /--vr-banner-fade-to:var\(--host-profile-page\); --vr-banner-fade-z:1;/);
  assert.doesNotMatch(banner, /\.profile-banner::after/, 'the old white/black gradient is gone');
});

test('the host\'s bio sits in the banner under the details, two lines at most, on both pages', () => {
  const header = read('components', 'profile', 'ProfileHeader.tsx');
  assert.match(header, /<\/div>\n\s+\{isHost && profile\.bio && <p className="profile-bio" id="profile-bio">\{profile\.bio\}<\/p>\}/, 'after the meta row');
  assert.match(read('components', 'profile', 'profileStyles.ts'), /\.profile-page \.profile-bio\{ display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;/);
  const view = read('components', 'hostProfile', 'HostProfile.tsx');
  assert.match(view, /<\/div>\n\s+\{host\.bio && <p className="host-profile-bio">\{host\.bio\}<\/p>\}\n\s+<div className="host-profile-rating"/, 'after the meta row, in the banner');
  assert.equal((view.match(/host\.bio &&/g) || []).length, 1, 'only once (no longer below the banner)');
  assert.match(view, /\.host-profile-bio \{ display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;/);
});

test('Discard draft on /profile: confirm, then the draft (and its unpaid listing) is discarded', async () => {
  const cards = read('components', 'profile', 'ProfileCards.tsx');
  assert.match(cards, /aria-label=\{`Discard draft: \$\{title\}`\}/);
  assert.match(cards, /Discard this draft\?/);
  assert.match(cards, /await discardListingDraft\(token, draft\.id\);\n\s+setConfirming\(false\);\n\s+onDiscarded\(draft\.id\);/);
  assert.doesNotMatch(cards, /<Link className="card draft-card"/, 'no button inside the link');
  const page = read('pages', 'profile.tsx');
  assert.match(page, /setDrafts\(\(current\) => current\.filter\(\(draft\) => draft\.id !== draftId\)\);\n\s+if \(userId\) invalidateHostProfile\(userId, userId, 'drafts'\);/);
  assert.match(read('components', 'profile', 'HostListings.tsx'), /<DraftCard key=\{draft\.id\} draft=\{draft\} token=\{token\} notify=\{notify\} onDiscarded=\{onDraftDiscarded\} \/>/);

  const actions = loadTs(path.join(root, 'lib', 'listings', 'hostListingActions.ts'));
  const calls = [];
  await actions.discardListingDraft('tok', 'D 1', async (url, init) => { calls.push([url, init.method, init.headers.Authorization]); return { ok: true, status: 204, json: async () => { throw new Error('empty'); } }; });
  assert.deepEqual(calls, [['/api/listing-drafts/D%201?discard=1', 'DELETE', 'Bearer tok']]);
  await assert.rejects(
    actions.discardListingDraft('tok', 'D1', async () => ({ ok: false, status: 409, json: async () => ({ error: 'A payment for this listing is still in progress. Try again once it has finished.', code: 'DRAFT_PAYMENT_PENDING' }) })),
    /payment for this listing is still in progress/,
  );
});
