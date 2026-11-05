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
  const { loadChats, renderChatsPage, render } = require('./helpers/chatsPage');
  const ChatSettings = loadChats('components/chat/ChatSettings.tsx', { user: { id: 'u1' } }).default;
  const html = render(ChatSettings, { role: 'client', onOpenArchived() {} });
  const picker = html.match(/<div class="cs-themes" role="radiogroup" aria-label="Message bubble colours">([\s\S]*?)<\/div><\/section>/)[1];
  assert.deepEqual([...picker.matchAll(/role="radio" aria-checked="(true|false)" class="cs-theme( is-selected)?" style="--bubble-out-l:([^;]+);/g)].map((m) => [m[1], m[3]]), [
    ['true', '#3A3A3C'], ['false', themes.chatTheme('teal').light.sent], ['false', '#4F4A9E'], ['false', themes.chatTheme('beige').light.sent], ['false', themes.chatTheme('coral').light.sent],
  ], 'five previews in their own colours; Charcoal selected by default');
  assert.match(read('components', 'chat', 'ChatSettings.tsx'), /void saveProfileSetting\(getSupabaseClient\(\), userId, 'chatTheme', chatTheme, storage\(\)\);/);

  assert.equal(themes.activeChatTheme({ chatTheme: 'coral' }, 'teal'), 'coral', 'the account\'s choice');
  assert.equal(themes.activeChatTheme(null, 'teal'), 'teal', 'this browser\'s copy until the account loads');
  assert.equal(themes.chatShellStyle('indigo', true)['--bubble-out-l'], '#4F4A9E');
  assert.match(renderChatsPage().html, /<div class="app-shell view-inbox" style="--bubble-out-l:#3A3A3C;/, 'the shell carries the theme');
  const page = read('pages', 'chats.tsx');
  assert.match(page, /const bubbleTheme = activeChatTheme\(chatPrefs, storedTheme\);/);
  assert.match(page, /writeStored\(window\.localStorage, 'chatTheme', chatPrefs\.chatTheme\)/, 'this browser keeps a copy');
  const migration = fs.readFileSync(path.join(root, '..', 'server', 'migrations', '20261104_000055_chat_theme.sql'), 'utf8');
  assert.match(migration, /add column if not exists chat_theme text not null default 'charcoal'/);
  assert.match(migration, /check \(chat_theme in \('charcoal', 'teal', 'indigo', 'beige', 'coral'\)\)/);
});
