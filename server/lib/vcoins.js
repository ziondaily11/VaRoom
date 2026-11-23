'use strict';

// V-Coins: the credits that pay for Elie search (migration 20261123_000079).
// The server owns the packs and prices; the browser only names a pack.
// Elie charges after it has answered (chatbot/main.py): a search with
// results 10, a news answer 15; chat, no results and errors are free.
const VCOIN_PACKS = Object.freeze({
  starter: Object.freeze({ id: 'starter', coins: 100, amount_minor: 10000 }),
  plus: Object.freeze({ id: 'plus', coins: 275, amount_minor: 25000 }),
  pro: Object.freeze({ id: 'pro', coins: 600, amount_minor: 50000 }),
  max: Object.freeze({ id: 'max', coins: 1300, amount_minor: 100000 }),
});

/** { balance, included }: included when the user's plan includes Elie. Grants the welcome coins once. */
async function vcoinWallet(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin.rpc('elie_vcoin_wallet', { p_user_id: userId });
  if (error || !data) throw new Error('Unable to load V-Coins');
  return { balance: Number(data.balance) || 0, included: data.included === true };
}

/** Adds a verified purchase's coins. One ledger row per payment, so retries add nothing. */
async function creditVcoinPurchase(supabaseAdmin, payment) {
  const { error } = await supabaseAdmin.from('elie_ledger').insert({
    user_id: payment.host_id, delta: payment.vcoins, kind: 'purchase', payment_id: payment.id,
  });
  if (error && error.code !== '23505') throw new Error('Unable to credit V-Coins');
  return !error;
}

module.exports = { VCOIN_PACKS, vcoinWallet, creditVcoinPurchase };
