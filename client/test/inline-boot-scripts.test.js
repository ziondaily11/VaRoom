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

for (const [file, name] of [['_document.js', 'themeBootScript'], ['_app.js', 'fontSizeScript']]) {
  test(`${file} ${name} is valid JavaScript after template evaluation`, () => {
    const script = inlineScript(file, name);
    assert.doesNotThrow(() => new Function(script), SyntaxError);
    assert.match(script, /replace\(\/\\\/\$\/, ''\)/, 'trailing-slash regex survives as /\\/$/');
  });
}
