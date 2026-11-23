import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckoutWindow } from '../billing/CheckoutWindow';
import { getSupabaseClient } from '../../lib/supabase/client';
import {
  VCOIN_NEWS_COST,
  VCOIN_SEARCH_COST,
  checkVcoinPayment,
  fetchVcoins,
  startVcoinCheckout,
  vcoinFill,
  vcoinLevel,
  type VcoinPack,
  type VcoinWallet,
} from '../../lib/chat/vcoins';

// The V-Coin meter beside Elie's send button: a ring coloured by what is
// left (green, yellow, red) with the balance. It opens the top-up packs; a
// pack is paid in VaRoom's checkout window (M-Pesa or card). Paystack's own
// page (the card fallback) returns to /chats?c=elie&vcoins=return&reference=…

const RETURN_CHECKS = 10;
const RETURN_POLL_MS = 3000;

async function accessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  return client ? (await client.auth.getSession()).data.session?.access_token ?? null : null;
}

export default function VCoinMeter({ wallet, onWallet, openSignal }: {
  wallet: VcoinWallet | null;
  onWallet: (wallet: VcoinWallet) => void;
  /** Changes when Elie asks for a top-up: the packs open. */
  openSignal: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState<VcoinPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<VcoinPack | null>(null);
  const anchor = useRef<HTMLDivElement>(null);

  const loadPacks = useCallback(async () => {
    setError(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Please log in again to buy V-Coins.');
      const result = await fetchVcoins(token);
      setPacks(result.packs);
      onWallet({ balance: result.balance, included: result.included });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load V-Coin packs.');
    }
  }, [onWallet]);

  const show = useCallback(() => { setOpen(true); if (!packs) void loadPacks(); }, [packs, loadPacks]);

  useEffect(() => { if (openSignal > 0) show(); }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => { if (!anchor.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Back from Paystack's own page: confirm the payment, then drop it from the URL.
  const returned = router.query.vcoins === 'return' && typeof router.query.reference === 'string' ? router.query.reference : null;
  useEffect(() => {
    if (!returned) return undefined;
    let cancelled = false;
    void (async () => {
      const token = await accessToken();
      for (let tries = 0; token && tries < RETURN_CHECKS && !cancelled; tries += 1) {
        try {
          const result = await checkVcoinPayment(token, returned, false);
          if (cancelled) return;
          onWallet(result.wallet);
          if (result.state !== 'pending') break;
        } catch { /* Checked again below. */ }
        await new Promise((resolve) => setTimeout(resolve, RETURN_POLL_MS));
      }
      if (cancelled) return;
      const { vcoins: _vcoins, reference: _reference, ...query } = router.query;
      void router.replace({ pathname: '/chats', query }, undefined, { shallow: true });
    })();
    return () => { cancelled = true; };
  }, [returned]); // eslint-disable-line react-hooks/exhaustive-deps

  const level = wallet ? vcoinLevel(wallet) : 'green';
  const fill = wallet ? vcoinFill(wallet) : 0;
  const label = !wallet ? 'V-Coins' : wallet.included ? 'Elie is included in your plan' : `${wallet.balance} V-Coins left`;
  const circumference = 2 * Math.PI * 8;

  return (
    <div className="vcoin-meter" ref={anchor} data-level={level}>
      <style dangerouslySetInnerHTML={{ __html: VCOIN_STYLES }} />
      <button type="button" className="vcoin-meter-button" aria-label={`${label}. Top up`} title={label} aria-expanded={open} aria-haspopup="dialog"
        onMouseDown={(event) => event.preventDefault()} onClick={() => (open ? setOpen(false) : show())}>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" className="vcoin-track" />
          <circle cx="10" cy="10" r="8" className="vcoin-fill" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - fill)} />
        </svg>
        <span className="vcoin-count">{wallet ? (wallet.included ? '∞' : wallet.balance) : '–'}</span>
      </button>

      {open && (
        <div className="vcoin-sheet" role="dialog" aria-label="Top up V-Coins">
          <p className="vcoin-sheet-title">V-Coins</p>
          <p className="vcoin-sheet-text">
            {wallet?.included
              ? 'Your plan includes Elie, so searches use no coins.'
              : `A search with results uses ${VCOIN_SEARCH_COST} coins, a news answer ${VCOIN_NEWS_COST}. Chat and searches with no results are free.`}
          </p>
          {error && <p className="vcoin-sheet-error" role="alert">{error}</p>}
          {!packs && !error && <p className="vcoin-sheet-text">Loading packs…</p>}
          {packs && (
            <ul className="vcoin-packs">
              {packs.map((pack) => (
                <li key={pack.id}>
                  <button type="button" onClick={() => { setOpen(false); setBuying(pack); }}>
                    <span className="vcoin-pack-coins">{pack.coins.toLocaleString()} coins</span>
                    <span className="vcoin-pack-price">KSh {pack.price_kes.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {buying && (
        <CheckoutWindow
          open
          item={{
            name: `${buying.coins.toLocaleString()} V-Coins`,
            priceKes: buying.price_kes,
            per: 'one-off',
            lines: [`About ${Math.floor(buying.coins / VCOIN_SEARCH_COST)} Elie searches`, 'Coins never expire', 'Charged only when Elie finds results'],
          }}
          allowMpesa
          paidText={`${buying.coins.toLocaleString()} V-Coins were added to your balance.`}
          start={async (payment) => {
            const token = await accessToken();
            if (!token) throw new Error('Please log in again to buy V-Coins.');
            return startVcoinCheckout(token, buying.id, payment);
          }}
          confirm={async (reference, waitingForPin) => {
            const token = await accessToken();
            if (!token) throw new Error('Please log in again.');
            const result = await checkVcoinPayment(token, reference, waitingForPin);
            onWallet(result.wallet);
            return result.state;
          }}
          onPaid={() => setBuying(null)}
          onClose={() => setBuying(null)}
        />
      )}
    </div>
  );
}

// Scoped under the composer so the toolbar's own button rules (32px squares) do not apply.
const VCOIN_STYLES = `
  .vcoin-meter{ position:relative; display:inline-flex; align-items:center; --vcoin:#1e9e5a; }
  .vcoin-meter[data-level="yellow"]{ --vcoin:#d9a400; }
  .vcoin-meter[data-level="red"]{ --vcoin:#d8343f; }
  .chat-input-area .attach-icons .vcoin-meter-button{ display:inline-flex; align-items:center; gap:.3rem; width:auto; height:32px; padding:0 .55rem 0 .4rem;
    border:1px solid currentColor; border-color:rgba(127,127,127,.35); border-radius:999px; background:transparent; color:inherit;
    font:inherit; font-size:.78rem; font-weight:600; cursor:pointer; }
  .chat-input-area .attach-icons .vcoin-meter-button:hover{ background:rgba(127,127,127,.14); }
  .vcoin-meter-button svg{ width:18px; height:18px; transform:rotate(-90deg); }
  .vcoin-track{ fill:none; stroke:rgba(127,127,127,.3); stroke-width:3; }
  .vcoin-fill{ fill:none; stroke:var(--vcoin); stroke-width:3; stroke-linecap:round; transition:stroke-dashoffset 300ms ease-out, stroke 300ms ease-out; }
  .vcoin-count{ font-variant-numeric:tabular-nums; }
  .vcoin-sheet{ position:absolute; right:0; bottom:calc(100% + 10px); z-index:50; width:min(290px, calc(100vw - 32px)); padding:.9rem; border-radius:16px;
    border:1px solid #e2e5ea; background:#fff; color:#1f2937; box-shadow:0 18px 50px -20px rgba(0,0,0,.45); text-align:left; }
  [data-theme="dark"] .vcoin-sheet{ border-color:rgba(255,255,255,.12); background:#18181b; color:#f4f4f5; }
  .vcoin-sheet-title{ margin:0 0 .3rem; font-weight:700; }
  .vcoin-sheet-text{ margin:0 0 .6rem; font-size:.8rem; line-height:1.45; opacity:.8; }
  .vcoin-sheet-error{ margin:0 0 .6rem; font-size:.8rem; color:#d8343f; }
  .vcoin-packs{ display:grid; gap:.4rem; margin:0; padding:0; list-style:none; }
  .chat-input-area .attach-icons .vcoin-packs button{ display:flex; width:100%; height:auto; justify-content:space-between; align-items:center; padding:.6rem .75rem;
    border:1px solid rgba(127,127,127,.3); border-radius:12px; background:transparent; color:inherit; font:inherit; font-size:.85rem; cursor:pointer; }
  .chat-input-area .attach-icons .vcoin-packs button:hover{ border-color:#C41E3A; background:transparent; color:inherit; }
  .vcoin-pack-coins{ font-weight:600; }
  .vcoin-pack-price{ opacity:.75; }
  /* Phones: the meter takes its own cell between the text and the send button. */
  @media (max-width:760px){
    .chat-input-area.is-elie.is-elie{ grid-template-columns:minmax(0,1fr) auto 52px; }
    .chat-input-area.is-elie .vcoin-meter{ grid-column:2; grid-row:3; align-self:center; }
    .chat-input-area.is-elie.is-elie .composer-mobile-send-item,
    .chat-input-area.is-elie.is-elie .attach-icons .send-message{ grid-column:3; }
    .chat-input-area .attach-icons .vcoin-meter-button{ height:36px; }
  }
`;
