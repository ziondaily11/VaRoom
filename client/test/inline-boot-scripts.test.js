const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

// Inline scripts are authored inside JS template literals, so escapes such as
// `\/` are consumed before the browser sees them. Evaluate each literal the
// way the bundle does and make sure the resulting script still parses.
function inlineScript(file, name) {
  const source = fs.readFileSync(path.join(root, 'pages', file), 'utf8');
  const start = source.indexOf(`const ${name} = \``);
  assert.ok(start >= 0, `${name} not found in ${file}`);
  const bodyStart = source.indexOf('`', start) + 1;
  const bodyEnd = source.indexOf('`;', bodyStart);
  // eslint-disable-next-line no-new-func
  return new Function('return `' + source.slice(bodyStart, bodyEnd) + '`;')();
}

test('_app.js fontSizeScript is valid JavaScript after template evaluation', () => {
  const script = inlineScript('_app.tsx', 'fontSizeScript');
  assert.doesNotThrow(() => new Function(script), SyntaxError);
});

test('the pre-paint theme script generated from lib/theme.ts is valid and applies the theme', () => {
  const { themeBootScript } = require('./helpers/loadTs').loadTs(path.join(root, 'lib', 'theme.ts'));
  const script = themeBootScript();
  assert.doesNotThrow(() => new Function(script), SyntaxError);
  for (const [pathname, saved, expected] of [['/', 'dark', 'light'], ['/property-news/', 'dark', 'light'], ['/bookings', 'dark', 'dark'], ['/bookings', null, 'light']]) {
    const attrs = {};
    const documentElement = { style: {}, setAttribute: (key, value) => { attrs[key] = value; } };
    new Function('window', 'document', 'localStorage', script)(
      { location: { pathname }, matchMedia: () => ({ matches: false }) },
      { documentElement },
      { getItem: () => saved },
    );
    assert.equal(attrs['data-theme'], expected, `${pathname} (${saved})`);
    assert.equal(documentElement.style.colorScheme, expected);
  }
});
