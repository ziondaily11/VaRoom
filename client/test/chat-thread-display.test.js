const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/loadTs');

const root = path.join(__dirname, '..');

function loadMedia({ cached = {}, fetchResult } = {}) {
  const calls = { getMediaUrl: [], fetchAndCacheMedia: [] };
  const chatCache = {
    getMediaUrl: async (key) => { calls.getMediaUrl.push(key); return cached[key] ? { url: cached[key] } : null; },
    fetchAndCacheMedia: async (key, url, options) => {
      calls.fetchAndCacheMedia.push([key, url, options && options.type]);
      if (fetchResult instanceof Error) throw fetchResult;
      return fetchResult || `blob:${key}`;
    },
  };
  return { media: loadTs(path.join(root, 'lib', 'chat', 'chatMedia.ts'), { mocks: { '../chatCache': chatCache } }), calls };
}

test('attachments come from the chat media cache first, without an API call', async () => {
  const { media } = loadMedia({ cached: { 'attachment:a1': 'blob:cached' } });
  let apiCalls = 0;
  assert.equal(await media.attachmentUrl('a1', async () => { apiCalls += 1; return {}; }), 'blob:cached');
  assert.equal(apiCalls, 0);
});

test('an uncached attachment: one download call shared by concurrent callers; the signed URL shows at once and is cached in the background', async () => {
  const { media, calls } = loadMedia();
  const urls = [];
  const api = async (url) => { urls.push(url); return { url: 'https://r2.example/signed', expiresAt: new Date(Date.now() + 3600e3).toISOString() }; };
  const [first, second] = await Promise.all([media.attachmentUrl('a 2', api), media.attachmentUrl('a 2', api)]);
  assert.equal(first, 'https://r2.example/signed');
  assert.equal(second, first);
  assert.deepEqual(urls, ['/api/chat/attachments/a%202/download']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.fetchAndCacheMedia, [['attachment:a 2', 'https://r2.example/signed', 'attachment']]);
  // Reopening within the signed URL's lifetime needs no request.
  assert.equal(await media.attachmentUrl('a 2', api), 'https://r2.example/signed');
  assert.equal(urls.length, 1);
});

test('signed URLs are not reused within 5 minutes of expiry', async () => {
  const { media } = loadMedia();
  let n = 0;
  const api = async () => ({ url: `https://r2.example/${++n}`, expiresAt: new Date(Date.now() + 4 * 60e3).toISOString() });
  assert.equal(await media.attachmentUrl('soon', api), 'https://r2.example/1');
  assert.equal(await media.attachmentUrl('soon', api), 'https://r2.example/2');
});

test('once storage refuses cross-origin reads, blob caching stops for the session', async () => {
  const { media, calls } = loadMedia({ fetchResult: 'https://r2.example/a' });
  await media.attachmentUrl('x1', async () => ({ url: 'https://r2.example/a' }));
  await new Promise((resolve) => setImmediate(resolve));
  await media.attachmentUrl('x2', async () => ({ url: 'https://r2.example/b' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.fetchAndCacheMedia.length, 1, 'the second attachment is not fetched as a blob');
  await assert.rejects(media.attachmentUrl('x3', async () => ({})), /Attachment unavailable/);
});

test('listing video: first video, playback URL and cached thumbnail; null without a video', async () => {
  const { media } = loadMedia();
  const api = async (url) => {
    if (url === '/api/properties/l1/media') return { media: [{ id: 'p', type: 'photo' }, { id: 'v1', type: 'video', thumbnailUrl: 'https://t/old' }] };
    if (url === '/api/media/v1/playback') return { url: 'https://stream/v1', thumbnailUrl: 'https://t/v1' };
    if (url === '/api/properties/l2/media') return { media: [{ id: 'p', type: 'photo' }] };
    throw new Error(`unexpected ${url}`);
  };
  assert.deepEqual(await media.listingVideo('l1', api), { videoId: 'v1', url: 'https://stream/v1', thumbnailUrl: 'https://t/v1' }, 'the remote thumbnail shows while it is cached in the background');
  assert.equal(await media.listingVideo('l2', api), null);
});

test('message ticks: sending, sent, delivered, read', () => {
  const { media } = loadMedia();
  const at = '2026-11-02T09:14:00Z';
  assert.equal(media.messageStatus({}, true), 'sending');
  assert.equal(media.messageStatus({ delivered_at: at, read_at: at }, true), 'sending', 'an upload in progress is still sending');
  assert.equal(media.messageStatus({}, false), 'sent');
  assert.equal(media.messageStatus({ delivered_at: at }, false), 'delivered');
  assert.equal(media.messageStatus({ delivered_at: at, read_at: at }, false), 'read');
  assert.equal(media.messageStatus({ read_at: at }, false), 'read', 'read implies delivered');
});

test("bubbles show the time on every message and ticks only on the user's own", () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
  assert.match(source, /status=\{isOut && !isDeleted && !optimistic\._failed \? messageStatus\(m, sending\) : null\}/);
  assert.match(source, /className="bubble bubble-text"/);
  assert.doesNotMatch(source, /Read \$\{|msg-sending/);
  const meta = fs.readFileSync(path.join(root, 'components', 'chat', 'MessageMeta.tsx'), 'utf8');
  for (const label of ["sending: 'Sending'", "sent: 'Sent'", "delivered: 'Delivered'", "read: 'Read'"]) assert.ok(meta.includes(label), label);
  const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
  assert.doesNotMatch(css, /same-sender \.msg-meta\{ display:none/);
  assert.match(css, /\.bubble-text > \.msg-meta\{ float:right;/);
  assert.match(css, /\.msg-row\.out \.bubble > \.msg-meta\{ --msg-read-tick:var\(--bubble-read-tick\); \}/, 'each theme sets a read colour that shows on its sent bubbles');
});

test('thread and inbox states match legacy', () => {
  const source = fs.readFileSync(path.join(root, 'pages', 'chats.tsx'), 'utf8');
  assert.match(source, /Your messages are encrypted and private\./);
  assert.match(source, /Unable to load messages\. Please check your connection\./);
  assert.match(source, /if \(!cached \|\| cached\.length === 0\) setMessagesError\(true\);/, 'error only when nothing cached could be shown');
  assert.match(source, /'No conversations yet', detail: 'When clients reach out, your conversations will appear here\.'/);
  assert.match(source, /'Start a conversation', detail: 'Chat with a host and your conversations will appear here\.'/);
  assert.match(source, /<h2>Select a conversation<\/h2><p>Choose a conversation from your inbox to view messages\.<\/p>/);
  assert.match(source, /className="inbox-skeleton" aria-hidden="true"/);
  assert.match(source, /className=\{`chat-skeleton-row \$\{side\}`\}/);
  assert.match(source, /Your VaRoom search assistant<\/div>/);
  assert.match(source, /<ListingCard listing=\{m\.listing\}/);
  assert.match(source, /<VoiceCard attachmentId=\{attachmentId\}/);
  assert.match(source, /<ImagePreview key=\{`[^`]*`\} items=\{selectedPhotoPreview\.items\} index=\{selectedPhotoPreview\.index\}/);
  assert.doesNotMatch(source, /function AuthedImage/, 'one media cache for chat attachments');
  const css = fs.readFileSync(path.join(root, 'public', 'js', 'chats.css'), 'utf8');
  assert.match(css, /\.chat-listing-card\{max-width:320px/);
  assert.match(css, /\.chat-image-preview\{position:fixed/);
});
