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

  // The masthead names the paper once: no edition line or strapline explaining it.
  assert.match(source, /className="newspaper-masthead-container"/);
  assert.match(source, /className="masthead-title">DAILY NEWS<\/h1>/);
  assert.match(source, /className="masthead-brand"/);
  assert.match(source, /className="masthead-rule-thick"/);
  assert.match(source, /className="masthead-rule-thin"/);
  assert.doesNotMatch(source, /Original Country News Edition|masthead-sub-identity|FRONT PAGE DISPATCH/);
  assert.match(source, /formatMastheadDate\(mastheadDate\)/);

  // The masthead dates the edition by the article's publication date (long
  // British form), falling back to today for a missing or invalid date.
  const dated = format.formatMastheadDate('2026-11-01T12:00:00Z');
  assert.match(dated, /Sunday/);
  assert.match(dated, /1 November 2026/);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  assert.equal(format.formatMastheadDate(undefined), today);
  assert.equal(format.formatMastheadDate('not a date'), today);

  // Article Header: the place and the date sit on separate lines.
  assert.match(source, /className="article-header"/);
  assert.match(source, /className="eyebrow"/);
  assert.match(source, /className="article-headline"/);
  assert.match(source, /<Dateline news=\{detailItem\} detailed \/>/);
  assert.match(source, /className="dateline-place"/);
  assert.match(source, /className="dateline-date"/);
  assert.match(source, /\.dateline\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;/);
  assert.match(source, /className="editorial-divider"/);
});

test('Section 3: Newspaper columns: media heads the second column and the story continues beneath it', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  assert.match(source, /className=\{`article-columns\$\{twoColumns \? '' : ' single'\}`\}/);
  assert.match(source, /className="detail-body"/);
  assert.match(source, /className="editorial-subhead"/);
  assert.match(source, /className="editorial-pullquote"/);
  assert.match(source, /detail-lead/);
  assert.match(source, /detail-p/);
  assert.match(source, /className="article-media"/);
  assert.match(source, /aria-label="Article Media"/);

  // Columns balance: equal paragraphs split in half; media on the right moves text left.
  const p = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'.repeat(400)];
  assert.equal(format.columnSplit(p), 2);
  assert.equal(format.columnSplit(p, 0, 800), 3);
  assert.equal(format.columnSplit(p, 800, 0), 1, 'a long standfirst keeps less body on the left');
  assert.equal(format.columnSplit(['only']), 1, 'the first column always keeps a paragraph');
  assert.equal(format.columnSplit(p, 0, 100000), 4, 'very large media leaves the whole body on the left');
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

  // Failed images drop out; media exists only while an image or a video remains.
  const one = { id: 'c', title: 'T', image_url: 'https://img.test/only.jpg' };
  assert.equal(format.articleMedia(one, {}).hasMedia, true);
  assert.deepEqual(format.articleMedia(one, { 'https://img.test/only.jpg': true }), { activeImages: [], hasVideo: false, hasMedia: false });
  assert.deepEqual(format.articleMedia({ ...one, video_url: 'https://v.test/a.mp4' }, { 'https://img.test/only.jpg': true }), { activeImages: [], hasVideo: true, hasMedia: true });
  assert.deepEqual(format.articleMedia(null, {}), { activeImages: [], hasVideo: false, hasMedia: false });
  assert.match(source, /articleMedia\(detailItem, failedImageUrls\)/);

  // Without media, a long story still uses two columns; a short one is a single centred column.
  assert.match(source, /media=\{hasMedia && \(\s*<aside className="article-media"/);
  assert.match(source, /const MIN_TWO_COLUMN_CHARS = 1400;/);
  assert.match(source, /\.article-columns\.single\s*\{\s*grid-template-columns:\s*minmax\(0,\s*720px\);\s*justify-content:\s*center;/);

  // A failing image is reported so it leaves the media list
  assert.match(source, /onFailed=\{.*?handleImageFail\(img\.url\).*?\}/);

  // Video preservation with poster/thumbnail and captions
  assert.match(source, /className="newspaper-video-box"/);
  assert.match(source, /<video\s+className="newspaper-video"/);
  assert.match(source, /poster=\{detailItem\.video_thumbnail \|\| detailItem\.poster \|\| detailItem\.image_url \|\| undefined\}/);
});

test('Section 5: Responsive Design across Desktop, Tablet, and Mobile', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Desktop: two equal columns with a rule between them.
  assert.match(source, /\.article-columns\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/);
  assert.match(source, /\.article-col \+ \.article-col\s*\{[\s\S]*?border-left:\s*1px solid/);

  // Tablet and phone (max-width: 900px): one column.
  assert.match(source, /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.article-columns\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(source, /@media\s*\(max-width:\s*768px\)/);
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
