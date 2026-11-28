// Styles for /marketplace, scoped under .marketplace-page: nothing here sets
// :root, html or body for the rest of the app (the few rules that reach the
// shell name the page with :has(), so they apply only while it is open). The
// look follows Settings and Bookings: soft paper, a title, one rounded search
// box, the shared segmented control for categories, and the listing cards
// (listingCardStyles, shared with the profile pages, unchanged).
//
// Laptops (from 861 px): the header stays put and the listings scroll in
// .mkt-body. Phones: the page scrolls, and the header (search and
// categories) sticks to the top.
//
// Motion (animation.md): the category pill slides (SegmentedTabs, §8.1);
// cards rise in once, 30 ms apart, on a first load from the network (a list
// shown from memory appears at once); the clear button fades in; buttons
// press to .97. Reduced motion turns it off.

import { listingCardStyles } from '../listings/listingCardStyles';
import { SEGMENTED_TABS_STYLES } from '../ui/SegmentedTabs';

export const MARKETPLACE_STYLES = `
  .marketplace-page{
    --red:#C41E3A; --red-deep:#8F1229; --paper:var(--va-light); --white:var(--va-light); --card:var(--va-light); --ink:#24211E; --muted:#6B665E;
    --line:rgba(26,18,16,.1); --line-strong:rgba(26,18,16,.18); --soft:#EFEDE8; --nav-active-bg:#E9E7E2;
    --font-display:-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; --font-body:var(--font-display); --font-brand:'Fraunces', Georgia, serif;
    --mkt-header-h:0px;
  }
  html[data-theme="dark"] .marketplace-page{
    --paper:#000000; --white:#000000; --card:#141414; --ink:#F2F2F2; --muted:#9A9AA0;
    --line:rgba(255,255,255,.09); --line-strong:rgba(255,255,255,.18); --soft:#1D1D1F; --nav-active-bg:rgba(255,255,255,.14);
  }

  .marketplace-page, .marketplace-page *, .marketplace-page *::before, .marketplace-page *::after{ box-sizing:border-box; }
  .marketplace-page :where(h1, h2, p){ margin:0; }
  /* The cards' sizes assume no default margins or padding (the page reset they were built with). */
  .marketplace-page :where(.grid, .grid *){ margin:0; padding:0; }
  .marketplace-page{ min-height:100vh; min-height:100dvh; background:var(--paper); color:var(--ink); font-family:var(--font-body); -webkit-font-smoothing:antialiased; }
  .marketplace-page a{ color:inherit; text-decoration:none; }
  .marketplace-page button, .marketplace-page input{ font:inherit; color:inherit; }
  .marketplace-page button{ cursor:pointer; }
  .marketplace-page :focus-visible{ outline:2px solid var(--ink); outline-offset:2px; }

  /* ---------- Visitors: logo, Log in, Sign up ---------- */
  .marketplace-page .mkt-visitor{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px clamp(16px, 2.5vw, 32px); border-bottom:1px solid var(--line); background:var(--paper); }
  .marketplace-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.35rem; display:flex; align-items:baseline; }
  .marketplace-page .logo .va{ color:var(--red); }
  .marketplace-page .mkt-visitor-actions{ display:flex; gap:8px; }

  /* ---------- Header: title, search, categories ---------- */
  .marketplace-page .mkt-header{ padding:20px clamp(16px, 2.5vw, 32px) 12px; background:var(--paper); }
  .marketplace-page .mkt-title-row{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px; }
  .marketplace-page .mkt-title-row h1{ font-size:1.75rem; font-weight:700; letter-spacing:-.02em; }
  .marketplace-page .mkt-heading{ display:flex; align-items:center; gap:10px; min-width:0; }
  .marketplace-page .mkt-search{ position:relative; flex:0 1 420px; min-width:0; margin:0; }
  .marketplace-page .mkt-search > svg{ position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
  .marketplace-page .mkt-search input{
    width:100%; height:42px; padding:0 40px 0 40px; border-radius:999px; border:1px solid var(--line-strong);
    background:var(--card); color:var(--ink); font-size:.92rem; outline:none; -webkit-appearance:none; appearance:none;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .marketplace-page .mkt-search input::-webkit-search-cancel-button{ display:none; }
  .marketplace-page .mkt-search input::placeholder{ color:var(--muted); }
  .marketplace-page .mkt-search input:focus{ border-color:var(--ink); }
  .marketplace-page .mkt-search-clear{
    position:absolute; right:8px; top:50%; width:28px; height:28px; margin-top:-14px; border:0; border-radius:50%;
    display:flex; align-items:center; justify-content:center; background:var(--soft); color:var(--muted);
    animation:mkt-fade var(--motion-micro,150ms) var(--ease-out,ease) both;
  }
  .marketplace-page .category-strip{ display:flex; min-width:0; }
  .marketplace-page .category-strip .vr-seg{ --seg-accent:var(--red); }
  .marketplace-page .category-strip .vr-seg > button{ font-size:.85rem; padding:8px 16px; }

  /* ---------- Summary line ---------- */
  .marketplace-page .mkt-summary{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:14px; }
  .marketplace-page .mkt-summary-label{ font-size:.85rem; color:var(--muted); }
  .marketplace-page .mkt-summary-chip{
    display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px 0 12px; border-radius:999px;
    border:1px solid var(--line-strong); background:var(--card); font-size:.82rem; font-weight:600;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .marketplace-page .mkt-summary-chip svg{ color:var(--muted); }
  .marketplace-page .mkt-summary-chip:active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ .marketplace-page .mkt-summary-chip:hover{ background:var(--soft); } }
  .marketplace-page .mkt-summary-clear{ border:0; background:none; padding:0 4px; font-size:.82rem; font-weight:600; color:var(--red); }

  /* ---------- Listings ---------- */
  .marketplace-page .mkt-body{ min-width:0; }
  .marketplace-page .results-col{ padding:8px clamp(16px, 2.5vw, 32px) 40px; min-width:0; }
  .marketplace-page .grid > .empty-state{ grid-column:1 / -1; }
  .marketplace-page .empty-state{
    display:flex; flex-direction:column; align-items:center; gap:6px; padding:48px 20px; text-align:center;
    border-radius:20px; background:var(--card); border:1px solid var(--line);
  }
  .marketplace-page .empty-state h2{ font-size:1.1rem; font-weight:700; }
  .marketplace-page .empty-state p{ max-width:360px; color:var(--muted); font-size:.9rem; line-height:1.45; }
  .marketplace-page .empty-state .pill-btn{ margin-top:12px; }
  .marketplace-page .pill-btn{
    display:inline-flex; align-items:center; justify-content:center; min-height:38px; padding:0 18px; border-radius:999px;
    border:1px solid var(--line-strong); background:var(--card); color:var(--ink); font-size:.86rem; font-weight:600;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .marketplace-page .pill-btn.primary{ background:var(--ink); border-color:var(--ink); color:var(--paper); }
  .marketplace-page .pill-btn:disabled{ opacity:.6; cursor:default; }
  .marketplace-page .pill-btn:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ .marketplace-page .pill-btn:not(.primary):not(:disabled):hover{ background:var(--soft); } }
  .marketplace-page .mkt-sentinel{ height:1px; }
  .marketplace-page .pagination{ display:flex; justify-content:center; margin-top:20px; min-height:38px; }
  .marketplace-page .mkt-more-error{ display:flex; align-items:center; gap:12px; font-size:.86rem; color:var(--muted); }
  .marketplace-page .mkt-end{ font-size:.82rem; color:var(--muted); }

  /* Skeleton cards */
  .marketplace-page .skeleton{ background:linear-gradient(90deg, var(--soft) 25%, var(--line) 50%, var(--soft) 75%); background-size:200% 100%; animation:mkt-shimmer 1.4s infinite; }
  .marketplace-page .skeleton-card{ pointer-events:none; }
  .marketplace-page .skeleton-line{ height:.75rem; border-radius:5px; }
  .marketplace-page .skeleton-line.title{ width:72%; height:1rem; }
  .marketplace-page .skeleton-line.host{ width:55%; }
  .marketplace-page .skeleton-line.price{ width:38%; }
  @keyframes mkt-shimmer{ to{ background-position:-200% 0; } }
  @keyframes mkt-fade{ from{ opacity:0; } to{ opacity:1; } }

  /* Cards rise in once, 30 ms apart (the first twelve), on a first load from the network. */
  .marketplace-page .grid.is-revealing > .card{ animation:mkt-rise var(--motion-standard,250ms) var(--ease-out,ease) both; }
  ${Array.from({ length: 12 }, (_, index) => `.marketplace-page .grid.is-revealing > .card:nth-child(${index + 1}){ animation-delay:${index * 30}ms; }`).join('\n  ')}
  @keyframes mkt-rise{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }

  /* ---------- Laptops: the header stays, the listings scroll ---------- */
  @media (min-width:861px){
    .marketplace-page{ display:flex; flex-direction:column; height:100vh; overflow:hidden; }
    .marketplace-page .mkt-header{ flex:0 0 auto; border-bottom:1px solid var(--line); }
    .marketplace-page .mkt-body{ flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; padding-top:16px; }
  }

  /* ---------- Phones: the page scrolls; search and categories stick to the top ---------- */
  @media (max-width:860px){
    .marketplace-page .mkt-header{
      position:sticky; top:0; z-index:20; padding:14px 16px 10px;
      background:color-mix(in srgb, var(--paper) 86%, transparent); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px);
      border-bottom:1px solid var(--line);
    }
    .marketplace-page .mkt-title-row{ flex-direction:column; align-items:stretch; gap:10px; margin-bottom:10px; }
    .marketplace-page .mkt-title-row h1{ font-size:1.4rem; }
    .marketplace-page .mkt-search{ flex:1 1 auto; }
    .marketplace-page .category-strip{ margin:0 -16px; padding:0 16px; }
    .marketplace-page .category-strip .vr-seg > button{ font-size:.8rem; padding:7px 13px; }
    .marketplace-page .results-col{ padding:14px 12px 24px; }
    /* The app keeps 5.1rem under pages for its bottom bar (white body padding); this page keeps that room on its own background. */
    body.has-varoom-mobile-nav .marketplace-page{ margin-bottom:-5.1rem; padding-bottom:calc(5.1rem + env(safe-area-inset-bottom)); }
    /* A sticky header needs no clipping ancestor: the shell and page clip sideways without becoming scroll containers. */
    html:has(.marketplace-page), body:has(.marketplace-page), .host-app-layout:has(.marketplace-page), .client-app-layout:has(.marketplace-page){ overflow-x:clip; }
  }

  ${SEGMENTED_TABS_STYLES}
  ${listingCardStyles('.marketplace-page')}

  @media (prefers-reduced-motion:reduce){
    .marketplace-page .grid.is-revealing > .card, .marketplace-page .mkt-search-clear, .marketplace-page .skeleton{ animation:none; }
    .marketplace-page .pill-btn, .marketplace-page .mkt-summary-chip{ transition:none; }
    .marketplace-page .pill-btn:active, .marketplace-page .mkt-summary-chip:active{ transform:none; }
  }
`;
