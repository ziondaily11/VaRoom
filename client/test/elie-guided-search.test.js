const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');
const { loadChats, render } = require('./helpers/chatsPage');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const elie = loadTs(path.join(root, 'lib', 'chat', 'elie.ts'));
const { createElieStore } = loadTs(path.join(root, 'lib', 'chat', 'elieStore.ts'), { mocks: { './elie': elie } });

const REFINE = { filters: { category: 'hotel', location: 'Nairobi' }, wants: [], query: 'hotels in nairobi', asked: [], shown: [], more: false };
const QUESTION = {
  field: 'area', text: 'Where in Nairobi?', step: 1, other: 'Somewhere else…',
  options: [{ label: 'Westlands', value: 'Westlands', count: 18 }, { label: 'Kilimani', value: 'Kilimani', count: 11 }, { label: 'CBD', value: 'CBD', count: 9 }],
};
const ASKED = { reply: 'I found 46 hotels in Nairobi. Where in Nairobi?', question: QUESTION, refine: REFINE, saved: true };

const settle = () => new Promise((resolve) => setImmediate(resolve));
function makeStore(ask) {
  return createElieStore({ getClient: () => null, getStorage: () => null, getToken: async () => 'tok', ask, wake: () => {}, fetchWallet: async () => ({ balance: 50, included: false }) });
}

test('an answer with a question becomes Elie\'s message and an open question; paging and quick replies are kept', () => {
  const entries = elie.elieResponseEntries(ASKED);
  assert.deepEqual(entries.map((entry) => entry.kind), ['elie', 'question']);
  assert.deepEqual(entries[1].question, QUESTION);
  const more = { refine: { ...REFINE, shown: ['a'], more: true }, remaining: 12 };
  const listed = elie.elieResponseEntries({ reply: 'Here they are', listings: [{ id: 'a' }], more, quick_replies: ['Yes', 'No'] });
  assert.deepEqual(listed[0].quickReplies, ['Yes', 'No']);
  assert.deepEqual(listed[1].more, more);
  const saved = elie.elieTurnEntries([{ role: 'elie', text: ASKED.reply, results: { question: QUESTION, refine: REFINE, quick_replies: ['Yes'] } }]);
  assert.deepEqual(saved.map((entry) => entry.kind), ['elie', 'question'], 'an open question comes back after a reload');
  assert.deepEqual(saved[0].quickReplies, ['Yes']);
});

test('answering sends the label and the search state with the answer; skip and typed answers too', async () => {
  const asked = [];
  const store = makeStore(async (request) => { asked.push(request); return asked.length === 1 ? ASKED : { reply: 'ok', saved: true }; });
  store.setUser('u1');
  await settle();
  await store.send('hotels in nairobi');
  const question = store.getState().entries.find((entry) => entry.kind === 'question');
  await store.answer(question, { option: QUESTION.options[0] });
  assert.equal(asked[1].message, 'Westlands');
  assert.deepEqual(asked[1].refine, { ...REFINE, answer: { field: 'area', value: 'Westlands', text: null, skip: false } });
  await store.answer(question, { skip: true });
  assert.equal(asked[2].message, 'Skip');
  assert.equal(asked[2].refine.answer.skip, true);
  await store.answer(question, { text: '  Karen ' });
  assert.equal(asked[3].message, 'Karen');
  assert.equal(asked[3].refine.answer.text, '  Karen ');
  assert.equal(asked[0].refine, null, 'a typed question has no search state');
});

test('Show more sends the paging state, is asked once, and its button leaves', async () => {
  const more = { refine: { ...REFINE, shown: ['a'], more: true }, remaining: 3 };
  const asked = [];
  const store = makeStore(async (request) => {
    asked.push(request);
    return asked.length === 1 ? { reply: 'Here', listings: [{ id: 'a' }], more, saved: true } : { reply: 'Here are 3 more.', listings: [{ id: 'b' }], saved: true };
  });
  store.setUser('u1');
  await settle();
  await store.send('hotels in karen');
  const listings = store.getState().entries.find((entry) => entry.kind === 'listings');
  await store.showMore(listings);
  await store.showMore(listings);
  assert.equal(asked.length, 2);
  assert.equal(asked[1].message, 'Show more');
  assert.deepEqual(asked[1].refine, more.refine);
  assert.equal(store.getState().entries.find((entry) => entry.id === listings.id).more, undefined);
});

