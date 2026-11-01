const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const propertyNewsPath = path.join(root, 'pages', 'property-news.tsx');
const nextConfigPath = path.join(root, 'next.config.js');
const serverPath = path.join(root, '..', 'server', 'server.js');
const slugPath = path.join(root, 'pages', '[...slug].js');

test('Section 1 & 2: Newspaper Masthead and Article Header are implemented', () => {
  const source = fs.readFileSync(propertyNewsPath, 'utf8');

  // Prominent newspaper masthead
  assert.match(source, /className="newspaper-masthead-container"/);
  assert.match(source, /className="masthead-title">DAILY NEWS<\/h1>/);
  assert.match(source, /className="masthead-sub-identity"/);
  assert.match(source, /className="masthead-rule-thick"/);
  assert.match(source, /className="masthead-rule-thin"/);
  assert.match(source, /Original Country News Edition/);
  assert.match(source, /formatMastheadDate/);

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

  // Multi-image and media extractor
  assert.match(source, /function extractImages/);
  assert.match(source, /const candidateImages = detailItem \? extractImages\(detailItem\) : \[\]/);
  assert.match(source, /const activeImages = candidateImages\.filter/);
  assert.match(source, /const hasVideo = Boolean\(detailItem\?\.video_url\)/);
  assert.match(source, /const hasMedia = activeImages\.length > 0 \|\| hasVideo/);

  // When hasMedia is false, right column is omitted
  assert.match(source, /\{hasMedia && \(\s*<aside className="image-trail"/);

  // No-media CSS ensures comfortable reading width without empty gap
  assert.match(source, /\.editorial-columns\.no-media\s*\{\s*display:\s*block;\s*max-width:\s*780px;/);

  // Graceful failure handling
  assert.match(source, /handleImageFail/);
  assert.match(source, /setFailedImageUrls/);
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
  const slugSource = fs.readFileSync(slugPath, 'utf8');
  assert.doesNotMatch(slugSource, /property-news\.html/);
  assert.match(slugSource, /return \{\s*notFound:\s*true\s*\}/);

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
