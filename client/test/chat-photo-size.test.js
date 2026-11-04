const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
const media = fs.readFileSync(path.join(root, 'components', 'chat', 'MessageMedia.tsx'), 'utf8');

test('desktop photos fit a 330 × 360 box in their own shape, never cropped', () => {
  assert.match(css, /\.chat-message-image\{\s*display:block;\s*max-width:330px;\s*max-height:360px;\s*width:auto;\s*height:auto;\s*object-fit:contain;/);
  assert.match(css, /\.bubble\.bubble-media\{[^}]*max-width:min\(336px, 100%\);/, 'the 3px frame around it');
  assert.match(media, /window\.matchMedia\('\(max-width: 760px\)'\)\.matches \? 340 : 330;/);
});

test('phones keep their photo size', () => {
  assert.match(css, /@media \(max-width:760px\)\{\s*\.msg-row:has\(\.bubble-media\),\s*\.msg-row\.has-media\{\s*max-width:85%;\s*\}\s*\.bubble\.bubble-media\{\s*max-width:min\(346px, 100%\);\s*\}\s*\.chat-message-image\{\s*max-width:min\(340px, 78vw\);\s*max-height:420px;\s*\}/);
});
