const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const clientRoot = path.join(__dirname, '..');
const bookingHtmlPath = path.join(clientRoot, 'legacy-pages', 'booking.html');
const bookingHtml = fs.readFileSync(bookingHtmlPath, 'utf8');

test('Property details page: CSS removes line-clamp and defines paragraph & toggle button styles', () => {
  // Confirm .about-text does not use -webkit-line-clamp or -webkit-box
  assert.doesNotMatch(
    bookingHtml,
    /\.about-text\s*\{[^}]*-webkit-line-clamp/i,
    '.about-text must not be hard-clamped with -webkit-line-clamp'
  );

  // Confirm .about-paragraph preserves white-space: pre-wrap and wraps words
  assert.match(
    bookingHtml,
    /\.about-paragraph\s*\{[^}]*white-space:\s*pre-wrap/i,
    '.about-paragraph must have white-space: pre-wrap to preserve original host formatting'
  );

  // Confirm .about-toggle-btn has subtle inline link styling
  assert.match(
    bookingHtml,
    /\.about-toggle-btn\s*\{[^}]*display:\s*inline/i,
    '.about-toggle-btn must be styled inline'
  );
  assert.match(
    bookingHtml,
    /\.about-toggle-btn\s*\{[^}]*text-decoration:\s*underline/i,
    '.about-toggle-btn must have underline text decoration'
  );
});

test('Property details page: Helper functions handle clean truncation and formatting', () => {
  // Extract getCleanTruncatedDescription and formatDescriptionHtml from bookingHtml
  const extractFn = (name) => {
    const start = bookingHtml.indexOf(`function ${name}`);
    assert.ok(start !== -1, `function ${name} must be present in booking.html`);
    let depth = 0;
    let end = -1;
    for (let i = start; i < bookingHtml.length; i++) {
      if (bookingHtml[i] === '{') depth++;
      else if (bookingHtml[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    assert.ok(end > start, `Could not find end of function ${name}`);
    return bookingHtml.slice(start, end);
  };

  const escapeHtmlFn = `function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }`;

  const cleanTruncateCode = extractFn('getCleanTruncatedDescription');
  const formatHtmlCode = extractFn('formatDescriptionHtml');

  const evalContext = new Function(
    `${escapeHtmlFn}; ${cleanTruncateCode}; ${formatHtmlCode}; return { getCleanTruncatedDescription, formatDescriptionHtml };`
  )();

  const { getCleanTruncatedDescription, formatDescriptionHtml } = evalContext;

  // 1. Short description does not overflow
  const shortText = 'Cozy 1-bedroom flat close to the park.';
  const shortResult = getCleanTruncatedDescription(shortText, 220, 3);
  assert.equal(shortResult.hasOverflow, false);
  assert.equal(shortResult.text, shortText);

  // 2. Long description cleanly truncates at word boundary and strips trailing conjunctions/punctuation
  const longText = 'Discover this modern office space located in Westlands, Nairobi. The workspace offers a clean, professional environment with ample natural lighting, reliable electricity, and flexible space for different business needs. Features include: - Spacious working area - High-speed internet availability - Comfortable lighting and ventilation - Secure building access - Convenient access to shops, restaurants, and public transport - Suitable for startups, consultants, agencies, and tech teams.';
  const longResult = getCleanTruncatedDescription(longText, 220, 3);
  assert.equal(longResult.hasOverflow, true);
  assert.ok(longResult.text.length < longText.length, 'Truncated text must be shorter than full text');
  assert.doesNotMatch(longResult.text, /\.\.\.$/, 'Clean truncation should not leave raw ellipsis');
  assert.doesNotMatch(longResult.text, /(,\s*and|\sand|[,;:\-])$/i, 'Clean truncation should not leave trailing punctuation or dangling "and"');

  // 3. Multi-line description exceeds preview when lines > 3
  const multiLine = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
  const multiLineResult = getCleanTruncatedDescription(multiLine, 220, 3);
  assert.equal(multiLineResult.hasOverflow, true);
  assert.ok(multiLineResult.text.split('\n').length <= 3, 'Preview must contain at most 3 lines');

  // 4. Formatting preserves multiple paragraphs
  const structuredText = 'First paragraph about the listing.\n\nSecond paragraph with details.\n\nFeatures:\n- Fast WiFi\n- Parking';
  const previewHtml = formatDescriptionHtml(longResult.text, false, true);
  assert.match(previewHtml, /id="about-desc-toggle"/, 'Preview HTML must include the toggle button');
  assert.match(previewHtml, /Read more<\/button>/, 'Preview HTML must have "Read more" label');
  assert.match(previewHtml, /aria-expanded="false"/, 'Preview HTML toggle button must have aria-expanded="false"');

  const expandedHtml = formatDescriptionHtml(structuredText, true, true);
  assert.match(expandedHtml, /Show less<\/button>/, 'Expanded HTML must have "Show less" label');
  assert.match(expandedHtml, /aria-expanded="true"/, 'Expanded HTML toggle button must have aria-expanded="true"');

  // Confirm separate paragraphs are generated
  const paragraphMatches = expandedHtml.match(/<p class="about-paragraph">/g);
  assert.equal(paragraphMatches.length, 3, 'Should generate 3 distinct paragraph elements for 3 paragraphs');

  // Confirm intentional newlines inside a paragraph (e.g. bullets) are preserved in the text content
  assert.ok(expandedHtml.includes('- Fast WiFi\n- Parking'), 'Newlines inside paragraph must be preserved for pre-wrap');

  // Confirm HTML characters are safely escaped
  const xssText = '<script>alert("xss")</script>';
  const safeHtml = formatDescriptionHtml(xssText, false, false);
  assert.doesNotMatch(safeHtml, /<script>/, 'HTML must be escaped to prevent XSS');
  assert.match(safeHtml, /&lt;script&gt;/, 'Special characters must be converted to HTML entities');
});

test('Property details page: DOM container and toggle listeners are wired up properly', () => {
  // Confirm colMainHtml contains about-desc-container
  assert.match(
    bookingHtml,
    /id="about-desc-container"/,
    'booking.html must render an about-desc-container element'
  );

  // Confirm setupDescriptionToggle function exists and attaches click event
  assert.match(
    bookingHtml,
    /function setupDescriptionToggle\(\)/,
    'setupDescriptionToggle function must be defined'
  );
  assert.match(
    bookingHtml,
    /toggleBtn\.addEventListener\('click'/,
    'Click event listener must be attached to the toggle button'
  );

  // Confirm toggle toggles isDescriptionExpanded and updates innerHTML
  assert.match(
    bookingHtml,
    /isDescriptionExpanded\s*=\s*!isDescriptionExpanded/,
    'Toggle handler must toggle isDescriptionExpanded state'
  );
  assert.match(
    bookingHtml,
    /descContainer\.innerHTML\s*=\s*formatDescriptionHtml/,
    'Toggle handler must update descContainer.innerHTML with formatted HTML'
  );
});
