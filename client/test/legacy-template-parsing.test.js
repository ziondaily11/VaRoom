const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catchAllSource = fs.readFileSync(path.join(root, 'pages', '[...slug].js'), 'utf8');
const bodyPattern = new RegExp(catchAllSource.match(/source\.match\(\/(<body\[\^>\]\*>\(\[\\s\\S\]\*\??\)<\\\/body>)\/i\)/)[1], 'i');

test('legacy body extraction keeps inline scripts that contain "</body>" strings intact', () => {
  const source = '<html><head></head><body><main>x</main><script>frame.srcdoc = \'<html><body>preview</body></html>\';\nafter();</script></body></html>';
  const body = source.match(bodyPattern)[1];
  assert.match(body, /after\(\);<\/script>$/);
});

test('every legacy template keeps balanced <script> tags after body extraction', () => {
  const dir = path.join(root, 'legacy-pages');
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.html'))) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const body = (source.match(bodyPattern) || [])[1] || source;
    const opens = (body.match(/<script\b/gi) || []).length;
    const closes = (body.match(/<\/script>/gi) || []).length;
    assert.equal(opens, closes, `${file}: body extraction split a <script>`);
  }
});
