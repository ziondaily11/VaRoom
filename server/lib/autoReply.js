'use strict';

// Elie auto-replies: Away mode and the host's @reply command.
//
// Express owns every chat message write because only it holds the message
// encryption key. The chatbot service (CHATBOT_API_URL) only writes the reply
// text, through an internal endpoint guarded by CHATBOT_INTERNAL_API_KEY.

const crypto = require('crypto');
const supabaseAdmin = require('./supabaseClient');
const { notifyNewMessage } = require('./chatNotifications');
const { hostAwayNow } = require('./businessHours');
const { accountCanCreateActivity } = require('./accountAccess');
const { encryptMessage, decryptMessage } = require('./messageEncryptionService');

const HISTORY_LIMIT = 30;
// The chatbot service sleeps when idle; these allow for its cold start plus
// its own 30 s reply budget.
const AWAY_TIMEOUT_MS = 90_000;
const COMMAND_TIMEOUT_MS = 60_000;
// At most one away-mode reply per conversation per cooldown; guest messages
// sent meanwhile are answered together when it ends.
const COOLDOWN_MS = 2 * 60_000;
const HOURLY_CAP = 10;

const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,ciphertext,iv,key_version,created_at,read_at,message_type,attachment_id,listing_id,reply_to_message_id,deleted_at,pinned_at,is_auto_reply';
const LISTING_COLUMNS = 'id,title,location_text,category,listing_photos(storage_path)';

class AutoReplyError extends Error {
  constructor(message, { stage, status = 503 } = {}) {
    super(message);
    this.stage = stage;
    this.status = status;
  }
}

function chatbotApiUrl() {
  return (process.env.CHATBOT_API_URL || 'https://elie1-0.onrender.com').replace(/\/$/, '');
}

function awayRepliesEnabled() {
  return String(process.env.ELIE_AUTO_REPLY_ENABLED || 'true').toLowerCase() !== 'false';
}

function newCorrelationId() {
  return `AR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function log(level, event, details) {
  console[level](`Elie auto-reply ${event}:`, details);
}

/** The conversation's latest messages, oldest first, with decrypted text. */
async function loadHistory(conversationId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new AutoReplyError('Unable to load the conversation', { stage: 'history' });
  return (data || []).reverse().map((row) => {
    let text = '';
    try {
      text = decryptMessage(row.ciphertext, row.iv, row.key_version);
    } catch {
      text = '';
    }
    return { ...row, text: text.trim() };
  });
}

/**
 * Guest messages still waiting for an answer. `answeredUpTo` is the newest
 * guest message an earlier reply in this run covered: guest messages sent
 * while that reply was being written are saved before it, so its position
 * alone would wrongly mark them answered.
 */
function unansweredGuestMessages(history, conversation, answeredUpTo) {
  let start = 0;
  history.forEach((row, index) => {
    if (row.sender_id === conversation.host_id && (!answeredUpTo || !row.is_auto_reply)) start = index + 1;
  });
  return history.slice(start).filter((row) => row.sender_id === conversation.client_id
    && row.message_type === 'text'
    && row.text
    && (!answeredUpTo || row.created_at > answeredUpTo));
}

/**
 * The listing the guest is asking about: the one their latest question was
 * sent about ("Chat" on a listing), else the listing the conversation began with.
 */
function enquiryListingId(history, conversation) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const row = history[index];
    if (row.sender_id === conversation.client_id && row.message_type === 'text' && row.listing_id) return row.listing_id;
  }
  return conversation.listing_id || null;
}

function historyForPrompt(history, conversation) {
  return history
    .filter((row) => row.text)
    .map((row) => ({ speaker: row.sender_id === conversation.host_id ? 'host' : 'guest', text: row.text }));
}

async function requestGeneration({ conversation, trigger, guestMessage, guestEnquiry, history, correlationId, timeoutMs }) {
  const key = process.env.CHATBOT_INTERNAL_API_KEY;
  if (!key) throw new AutoReplyError('CHATBOT_INTERNAL_API_KEY is not configured', { stage: 'config' });
  let response;
  try {
    response = await fetch(`${chatbotApiUrl()}/internal/reply/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Elie-Internal-Key': key,
        'X-Correlation-ID': correlationId,
      },
      body: JSON.stringify({
        conversation_id: conversation.id,
        host_id: conversation.host_id,
        listing_id: enquiryListingId(history, conversation),
        trigger,
        guest_message: guestMessage,
        guest_enquiry: guestEnquiry,
        history: historyForPrompt(history, conversation),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new AutoReplyError(timedOut ? 'The chatbot service timed out' : 'The chatbot service is unreachable', { stage: 'generate' });
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.reply !== 'string' || !body.reply.trim()) {
    throw new AutoReplyError(`The chatbot service failed (${response.status})`, { stage: 'generate' });
  }
  return {
    reply: body.reply.trim().slice(0, 1000),
    alternativeListingIds: Array.isArray(body.alternative_listing_ids)
      ? body.alternative_listing_ids.filter((id) => typeof id === 'string').slice(0, 3)
      : [],
  };
}

