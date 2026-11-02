const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const { parseMessageBody, hasMessageMarkup, decodeEntities } = loadTs(path.join(__dirname, '..', 'lib', 'chat', 'messageBody.ts'));

// Serialise the parsed tree back to markup to compare shapes compactly.
function serialise(nodes) {
  return nodes.map((node) => (typeof node === 'string'
    ? `"${node}"`
    : `<${node.tag}>${serialise(node.children)}</${node.tag}>`)).join('');
}

test('formatting from the desktop editor is kept, without any attributes', () => {
  assert.equal(serialise(parseMessageBody('<b>Hi</b> <i class="x">there</i><br>Line 2')), '<b>"Hi"</b>" "<i>"there"</i><br></br>"Line 2"');
  assert.equal(serialise(parseMessageBody('<ul><li>One</li><li>Two</li></ul>')), '<ul><li>"One"</li><li>"Two"</li></ul>');
  assert.equal(serialise(parseMessageBody('<div>First</div><div>Second</div>')), '<div>"First"</div><div>"Second"</div>');
});

test('event handlers, scripts and other markup cannot reach the page', () => {
  for (const payload of [
    '<b onmouseover=alert(1)>x</b>',
    "<b onmouseover='alert(1)'>x</b>",
    '<b/onmouseover=alert(1)>x</b>',
    '<img src=x onerror=alert(1)><b>x</b>',
    '<a href="javascript:alert(1)"><b>x</b></a>',
    '<svg onload=alert(1)><b>x</b></svg>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><b>x</b>',
  ]) {
    const tree = parseMessageBody(payload);
    const walk = (nodes) => nodes.forEach((node) => {
      if (typeof node === 'string') return;
      assert.deepEqual(Object.keys(node).sort(), ['children', 'tag'], payload);
      assert.ok(['strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'p', 'div', 'br'].includes(node.tag), payload);
      walk(node.children);
    });
    walk(tree);
  }
  // Disallowed tags are removed and their text kept; script/style/template content is dropped.
  assert.equal(serialise(parseMessageBody('<b>a</b><script>alert(1)</script>after')), '<b>"a"</b>"after"');
  assert.equal(serialise(parseMessageBody('<span>kept</span><style>b{}</style>')), '"kept"');
  assert.equal(serialise(parseMessageBody('<b>x</b><script>never closed')), '<b>"x"</b>');
});

test('entities decode to text and stray "<" stays text', () => {
  assert.equal(decodeEntities('a &amp; b &lt;3 &#39;x&#x27; &nbsp;&unknown;'), "a & b <3 'x'  &unknown;");
  assert.equal(serialise(parseMessageBody('<b>1 < 2 &lt;b&gt;</b>')), '<b>"1 ""<"" 2 <b>"</b>');
});

test('only bodies with formatting tags are parsed (legacy rule)', () => {
  assert.equal(hasMessageMarkup('plain <3 text'), false);
  assert.equal(hasMessageMarkup('<b>x</b>'), true);
  assert.equal(hasMessageMarkup('<div>x</div>'), true);
});

test('Chats renders bodies without innerHTML and sends from the button', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'pages', 'chats.tsx'), 'utf8');
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /onSend=\{\(\) => \{ void handleSendMessage\(\); \}\}/, 'the click event is not passed as the text');
  assert.match(source, /e\.key === 'Enter' && !e\.shiftKey && window\.matchMedia\('\(max-width: 760px\)'\)\.matches/, 'mobile Enter sends');
  assert.doesNotMatch(source, /Â|â€/);
});
