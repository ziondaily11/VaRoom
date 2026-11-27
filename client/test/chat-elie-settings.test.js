'use strict';

// Chat Settings → Elie (hosts) and Elie's saved draft in the chat.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const cs = loadTs(path.join(root, 'lib', 'chat', 'chatSettings.ts'));

test('Elie settings load from the profile: answers while away and suggestions on, drafts and new enquiries off', () => {
  const unset = cs.profileSettingsFromRow({});
  assert.equal(unset.elieAwayReplies, true);
  assert.equal(unset.elieSuggestListings, true);
  assert.equal(unset.elieAwayDrafts, false);
  assert.equal(unset.elieNewEnquiries, false);
  const set = cs.profileSettingsFromRow({ elie_away_replies: false, elie_away_drafts: true, elie_new_enquiries: true, elie_suggest_listings: false });
  assert.deepEqual([set.elieAwayReplies, set.elieAwayDrafts, set.elieNewEnquiries, set.elieSuggestListings], [false, true, true, false]);
});

test('Chat Settings shows the Elie section to hosts only, saving each switch to the account', () => {
  const settings = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(settings, /\{role === 'host' && \(\s*<Section title="Elie" anchor="cs-elie-settings">/);
  for (const key of ['elieAwayReplies', 'elieNewEnquiries', 'elieAwayDrafts', 'elieSuggestListings']) {
    assert.ok(settings.includes(`onChange={(v) => setToggle('${key}', v)}`), key);
  }
});

test('a saved draft is offered above the composer: Use fills it, Dismiss drops it; both remove it', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /if \(!conversationId \|\| isElie \|\| !isHost\) return undefined;/, 'hosts only');
  assert.match(page, /if \(use\) fillComposer\(savedDraft\.reply\);\s*setSavedDraft\(null\);\s*discardElieSavedDraft\(savedDraft\.conversationId\)/);
  assert.match(page, /<strong>Elie drafted a reply<\/strong> while you were away\./);
  const api = read('lib', 'elieHost.ts');
  assert.match(api, /`\/api\/chat\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/elie-draft`, \{ method: 'DELETE' \}/);
});