async function insertHostMessage(conversation, text, { messageType = 'text', listingId = null } = {}) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: conversation.host_id,
      ...encryptMessage(text),
      message_type: messageType,
      listing_id: listingId,
      is_auto_reply: true,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    throw new AutoReplyError('Unable to save the reply', { stage: 'persist' });
  }
  const { ciphertext, iv, key_version: keyVersion, ...message } = data;
  return { ...message, body: text, attachment: null, listing: null, reply_to_message: null };
}

/**
 * Saves the reply (and any listings Elie suggested) as the host's messages,
 * then notifies the guest. Returns the messages in the chat API's shape.
 */
async function persistReply(conversation, { reply, alternativeListingIds }, correlationId) {
  const replyMessage = await insertHostMessage(conversation, reply);
  const messages = [replyMessage];

  if (alternativeListingIds.length) {
    // Only the host's own listings may be shared on their behalf.
    const { data: listings, error } = await supabaseAdmin
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('host_id', conversation.host_id)
      .in('id', alternativeListingIds);
    if (error) {
      log('warn', 'listing lookup failed', { conversationId: conversation.id, correlationId });
    } else {
      for (const listingId of alternativeListingIds) {
        const listing = (listings || []).find((row) => row.id === listingId);
        if (!listing) continue;
        try {
          const message = await insertHostMessage(conversation, `Shared listing: ${listing.title || 'VaRoom listing'}`, {
            messageType: 'listing',
            listingId,
          });
          messages.push({ ...message, listing });
        } catch {
          log('warn', 'listing message failed', { conversationId: conversation.id, correlationId });
        }
      }
    }
  }

  await notifyGuest(conversation, replyMessage, correlationId);
  return messages;
}

/** Tells the guest about an auto-reply (unless they turned message notifications off). */
async function notifyGuest(conversation, message, correlationId) {
  try {
    const { data: hostProfile } = await supabaseAdmin.from('profiles').select('full_name').eq('id', conversation.host_id).maybeSingle();
    await notifyNewMessage({
      recipientUserId: conversation.client_id,
      actorUserId: conversation.host_id,
      message: `${(hostProfile && hostProfile.full_name) || 'Your host'} sent you a message.`,
      relatedEntityType: 'conversation',
      relatedEntityId: conversation.id,
      metadata: {
        conversation_id: conversation.id,
        sender_id: conversation.host_id,
        message_id: message.id,
        listing_id: conversation.listing_id || null,
        auto_reply: true,
      },
      eventKey: `message:${conversation.id}:${message.id}`,
    });
  } catch (error) {
    log('warn', 'notification failed', { conversationId: conversation.id, correlationId, code: error.code });
  }
}

// The host's away message (Chat Settings), shown there in quotes; sent without them.
const DEFAULT_AWAY_MESSAGE = 'I’m currently away and will respond as soon as I can.';

function awayMessageText(value) {
  const text = String(value || '').trim().replace(/^[“"](.*)[”"]$/s, '$1').trim();
  return text || DEFAULT_AWAY_MESSAGE;
}

/** The away message went out since the host last wrote themselves (once per away spell). */
function awayMessageSent(history, conversation, text) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const row = history[index];
    if (row.sender_id !== conversation.host_id) continue;
    if (!row.is_auto_reply) return false;
    if (row.message_type === 'text' && row.text === text) return true;
  }
  return false;
}

/** The host typed @reply: answer the guest's messages now. */
async function replyOnCommand(conversation, { correlationId = newCorrelationId() } = {}) {
  const history = await loadHistory(conversation.id);
  const guestMessages = history.filter((row) => row.sender_id === conversation.client_id && row.message_type === 'text' && row.text);
  if (!guestMessages.length) {
    log('info', 'skipped', { conversationId: conversation.id, correlationId, trigger: 'command', reason: 'no guest enquiry' });
    return { reply: 'There is no guest enquiry to reply to yet.', skipped: true, message: null, messages: [] };
  }
  const generated = await requestGeneration({
    conversation,
    trigger: 'command',
    guestMessage: guestMessages[guestMessages.length - 1].text,
    guestEnquiry: guestMessages.map((row) => row.text).join('\n'),
    history,
    correlationId,
    timeoutMs: COMMAND_TIMEOUT_MS,
  });
  log('info', 'generated', { conversationId: conversation.id, correlationId, trigger: 'command' });
  const messages = await persistReply(conversation, generated, correlationId);
  log('info', 'persisted', { conversationId: conversation.id, correlationId, trigger: 'command', messages: messages.length });
  return { reply: generated.reply, skipped: false, message: messages[0], messages };
}

// Away mode runs in the background, one run per conversation at a time.
// `pending` records guest messages that arrive during a run; `timer` is a
// run scheduled for the end of the cooldown.
const awayState = new Map();

