// Styles for /marketplace, ported from legacy-pages/marketplace.html and
// scoped under .marketplace-page; the html/body rules are the page's own
// (this style exists only while Marketplace is mounted). The Filters panel,
// hidden at every width before, was removed with its rules.

import { listingCardStyles } from '../listings/listingCardStyles';

export const MARKETPLACE_STYLES = `
  :root{
    --bg-surface: #121212;
    --card-bg: #1E1E1E;
    --card-bg-hover: #2A2A2A;
    --text-primary: #FFFFFF;
    --text-secondary: #A1A1AA;
    --accent-cta: #FF385C;
    --accent-link: #FF6B81;
    --border-subtle: #3F3F46;
    --radius-lg: 12px;
    --radius-sm: 6px;
    --red: var(--accent-cta); --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    --line:#E4E1DA;
    --line-soft:#E4E1DA;
  }
  [data-theme="dark"]{
    /* Keep the marketplace on the same continuous VaRoom dark canvas as
       the dashboards. Listing cards are delineated by their outline and
       imagery, rather than a second dark slab behind every property. */
    --bg-surface: #000000;
    --card-bg: #000000;
    --card-bg-hover: #0d0d0d;
    --border-subtle: rgba(255,255,255,.10);
    --white: var(--bg-surface); --paper: var(--bg-surface); --ink: var(--text-primary); --muted: var(--text-secondary); --nav-active-bg:rgba(255,255,255,.14);
    --line: rgba(255,255,255,.12);
    --line-soft: rgba(255,255,255,.07);
  }
  .marketplace-page, .marketplace-page *{ margin:0; padding:0; box-sizing:border-box; }
  html{ overflow-x:hidden; font-size:1rem !important; }
  body{ font-family:var(--font-body); font-size:1rem !important; background:var(--paper); color:var(--ink); min-height:100vh; }
  .marketplace-page a{ color:inherit; text-decoration:none; }
  .marketplace-page button, .marketplace-page input, .marketplace-page select{ font-family:inherit; }
  .marketplace-page :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }
  .marketplace-page .mkt-header{
    display:flex; align-items:center; gap:1rem; padding:1rem 1.4rem;
    border-bottom:1px solid var(--line); background:var(--white); flex-wrap:wrap;
  }
  .marketplace-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.3rem; display:flex; align-items:baseline; white-space:nowrap; }
  .marketplace-page .logo .va{ color:var(--red); }
  .marketplace-page .logo .room{ color:var(--ink); }
  .marketplace-page .mode-switch{
    display:flex; align-items:center; gap:.4rem; font-size:.82rem; color:var(--muted); font-weight:600;
    padding:.35rem .5rem; border-radius:100px; background:var(--paper);
  }
  .marketplace-page .mode-switch a{ padding:.3rem .7rem; border-radius:100px; }
  .marketplace-page .mode-switch a.active{ background:var(--red); color:#fff; }
  .marketplace-page .search-bar{
    flex:1; display:flex; align-items:center; gap:.65rem; min-width:280px; max-width:980px;
  }
  .marketplace-page .search-field{ display:flex; align-items:center; min-height:46px; padding:.55rem .95rem; min-width:150px; border:1px solid var(--line); border-radius:12px; background:var(--white); transition:border-color .2s, box-shadow .2s; }
  .marketplace-page .search-field:first-child{ flex:1; min-width:260px; }
  .marketplace-page .search-field:focus-within{ border-color:var(--red); box-shadow:0 0 0 3px rgba(196,30,58,.12); }
  .marketplace-page .search-field label{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
  .marketplace-page .search-field input, .marketplace-page .search-field select{ border:none; background:none; color:var(--ink); font-size:.86rem; outline:none; width:100%; }
  .marketplace-page .search-field input::placeholder{ color:var(--muted); opacity:1; }
  .marketplace-page .search-field select option{ background:var(--white); color:var(--ink); }
  .marketplace-page .search-submit{ min-height:46px; background:var(--red); color:#fff; border:1px solid var(--red); border-radius:12px; padding:0 1.25rem; font-weight:700; font-size:.86rem; cursor:pointer; }
  .marketplace-page .search-submit:hover{ background:var(--red-deep); }
  .marketplace-page .mkt-body{ display:flex; align-items:flex-start; min-width:0; }
  .marketplace-page .results-col{ order:1; flex:1 1 auto; padding:1.8rem clamp(1rem, 2.5vw, 2.5rem) 3rem; min-width:0; }
  .marketplace-page .skeleton{ background:linear-gradient(90deg,var(--paper) 25%,var(--line-soft) 50%,var(--paper) 75%); background-size:200% 100%; animation:skeleton-shimmer 1.4s infinite; }
  .marketplace-page .skeleton-card{ pointer-events:none; }
  .marketplace-page .skeleton-line{ height:.75rem; border-radius:5px; }
  .marketplace-page .skeleton-line.title{ width:72%; height:1rem; }
  .marketplace-page .skeleton-line.host{ width:55%; }
  .marketplace-page .skeleton-line.price{ width:38%; }
  @keyframes skeleton-shimmer{to{ background-position:-200% 0; } }
  .marketplace-page .empty-state{ padding:3rem 1rem; text-align:center; color:var(--muted); }
  .marketplace-page .empty-state h2{ font-family:var(--font-display); color:var(--ink); font-size:1.15rem; margin-bottom:.4rem; }
  .marketplace-page .pagination{ display:flex; align-items:center; justify-content:center; gap:.4rem; margin-top:2rem; }
  .marketplace-page .pagination button{
    min-width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:var(--white);
    color:var(--ink); font-size:.85rem; cursor:pointer;
  }
  .marketplace-page .pagination button.active{ background:var(--red); color:#fff; border-color:var(--red); }
  .marketplace-page .pagination button[disabled]{ opacity:.4; cursor:not-allowed; }
  .marketplace-page .load-more{ min-width:120px; padding:0 1rem; }
  .marketplace-page .mobile-marketplace-tools{ display:none; }
  @media (min-width: 861px){
    .marketplace-page .mkt-header{ display:grid; grid-template-columns:1fr auto; gap:.8rem; padding:.8rem 1.4rem; border-bottom:1px solid var(--line); }
    .marketplace-page .mkt-header .logo, .marketplace-page .mkt-header .mode-switch{ display:none; }
    .marketplace-page .search-bar{ grid-column:1; grid-row:1; max-width:660px; width:100%; }
    .marketplace-page .results-col{ padding:1.25rem clamp(1rem, 2vw, 2rem) 3rem; }
  }
  @media (max-width: 860px){
    body{ padding-bottom:4.4rem; }
    .marketplace-page .mkt-header{ display:block; padding:.8rem .8rem .3rem; border:0; background:var(--paper); }
    .marketplace-page .mkt-header .logo, .marketplace-page .mode-switch{ display:none; }
    .marketplace-page .mkt-body{ flex-direction:column; }
    .marketplace-page .search-bar{ display:none; }
    .marketplace-page .mobile-marketplace-tools{ display:block; }
    .marketplace-page .mobile-search{ display:flex; align-items:center; gap:.55rem; height:2.75rem; padding:0 .9rem; border:1px solid var(--line-soft); border-radius:999px; background:var(--white); box-shadow:0 3px 12px rgba(26,18,16,.05); }
    .marketplace-page .mobile-search svg{ flex:0 0 auto; color:var(--muted); }
    .marketplace-page .mobile-search input{ min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--ink); font-size:.78rem; }
    .marketplace-page .mobile-search input::placeholder{ color:var(--muted); opacity:1; }
    .marketplace-page .mobile-search button{ display:flex; align-items:center; justify-content:center; width:1.55rem; height:1.55rem; border:0; background:none; color:var(--muted); cursor:pointer; }
    .marketplace-page .results-col{ width:100%; padding:.35rem .8rem 1.5rem; }
    .marketplace-page .pagination{ margin-top:1rem; }
  }
  
  /* Desktop marketplace surface */
  
  @media (min-width: 861px){
    html, body{ height:100%; overflow:hidden; }
    .marketplace-page .mkt-body{ height:calc(100vh - var(--mkt-header-h)); overflow-y:auto; overflow-x:hidden; }
    body{ background:#fbfbfa; color:#202124; }
    .marketplace-page .mkt-header{
      position:relative; z-index:4; display:grid; grid-template-columns:minmax(300px, 586px) auto;
      gap:1rem; height:var(--mkt-header-h); margin-left:0; padding:22px 24px 10px 22px;
      border:0; background:#fbfbfa;
    }
    .marketplace-page .mkt-header .logo, .marketplace-page .mkt-header .mode-switch{ display:none; }
    .marketplace-page .search-bar{ grid-column:1; grid-row:1; width:100%; max-width:none; position:relative; }
    .marketplace-page .search-bar::after{
      content:"☷"; position:absolute; right:16px; top:7px; color:#374151; font-size:0.875rem;
      transform:rotate(90deg);
    }
    .marketplace-page .search-field{
      width:100%; min-height:32px; height:32px; min-width:0; padding:0 14px 0 34px;
      border:0; border-radius:999px; background:#f1f1f1;
      position:relative;
    }
    .marketplace-page .search-field::before{
      content:""; position:absolute; left:13px; width:11px; height:11px;
      border:1.5px solid #4b5563; border-radius:50%;
    }
    .marketplace-page .search-field::after{
      content:""; position:absolute; left:23px; top:17px; width:5px; height:1.5px;
      background:#4b5563; transform:rotate(45deg); transform-origin:left center;
    }
    .marketplace-page .search-field input{ font-size:0.625rem; color:#374151; }
    .marketplace-page .search-submit{ display:none; }
    .marketplace-page .search-field{ border:1px solid rgba(0,0,0,.14); }
    html[data-theme="dark"] .marketplace-page .search-field{ border-color:rgba(255,255,255,.18); }
    .marketplace-page .mkt-body{ display:block; margin-left:0; min-height:calc(100vh - var(--mkt-header-h)); }
    .marketplace-page .results-col{ width:auto; padding:8px 20px 28px; }
    .marketplace-page .pagination{ margin-top:18px; }
  }
  @media (min-width: 861px){
    body, .marketplace-page .mkt-header, .marketplace-page .results-col{ background:var(--paper); color:var(--ink); }
    .marketplace-page .search-field{ background:var(--paper); color:var(--ink); }
  }
  @media (min-width: 861px){
    .marketplace-page .mkt-header{ padding-left:22px; }
    .marketplace-page .results-col{ padding:8px 20px 28px; }
  }

  ${listingCardStyles('.marketplace-page')}

  /* Category strip: its own row at the top of the listings, sticky in the
     scroll container (the page on phones, .mkt-body on laptops), so the
     listings scroll beneath it. */
  .marketplace-page{ --mkt-header-h:64px; }
  .marketplace-page .category-strip{
    position:sticky; top:0; z-index:5; display:flex; gap:10px; align-items:center;
    overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none;
    margin:-8px -20px 12px; padding:10px 20px;
    background:color-mix(in srgb, var(--paper) 82%, transparent);
    -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
    box-shadow:0 1px 0 var(--line-soft);
  }
  .marketplace-page .category-strip::-webkit-scrollbar{ display:none; }
  .marketplace-page .category-chip{
    flex:0 0 auto; min-height:27px; padding:0 15px; border:0; border-radius:999px;
    background:var(--paper); color:var(--ink); font-size:0.625rem; font-weight:600; cursor:pointer; white-space:nowrap;
  }
  .marketplace-page .category-chip.active{ background:var(--ink); color:var(--white); }
  @media (max-width: 860px){
    /* hidden would make body a scroll container and unstick the strip. */
    html, body, .host-app-layout, .client-app-layout{ overflow-x:clip; }
    .marketplace-page .category-strip{ gap:.5rem; margin:-.35rem -.8rem .6rem; padding:.55rem .8rem; }
    .marketplace-page .category-chip{ min-height:2rem; padding:0 .82rem; background:var(--white); font-size:.68rem; }
    .marketplace-page .category-chip.active{ background:var(--ink); color:var(--paper); }
  }

`;
