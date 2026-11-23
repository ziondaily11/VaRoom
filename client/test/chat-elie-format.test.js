const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const format = loadTs(path.join(root, 'lib', 'chat', 'elieFormat.ts'));

test('bold, italic and code become marks; stray asterisks stay text', () => {
  assert.deepEqual(format.parseInline('A **Cozy** stay, *quiet* and `wifi`'), [
    { kind: 'text', text: 'A ' }, { kind: 'bold', text: 'Cozy' }, { kind: 'text', text: ' stay, ' },
    { kind: 'italic', text: 'quiet' }, { kind: 'text', text: ' and ' }, { kind: 'code', text: 'wifi' },
  ]);
  assert.deepEqual(format.parseInline('5 * 3 = 15'), [{ kind: 'text', text: '5 * 3 = 15' }]);
});

test('paragraphs, lists, headings and named copy blocks', () => {
  const blocks = format.parseElieText([
    'Here you go:',
    '',
    '```Summary highlight',
    'Cozy stay near JKIA',
    '```',
    '```description',
    'Enjoy a seamless stay in Syokimau.',
    'Fast WiFi.',
    '```',
    '- WiFi',
    '- **Backup** generator',
    '1. First',
    '## Note',
  ].join('\n'));
  assert.deepEqual(blocks.map((block) => block.kind), ['paragraph', 'copy', 'copy', 'list', 'list', 'paragraph']);
  assert.deepEqual(blocks[1], { kind: 'copy', label: 'Summary highlight', text: 'Cozy stay near JKIA' });
  assert.deepEqual(blocks[2], { kind: 'copy', label: 'Description', text: 'Enjoy a seamless stay in Syokimau.\nFast WiFi.' });
  assert.equal(blocks[3].ordered, false);
  assert.deepEqual(blocks[3].items[1], [{ kind: 'bold', text: 'Backup' }, { kind: 'text', text: ' generator' }]);
  assert.equal(blocks[4].ordered, true);
  assert.deepEqual(blocks[5].lines, [[{ kind: 'bold', text: 'Note' }]]);
  assert.equal(format.copyLabel('text'), null, 'a language tag is not a name');
  assert.equal(format.copyLabel('guest_reply'), 'Guest reply');
});

test('an unclosed block still shows its text; an empty one shows nothing', () => {
  assert.deepEqual(format.parseElieText('```\nHello'), [{ kind: 'copy', label: null, text: 'Hello' }]);
  assert.deepEqual(format.parseElieText('```\n```'), []);
});

test('the reply renders as elements (never as HTML), copy blocks with a Copy button', () => {
  const ElieText = loadChats('components/chat/ElieText.tsx').default;
  const html = render(ElieText, { text: 'Hi **there** <b>raw</b>\n\n```Description\nNice place\n```' });
  assert.match(html, /<p>Hi <strong>there<\/strong> &lt;b&gt;raw&lt;\/b&gt;<\/p>/);
  assert.match(html, /<div class="elie-copy-block"><div class="elie-copy-head"><span>Description<\/span><button type="button" aria-label="Copy Description">Copy<\/button><\/div><pre>Nice place<\/pre><\/div>/);
});