async function awayReplyOnce(conversation, state, correlationId) {
  const skip = (reason) => {
    log('info', 'skipped', { conversationId: conversation.id, correlationId, trigger: 'away', reason });
    return null;
  };

  const { data: hostProfile, error: profileError } = await supabaseAdmin
    .from('profiles').select('away_mode,away_message,away_schedule').eq('id', conversation.host_id).maybeSingle();
  if (profileError) throw new AutoReplyError('Unable to read the host profile', { stage: 'profile' });
  // Away mode on, or outside the host's business hours.
  if (!hostAwayNow(hostProfile)) return skip('host not away');
  if (!(await accountCanCreateActivity(conversation.host_id))) return skip('host suspended');

  const history = await loadHistory(conversation.id);
  const unanswered = unansweredGuestMessages(history, conversation, state.answeredUpTo);
  if (!unanswered.length) return skip('already answered');

  const lastAutoReply = [...history].reverse().find((row) => row.sender_id === conversation.host_id && row.is_auto_reply);
  if (lastAutoReply) {
    const wait = new Date(lastAutoReply.created_at).getTime() + COOLDOWN_MS - Date.now();
    if (wait > 0) return { retryInMs: wait };
  }

  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent, error: capError } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversation.id)
    .eq('sender_id', conversation.host_id)
    .eq('is_auto_reply', true)
    .eq('message_type', 'text')
    .gte('created_at', hourAgo)
    .limit(HOURLY_CAP);
  if (capError) throw new AutoReplyError('Unable to check the reply limit', { stage: 'cap' });
  if ((recent || []).length >= HOURLY_CAP) return skip('hourly limit reached');

  // The host's own away message goes out first, at once, even while Elie is
  // asleep or switched off; Elie's answer follows.
  const awayText = awayMessageText(hostProfile.away_message);
  if (!awayMessageSent(history, conversation, awayText)) {
    const awayMessage = await insertHostMessage(conversation, awayText);
    log('info', 'away message sent', { conversationId: conversation.id, correlationId });
    await notifyGuest(conversation, awayMessage, correlationId);
  }
  if (!awayRepliesEnabled()) {
    state.answeredUpTo = unanswered[unanswered.length - 1].created_at;
    return skip('elie disabled');
  }

  const generated = await requestGeneration({
    conversation,
    trigger: 'away',
    guestMessage: unanswered.map((row) => row.text).join('\n'),
    guestEnquiry: unanswered.map((row) => row.text).join('\n'),
    history,
    correlationId,
    timeoutMs: AWAY_TIMEOUT_MS,
  });
  log('info', 'generated', { conversationId: conversation.id, correlationId, trigger: 'away' });
  const messages = await persistReply(conversation, generated, correlationId);
  state.answeredUpTo = unanswered[unanswered.length - 1].created_at;
  log('info', 'persisted', { conversationId: conversation.id, correlationId, trigger: 'away', messages: messages.length });
  return null;
}

async function runAway(conversation, state) {
  let followUps = 0;
  do {
    state.pending = false;
    const correlationId = newCorrelationId();
    try {
      const outcome = await awayReplyOnce(conversation, state, correlationId);
      if (outcome && outcome.retryInMs) {
        state.timer = setTimeout(() => {
          state.timer = null;
          state.running = true;
          runAway(conversation, state).catch(() => awayState.delete(conversation.id));
        }, outcome.retryInMs);
        if (state.timer.unref) state.timer.unref();
        state.running = false;
        return;
      }
    } catch (error) {
      log('error', 'failed', {
        conversationId: conversation.id,
        correlationId,
        trigger: 'away',
        stage: error.stage || 'unknown',
        error: error.message,
      });
    }
    followUps += 1;
  } while (state.pending && followUps <= 1);
  state.running = false;
  if (!state.timer) awayState.delete(conversation.id);
}

/**
 * A guest sent a text message. Replies in the background when the host is
 * away; never throws and never delays the guest's request.
 */
function handleGuestMessage(conversation) {
  // With Elie switched off the host's away message is still sent.
  let state = awayState.get(conversation.id);
  if (state && (state.running || state.timer)) {
    // A run in progress picks this message up; a scheduled run will see it.
    state.pending = true;
    return Promise.resolve();
  }
  state = { running: true, pending: false, timer: null, answeredUpTo: null };
  awayState.set(conversation.id, state);
  return runAway(conversation, state).catch((error) => {
    awayState.delete(conversation.id);
    log('error', 'failed', { conversationId: conversation.id, trigger: 'away', stage: 'unknown', error: error.message });
  });
}

module.exports = {
  AutoReplyError,
  enquiryListingId,
  DEFAULT_AWAY_MESSAGE,
  awayMessageText,
  awayMessageSent,
  COOLDOWN_MS,
  HOURLY_CAP,
  handleGuestMessage,
  replyOnCommand,
  _awayState: awayState,
};
