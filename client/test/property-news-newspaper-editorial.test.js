const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const propertyNewsPath = path.join(root, 'pages', 'property-news.tsx');
const nextConfigPath = path.join(root, 'next.config.js');
const serverPath = path.join(root, '..', 'server', 'server.js');
const slugPath = path.join(root, 'pages', '[...slug].js');
const format = require('./helpers/loadTs').loadTs(path.join(root, 'lib', 'propertyNews', 'articleFormat.ts'));

test('Section 1 & 2: Newspaper Masthead and Article Header are implemented', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Prominent newspaper masthead
  assert.match(source, /className="newspaper-masthead-container"/);
  assert.match(source, /className="masthead-title">DAILY NEWS<\/h1>/);
  assert.match(source, /className="masthead-sub-identity"/);
  assert.match(source, /className="masthead-rule-thick"/);
  assert.match(source, /className="masthead-rule-thin"/);
  assert.match(source, /Original Country News Edition/);
  assert.match(source, /formatMastheadDate\(mastheadDate\)/);

  // The masthead dates the edition by the article's publication date (long
  // British form), falling back to today for a missing or invalid date.
  const dated = format.formatMastheadDate('2026-11-01T12:00:00Z');
  assert.match(dated, /Sunday/);
  assert.match(dated, /1 November 2026/);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  assert.equal(format.formatMastheadDate(undefined), today);
  assert.equal(format.formatMastheadDate('not a date'), today);

  // Article Header
  assert.match(source, /className="article-header"/);
  assert.match(source, /className="eyebrow"/);
  assert.match(source, /className="article-headline"/);
  assert.match(source, /className="article-meta meta"/);
  assert.match(source, /className="editorial-divider"/);
});

test('Section 3: Two-Column Editorial Article Body with Text Trail and Image Trail', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Editorial columns container
  assert.match(source, /className=\{`editorial-columns \$\{hasMedia \? 'has-media' : 'no-media'\}`\}/);

  // Left column: text trail
  assert.match(source, /className="text-trail"/);
  assert.match(source, /className="detail-body"/);
  assert.match(source, /className="editorial-subhead"/);
  assert.match(source, /className="editorial-pullquote"/);
  assert.match(source, /detail-lead/);
  assert.match(source, /detail-p/);

  // Right column: image trail
  assert.match(source, /className="image-trail"/);
  assert.match(source, /aria-label="Article Media"/);
});

test('Section 4: Conditional Image and Media Rendering', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Images come from images[] (strings or objects), image_urls[] and image_url,
  // trimmed and de-duplicated; captions/credits fall back to the article's and
  // then the source name.
  const item = {
    id: 'a',
    title: 'T',
    caption: 'Article caption',
    source: { name: 'Daily Source' },
    images: [' https://img.test/1.jpg ', { url: 'https://img.test/2.jpg', caption: 'Two', credit: 'Photographer' }, { caption: 'no url' }, ''],
    image_urls: ['https://img.test/1.jpg', 'https://img.test/3.jpg'],
    image_url: 'https://img.test/4.jpg',
  };
  assert.deepEqual(format.extractImages(item), [
    { url: 'https://img.test/1.jpg', caption: 'Article caption', credit: 'Daily Source' },
    { url: 'https://img.test/2.jpg', caption: 'Two', credit: 'Photographer' },
    { url: 'https://img.test/3.jpg', caption: 'Article caption', credit: 'Daily Source' },
    { url: 'https://img.test/4.jpg', caption: 'Article caption', credit: 'Daily Source' },
  ]);
  assert.equal(format.extractImages({ id: 'b', title: 'T', image_url: 'https://img.test/x.jpg', credit: 'Own' })[0].credit, 'Own');

  // Failed images drop out; the right column exists only while an image or a video remains.
  const one = { id: 'c', title: 'T', image_url: 'https://img.test/only.jpg' };
  assert.equal(format.articleMedia(one, {}).hasMedia, true);
  assert.deepEqual(format.articleMedia(one, { 'https://img.test/only.jpg': true }), { activeImages: [], hasVideo: false, hasMedia: false });
  assert.deepEqual(format.articleMedia({ ...one, video_url: 'https://v.test/a.mp4' }, { 'https://img.test/only.jpg': true }), { activeImages: [], hasVideo: true, hasMedia: true });
  assert.deepEqual(format.articleMedia(null, {}), { activeImages: [], hasVideo: false, hasMedia: false });
  assert.match(source, /articleMedia\(detailItem, failedImageUrls\)/);

  // When hasMedia is false, right column is omitted
  assert.match(source, /\{hasMedia && \(\s*<aside className="image-trail"/);

  // No-media CSS ensures comfortable reading width without empty gap
  assert.match(source, /\.editorial-columns\.no-media\s*\{\s*display:\s*block;\s*max-width:\s*780px;/);

  // A failing image is reported so it leaves the media list
  assert.match(source, /onFailed=\{.*?handleImageFail\(img\.url\).*?\}/);

  // Video preservation with poster/thumbnail and captions
  assert.match(source, /className="newspaper-video-box"/);
  assert.match(source, /<video\s+className="newspaper-video"/);
  assert.match(source, /poster=\{detailItem\.video_thumbnail \|\| detailItem\.poster \|\| detailItem\.image_url \|\| undefined\}/);
});

test('Section 5: Responsive Design across Desktop, Tablet, and Mobile', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Desktop two-column grid
  assert.match(source, /\.editorial-columns\.has-media\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s*minmax\(0,\s*1fr\)/);

  // Tablet breakpoint (max-width: 900px)
  assert.match(source, /@media\s*\(max-width:\s*900px\)/);

  // Mobile single column reflow (max-width: 768px)
  assert.match(source, /@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.editorial-columns\.has-media\s*\{[\s\S]*?flex-direction:\s*column/);
});

test('Section 6: Routing and Property News Links to Native TSX Page', () => {
  // Check client/next.config.js redirects
  const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
  assert.match(nextConfig, /source:\s*'\/property-news\.html'/);
  assert.match(nextConfig, /destination:\s*'\/property-news'/);
  assert.match(nextConfig, /source:\s*'\/legacy-pages\/property-news\.html'/);

  // The retired HTML template is not part of catch-all routing.
  assert.equal(fs.existsSync(slugPath), false, 'the legacy catch-all is retired (E1)');

  // Check server.js redirects legacy HTML to /property-news
  const serverSource = fs.readFileSync(serverPath, 'utf8');
  assert.match(serverSource, /app\.get\(\['\/property-news\.html',\s*'\/legacy-pages\/property-news\.html'\]/);
  assert.match(serverSource, /res\.redirect\(301,\s*`\/property-news\$\{query\}`\)/);

  // The native route is not served through the legacy page-template registry.
  assert.doesNotMatch(serverSource, /'\/property-news':\s*'property-news\.html'/);
});

test('Section 7: Fact grid, Source Box, and Clean Editorial Verification', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  assert.match(source, /className="fact-grid"/);
  assert.match(source, /className="source-box"/);
  assert.match(source, /className="source-link"/);
  assert.match(source, /--newspaper-white:\s*#ffffff;/);
  assert.match(source, /--newspaper-ink:\s*#111111;/);
  assert.match(source, /--newspaper-border:\s*#111111;/);
});
