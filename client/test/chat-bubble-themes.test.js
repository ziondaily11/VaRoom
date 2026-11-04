const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const themes = loadTs(path.join(root, 'lib', 'chat', 'chatThemes.ts'));

// WCAG relative luminance and contrast ratio.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('five themes; Charcoal / Cool Grey is the default and the fallback', () => {
  assert.deepEqual(themes.CHAT_THEMES.map((t) => t.id), ['charcoal', 'teal', 'indigo', 'beige', 'coral']);
  assert.equal(themes.DEFAULT_CHAT_THEME, 'charcoal');
  assert.equal(themes.chatTheme('nope').id, 'charcoal');
  assert.equal(themes.isChatThemeId('teal'), true);
  assert.equal(themes.isChatThemeId('purple'), false);
});

test('bubble text is readable (at least 4.5:1) and read ticks show (at least 2:1) in every theme and mode', () => {
  themes.CHAT_THEMES.forEach((theme) => {
    ['light', 'dark'].forEach((mode) => {
      const c = theme[mode];
      assert.ok(contrast(c.sent, c.sentText) >= 4.5, `${theme.id} ${mode} sent text`);
      assert.ok(contrast(c.received, c.receivedText) >= 4.5, `${theme.id} ${mode} received text`);
      assert.ok(contrast(c.sent, c.readTick) >= 2, `${theme.id} ${mode} read ticks`);
    });
  });
});

test('a theme becomes light and dark CSS variables; chats.css picks the mode for the bubbles', () => {
  const style = themes.chatThemeStyle('indigo');
  assert.equal(style['--bubble-out-l'], '#4F4A9E');
  assert.equal(style['--bubble-out-d'], '#3F3A82');
  assert.equal(style['--bubble-read-tick-l'], '#4ADE80');
  const css = read('public', 'js', 'chats.css');
  assert.match(css, /\.msg-row\.in \.bubble\{ background:var\(--bubble-in\); color:var\(--bubble-in-text\);/);
  assert.match(css, /\.msg-row\.out \.bubble\{ background:var\(--bubble-out\); color:var\(--bubble-out-text\);/);
  assert.match(css, /\[data-theme="dark"\] \.app-shell\{\s*--bubble-out:var\(--bubble-out-d, #3F3F42\)/);
  assert.match(css, /\[data-theme="dark"\] \.msg-row\.out \.bubble \{ background:var\(--bubble-out\) !important; color:var\(--bubble-out-text\) !important; \}/);
  assert.doesNotMatch(css, /\.bubble[^{]*\{[^}]*#2563EB/, 'the old blue is gone from bubbles');
});

test('Chat Settings shows the themes and saves the choice to the account; Chats applies it at once', () => {
  const component = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(component, /<Section title="THEME">\s*<ThemePicker value=\{settings\.chatTheme\} onChange=\{setTheme\} \/>/);
  assert.match(component, /role="radio"\s*aria-checked=\{selected\}/);
  assert.match(component, /void saveProfileSetting\(getSupabaseClient\(\), userId, 'chatTheme', chatTheme, storage\(\)\);/);
  const page = read('pages', 'chats.tsx');
  assert.match(page, /const bubbleTheme = chatPrefs \? chatPrefs\.chatTheme : storedTheme;/);
  assert.match(page, /className=\{`app-shell [^`]*`\} style=\{bubbleThemeStyle\}>/);
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261104_000055_chat_theme.sql'), 'utf8');
  assert.match(migration, /add column if not exists chat_theme text not null default 'charcoal'/);
  assert.match(migration, /check \(chat_theme in \('charcoal', 'teal', 'indigo', 'beige', 'coral'\)\)/);
});