test('a failed answer is retried with its search state', async () => {
  const asked = [];
  const store = makeStore(async (request) => {
    asked.push(request);
    if (asked.length === 1) return ASKED;
    if (asked.length === 2) throw new elie.ElieRequestError('Elie is temporarily unavailable.');
    return { reply: 'ok', saved: true };
  });
  store.setUser('u1');
  await settle();
  await store.send('hotels in nairobi');
  const question = store.getState().entries.find((entry) => entry.kind === 'question');
  await store.answer(question, { option: QUESTION.options[1] });
  const error = store.getState().entries.at(-1);
  assert.equal(error.kind, 'error');
  store.retry(error);
  await settle();
  assert.equal(asked[2].message, 'Kilimani');
  assert.equal(asked[2].refine.answer.value, 'Kilimani');
});

test('the question card: numbered options with counts, a typed option, Back, Skip and Type instead', () => {
  const Card = loadChats('components/chat/ElieQuestionCard.tsx').default;
  const html = render(Card, { question: QUESTION, onChoose() {}, onOther() {}, onSkip() {}, onType() {} });
  assert.match(html, /<span class="elie-question-title">Where in Nairobi\?<\/span><span class="elie-question-step">Question 1<\/span>/);
  assert.match(html, /<span class="elie-option-key" aria-hidden="true">1<\/span><span class="elie-option-label">Westlands<\/span><span class="elie-option-count" aria-label="18 listings">18<\/span>/);
  assert.match(html, /class="elie-question-option is-other"><span class="elie-option-label">Somewhere else…<\/span>/);
  assert.match(html, /<div class="elie-question-actions"><button type="button">Skip<\/button><button type="button">Type instead<\/button><\/div>/);
  assert.match(render(Card, { question: QUESTION, onChoose() {}, onOther() {}, onSkip() {}, onType() {}, onBack() {} }), /<button type="button">Back<\/button><button type="button">Skip/);
  const category = render(Card, { question: { ...QUESTION, field: 'category', other: null }, onChoose() {}, onOther() {}, onSkip() {}, onType() {} });
  assert.doesNotMatch(category, /is-other/);
});

test('the thread: quick replies only under Elie\'s latest message, the question is not repeated, Show more under results', () => {
  const { ElieThread } = loadChats('components/chat/ElieThread.tsx');
  const entries = [
    { id: '1', kind: 'elie', text: 'Old?', quickReplies: ['Yes'] },
    { id: '2', kind: 'listings', items: [{ id: 'a', title: 'A' }], more: { refine: REFINE, remaining: 12 } },
    { id: '3', kind: 'elie', text: 'Want Kilimani instead?', quickReplies: ['Yes', 'No'] },
  ];
  const html = render(ElieThread, { entries, thinking: false, onRetry() {}, onQuickReply() {}, onShowMore() {} });
  assert.equal((html.match(/class="elie-quick-replies"/g) || []).length, 1);
  assert.match(html, /<div class="elie-quick-replies"><button type="button">Yes<\/button><button type="button">No<\/button><\/div>/);
  assert.match(html, /<div class="elie-more"><button type="button">Show 8 more<\/button><\/div>/);
  const asking = render(ElieThread, { entries: elie.elieResponseEntries(ASKED), thinking: false, onRetry() {} });
  assert.equal((asking.match(/Where in Nairobi\?/g) || []).length, 1, 'asked once, in Elie\'s message');
});

test('the page shows the open question in the composer\'s place', () => {
  const page = read('pages', 'chats.tsx');
  assert.match(page, /const openQuestion = isElie && !elie\.thinking && lastElieEntry && lastElieEntry\.kind === 'question' \? lastElieEntry : null;/);
  assert.match(page, /hidden=\{participantDeactivated \|\| Boolean\(elieQuestion\)\}/);
  assert.match(page, /onChoose=\{\(option\) => \{ void elie\.answer\(elieQuestion, \{ option \}\); \}\}/);
  assert.match(page, /onType=\{\(\) => \{ if \(openQuestion\) setElieTypingFor\(openQuestion\.id\); \}\}/);
  assert.match(page, /onQuickReply=\{\(text\) => \{ void elie\.send\(text\); \}\} onShowMore=\{\(entry\) => \{ void elie\.showMore\(entry\); \}\}/);
  assert.match(read('public', 'js', 'chats.css'), /@media \(prefers-reduced-motion:reduce\)\{ \.elie-question-dock\{ animation:none; \} \}/);
});
