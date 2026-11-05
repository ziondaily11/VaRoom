// Renders pages/chats.tsx (and the Chats components) on the server for
// tests: Next's router and head, the Supabase client and the signed-in
// account are faked. Effects do not run, so this is the first paint: the
// signed-in client before the account, the inbox or the thread have loaded.
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadTs } = require('./loadTs');

const root = path.join(__dirname, '..', '..');

function fakeRouter(overrides = {}) {
  return { query: {}, asPath: '/chats', pathname: '/chats', push: async () => true, replace: async () => true, ...overrides };
}

function chatMocks({ router = fakeRouter(), user = null, profile = null, counts = null, supabase = null, mocks = {} } = {}) {
  const nextRouter = { useRouter: () => router, default: router };
  const client = { getSupabaseClient: () => supabase };
  const auth = { useAuth: () => ({ user, profile }) };
  const all = {
    'next/head': { __esModule: true, default: ({ children }) => React.createElement('head', null, children) },
    'next/router': nextRouter,
    '../lib/supabase/client': client,
    '../../lib/supabase/client': client,
    '../lib/auth/AuthProvider': auth,
    '../../lib/auth/AuthProvider': auth,
    ...mocks,
  };
  if (counts) all['../lib/counts/countsStore'] = { useCounts: () => counts };
  return all;
}

/** A Chats module or component, loaded with the fakes above. */
function loadChats(file, options) {
  return loadTs(path.join(root, ...file.split('/')), { mocks: chatMocks(options) });
}

/** Server rendering, without React's warning that layout effects do not run there (bot avatars use one). */
function render(component, props) {
  const error = console.error;
  console.error = (message, ...rest) => {
    if (typeof message === 'string' && message.includes('useLayoutEffect does nothing on the server')) return;
    error(message, ...rest);
  };
  try {
    return renderToStaticMarkup(React.createElement(component, props));
  } finally {
    console.error = error;
  }
}

/** The Chats page's first paint (`initialConversationId` opens a conversation, 'elie' for Elie). */
function renderChatsPage(props = {}, options) {
  const page = loadChats('pages/chats.tsx', options);
  return { html: render(page.default, props), page };
}

/** The part of `html` from the first `start` to the next `end` after it. */
function section(html, start, end) {
  const from = html.indexOf(start);
  if (from < 0) return '';
  const to = html.indexOf(end, from + start.length);
  return html.slice(from, to < 0 ? undefined : to + end.length);
}

module.exports = { root, fakeRouter, loadChats, renderChatsPage, render, section };
