const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const api = loadTs(path.join(root, 'lib', 'api.ts'), { mocks: { './supabase/client': { getSupabaseClient: () => null } } });

function loadElieHost(apiFetch) {
  return loadTs(path.join(root, 'lib', 'elieHost.ts'), { mocks: { './api': { ApiError: api.ApiError, apiFetch } } });
}

test('Elie\'s refusals are recognised, with the plans link; usage reads as one line', () => {
  const host = loadElieHost(async () => ({}));
  const denied = new api.ApiError('You’ve used your 300 Elie actions this month.', 429, { elie: { reason: 'limit', used: 300, limit: 300, plansUrl: '/pricing' } });
  assert.deepEqual(host.elieHostDenial(denied), { reason: 'limit', used: 300, limit: 300, plansUrl: '/pricing' });
  assert.equal(host.elieHostDenial(new api.ApiError('Down', 503, {})), null);
  assert.equal(host.elieHostDenial(new Error('x')), null);
  assert.equal(host.elieUsageText({ included: true, used: 37, limit: 300, plansUrl: '/pricing' }), 'Elie answers guests while you’re away · 37 of 300 Elie actions this month');
  assert.match(host.elieUsageText({ included: false, used: 0, limit: 300, plansUrl: '/pricing' }), /^Your away message is sent\. Elie’s answers come with plans that include Elie\.$/);
});

test('drafts and Write with Elie call the server routes', async () => {
  const calls = [];
  const host = loadElieHost(async (url, options) => { calls.push([url, options]); return url.endsWith('/draft') ? { reply: 'Hi', skipped: false } : { text: 'Written' }; });
  assert.deepEqual(await host.requestElieDraft('c 1'), { reply: 'Hi', skipped: false });
  assert.equal(await host.writeWithElie({ field: 'summary', category: 'airbnb', facts: { Title: 'Flat' }, current: '' }), 'Written');
  assert.deepEqual(calls, [
    ['/api/chat/conversations/c%201/draft', { method: 'POST', body: {} }],
    ['/api/elie/write', { method: 'POST', body: { field: 'summary', category: 'airbnb', facts: { Title: 'Flat' }, current: '' } }],
  ]);
});

test('Write with Elie writes from the details filled in so far', () => {
  const { elieListingFacts } = loadTs(path.join(root, 'lib', 'listWizard', 'elieFacts.ts'));
  const { emptyForm } = loadTs(path.join(root, 'lib', 'listWizard', 'formState.ts'));
  const form = { ...emptyForm(), fields: { title: 'Garden flat', 'location-city': 'Nairobi', 'stay-bedrooms': '2', 'max-guests': '', 'price-amount': '6000' }, amenities: [{ key: 'wifi', checked: true }, { key: 'pool', checked: false }] };
  const facts = elieListingFacts(form, 'airbnb');
  assert.deepEqual(Object.keys(facts), ['Title', 'City', 'Bedrooms', 'Price (KES)', 'Amenities']);
  assert.equal(facts.Amenities, 'Free Wi-Fi');
});

test('the wizard offers Write with Elie, or Improve when there is text', () => {
  const ElieWrite = loadTs(path.join(root, 'components', 'listWizard', 'ElieWrite.tsx'), {
    mocks: { '../../lib/elieHost': { elieHostDenial: () => null, writeWithElie: async () => '' } },
  }).default;
  const render = (value) => renderToStaticMarkup(React.createElement(ElieWrite, {
    field: 'summary', fieldId: 'caption', binding: { fields: { caption: value }, setField() {} }, source: { category: 'airbnb', facts: () => ({}) }, maxLength: 500,
  }));
  assert.match(render(''), /<button type="button" class="elie-write-button"[^>]*>.*Write with Elie<\/button>/);
  assert.match(render('Nice flat'), /Improve with Elie<\/button>/);
  const fields = read('components', 'listWizard', 'WizardFields.tsx');
  assert.match(fields, /<ElieWrite field="summary" fieldId="caption" binding=\{binding\} source=\{elie\} maxLength=\{500\} \/>/);
  assert.match(fields, /<ElieWrite field="description" fieldId="property-description" binding=\{binding\} source=\{elie\} \/>/);
  assert.match(read('pages', 'list.tsx'), /elie=\{\{ category, facts: \(\) => elieListingFacts\(form, category\) \}\}/);
});

test('hosts get an Elie draft button in a guest chat; @reply and drafts explain a missing plan', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /\{isHost && \(\s*<button type="button" className="fmt-elie" aria-label="Draft a reply with Elie"/);
  assert.match(page, /data-attach="elie"[^>]*\n\s*onClick=\{\(\) => \{ setMobileAttachMenuOpen\(false\); void draftWithElie\(\); \}\}>/);
  assert.match(page, /fillComposer\(draft\.reply\);/);
  assert.match(page, /if \(plainText\.trim\(\)\.toLowerCase\(\) === REPLY_COMMAND && err instanceof ApiError\) \{\s*showStatusNote\(err\.message, 6000, elieHostDenial\(err\)\?\.plansUrl\);/);
  assert.match(page, /\{statusLink && <a href=\{statusLink\}>See plans<\/a>\}/);
  assert.match(page, /if \(!res\.ok\) throw new ApiError\(body\.error \|\| 'Request failed', res\.status, body\);/);
});

test('Chat Settings shows hosts what Elie does while they are away', () => {
  const settings = read('components', 'chat', 'ChatSettings.tsx');
  assert.match(settings, /if \(role !== 'host' \|\| !userId\) return undefined;/);
  assert.match(settings, /<NavRow anchor="cs-elie" label="Elie answers" description=\{elieUsageText\(elieUsage\)\}/);
});
