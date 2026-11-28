'use strict';

const supabaseDefault = require('./supabaseClient');

// Host Elie (migration 20261125_000081): Elie's away answers, @reply, reply
// drafts and "Write with Elie" are for hosts whose plan includes Elie, and
// each uses one of their monthly Elie actions. The host's own away message
// is free and not counted.

const ELIE_HOST_ACTION_LIMIT = 300;
const PLANS_PATH = '/pricing';

const DENIED = {
  plan: 'Elie’s host tools come with plans that include Elie: Airbnb Business, Hotel Plus and Venue Premium.',
  limit: `You’ve used your ${ELIE_HOST_ACTION_LIMIT} Elie actions this month. They renew on the 1st.`,
};

class ElieHostDenied extends Error {
  constructor(reason, usage) {
    super(DENIED[reason] || DENIED.plan);
    this.reason = reason;
    this.usage = usage;
    this.status = reason === 'limit' ? 429 : 403;
  }

  /** The JSON a route answers with. */
  body() {
    return { error: this.message, elie: { reason: this.reason, used: this.usage.used, limit: this.usage.limit, plansUrl: PLANS_PATH } };
  }
}

class ElieHostUnavailable extends Error {}

/** A failed call to the chatbot service; `stage` is config or generate. */
class ChatbotError extends Error {
  constructor(message, stage) {
    super(message);
    this.stage = stage;
  }
}

function chatbotApiUrl() {
  return (process.env.CHATBOT_API_URL || 'https://elie1-0.onrender.com').replace(/\/$/, '');
}

/** POSTs to one of the chatbot's internal endpoints (it only writes text). */
async function postToChatbot(path, payload, { correlationId, timeoutMs }) {
  const key = process.env.CHATBOT_INTERNAL_API_KEY;
  if (!key) throw new ChatbotError('CHATBOT_INTERNAL_API_KEY is not configured', 'config');
  let response;
  try {
    response = await fetch(`${chatbotApiUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Elie-Internal-Key': key, 'X-Correlation-ID': correlationId },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ChatbotError(timedOut ? 'The chatbot service timed out' : 'The chatbot service is unreachable', 'generate');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ChatbotError(`The chatbot service failed (${response.status})`, 'generate');
  return body;
}

/** Reserves one Elie action for the host, or throws ElieHostDenied. */
async function useHostAction(hostId, kind, supabaseAdmin = supabaseDefault) {
  const { data, error } = await supabaseAdmin.rpc('elie_use_host_action', { p_host_id: hostId, p_kind: kind, p_limit: ELIE_HOST_ACTION_LIMIT });
  if (error || !data) throw new ElieHostUnavailable('Unable to check Elie actions');
  if (!data.allowed) throw new ElieHostDenied(data.reason, { used: Number(data.used) || 0, limit: Number(data.limit) || ELIE_HOST_ACTION_LIMIT });
  return { actionId: data.action_id, used: Number(data.used), limit: Number(data.limit) };
}

/** Gives an action back when Elie could not complete it (best effort). */
async function releaseHostAction(hostId, actionId, supabaseAdmin = supabaseDefault) {
  try {
    await supabaseAdmin.rpc('elie_release_host_action', { p_action_id: actionId, p_host_id: hostId });
  } catch {
    // The action stays counted; the next month resets it.
  }
}

/** Runs `work` on one Elie action; the action is given back if `work` fails. */
async function withHostAction(hostId, kind, work, supabaseAdmin = supabaseDefault) {
  const action = await useHostAction(hostId, kind, supabaseAdmin);
  try {
    return await work(action);
  } catch (error) {
    await releaseHostAction(hostId, action.actionId, supabaseAdmin);
    throw error;
  }
}

/** Whether the host's plan includes Elie, and the actions used this month. */
async function hostElieUsage(hostId, supabaseAdmin = supabaseDefault) {
  const { data, error } = await supabaseAdmin.rpc('elie_host_usage', { p_host_id: hostId, p_limit: ELIE_HOST_ACTION_LIMIT });
  if (error || !data) throw new ElieHostUnavailable('Unable to load Elie actions');
  return { included: data.included === true, used: Number(data.used) || 0, limit: Number(data.limit) || ELIE_HOST_ACTION_LIMIT, plansUrl: PLANS_PATH };
}

module.exports = {
  ELIE_HOST_ACTION_LIMIT,
  chatbotApiUrl,
  PLANS_PATH,
  ElieHostDenied,
  ElieHostUnavailable,
  ChatbotError,
  postToChatbot,
  useHostAction,
  releaseHostAction,
  withHostAction,
  hostElieUsage,
};
