'use strict';

const crypto = require('crypto');

const PAYSTACK_API_URL = 'https://api.paystack.co';

function getConfig(env = process.env) {
  const mode = env.PAYSTACK_MODE || 'test';
  if (!['test', 'live'].includes(mode)) throw new Error('PAYSTACK_MODE must be test or live');
  const secretKey = env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured');
  const expectedPrefix = mode === 'live' ? 'sk_live_' : 'sk_test_';
  if (!secretKey.startsWith(expectedPrefix)) throw new Error(`PAYSTACK_SECRET_KEY does not match PAYSTACK_MODE=${mode}`);
  return { mode, secretKey, publicKey: env.PAYSTACK_PUBLIC_KEY || null, webhookSecret: env.PAYSTACK_WEBHOOK_SECRET || secretKey };
}

function generateReference() {
  return `varoom_${Date.now()}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || !signature || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)); } catch { return false; }
}

function createPaystackClient({ env = process.env, fetchImpl = global.fetch } = {}) {
  async function request(path, options = {}) {
    const { secretKey } = getConfig(env);
    if (typeof fetchImpl !== 'function') throw new Error('Global fetch is unavailable in this Node runtime');
    const response = await fetchImpl(`${PAYSTACK_API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.status) throw new Error(body.message || `Paystack request failed (${response.status})`);
    return body.data;
  }
  return {
    getConfig: () => getConfig(env),
    generateReference,
    verifyWebhookSignature: (rawBody, signature) => verifyWebhookSignature(rawBody, signature, getConfig(env).webhookSecret),
    initializeTransaction: (payload) => request('/transaction/initialize', { method: 'POST', body: JSON.stringify(payload) }),
    verifyTransaction: (reference) => request(`/transaction/verify/${encodeURIComponent(reference)}`),
    fetchSubscription: (subscriptionCode) => request(`/subscription/${encodeURIComponent(subscriptionCode)}`),
    disableSubscription: ({ code, token }) => request('/subscription/disable', { method: 'POST', body: JSON.stringify({ code, token }) }),
  };
}

module.exports = { PAYSTACK_API_URL, getConfig, generateReference, verifyWebhookSignature, createPaystackClient };
