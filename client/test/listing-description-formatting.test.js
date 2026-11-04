const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const clientRoot = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(clientRoot, 'components', 'booking', 'bookingStyles.ts'), 'utf8');
const details = fs.readFileSync(path.join(clientRoot, 'components', 'booking', 'ListingDetails.tsx'), 'utf8');
const { getCleanTruncatedDescription, descriptionParagraphs, descriptionPreviewChars, visibleParagraphs } = loadTs(path.join(clientRoot, 'lib', 'booking', 'description.ts'));

test('Property details page: CSS removes line-clamp and defines paragraph & toggle button styles', () => {
  assert.doesNotMatch(styles, /\.about-text\s*\{[^}]*-webkit-line-clamp/i, '.about-text must not be hard-clamped with -webkit-line-clamp');
  assert.match(styles, /\.about-paragraph\s*\{[^}]*white-space:\s*pre-wrap/i, '.about-paragraph must keep the host formatting');
  assert.match(styles, /\.about-toggle-btn\s*\{[^}]*display:\s*inline/i, '.about-toggle-btn must be styled inline');
  assert.match(styles, /\.about-toggle-btn\s*\{[^}]*text-decoration:\s*underline/i, '.about-toggle-btn must be underlined');
});

test('Property details page: clean truncation and paragraphs', () => {
  const shortText = 'Cozy 1-bedroom flat close to the park.';
  assert.deepEqual({ ...getCleanTruncatedDescription(shortText, 220, 3) }, { text: shortText, hasOverflow: false });

  const longText = 'Discover this modern office space located in Westlands, Nairobi. The workspace offers a clean, professional environment with ample natural lighting, reliable electricity, and flexible space for different business needs. Features include: - Spacious working area - High-speed internet availability - Comfortable lighting and ventilation - Secure building access - Convenient access to shops, restaurants, and public transport - Suitable for startups, consultants, agencies, and tech teams.';
  const longResult = getCleanTruncatedDescription(longText, 220, 3);
  assert.equal(longResult.hasOverflow, true);
  assert.ok(longResult.text.length < longText.length);
  assert.doesNotMatch(longResult.text, /\.\.\.$/, 'no raw ellipsis');
  assert.doesNotMatch(longResult.text, /(,\s*and|\sand|[,;:\-])$/i, 'no trailing punctuation or dangling "and"');

  const multiLineResult = getCleanTruncatedDescription('Line 1\nLine 2\nLine 3\nLine 4\nLine 5', 220, 3);
  assert.equal(multiLineResult.hasOverflow, true);
  assert.ok(multiLineResult.text.split('\n').length <= 3, 'at most 3 lines');

  const paragraphs = descriptionParagraphs('First paragraph about the listing.\n\nSecond paragraph with details.\n\nFeatures:\n- Fast WiFi\n- Parking');
  assert.equal(paragraphs.length, 3, 'one paragraph element per paragraph');
  assert.equal(paragraphs[2], 'Features:\n- Fast WiFi\n- Parking', 'newlines inside a paragraph are kept for pre-wrap');
});

test('Property details page: Read more / Show less toggles in place, rendered as text (no HTML injection)', () => {
  // The preview is shorter on phones; expanding shows the whole description.
  assert.equal(descriptionPreviewChars(390), 140);
  assert.equal(descriptionPreviewChars(639), 140);
  assert.equal(descriptionPreviewChars(640), 220);
  assert.equal(descriptionPreviewChars(null), 220, 'server render');
  const full = 'First paragraph.\n\nSecond paragraph that is much longer than the preview allows.';
  const preview = { text: 'First paragraph.', hasOverflow: true };
  assert.deepEqual(visibleParagraphs(full, preview, false), ['First paragraph.']);
  assert.deepEqual(visibleParagraphs(full, preview, true), ['First paragraph.', 'Second paragraph that is much longer than the preview allows.']);
  // Toggle markup (no DOM renderer here).
  assert.match(details, /id="about-desc-container"/);
  assert.match(details, /className="about-toggle-btn" id="about-desc-toggle" aria-expanded=\{expanded\}/);
  assert.match(details, /\{expanded \? 'Show less' : 'Read more'\}/);
  assert.match(details, /visibleParagraphs\(text, preview, expanded\)/);
  assert.doesNotMatch(details, /dangerouslySetInnerHTML/, 'description text is never inserted as HTML');
});
