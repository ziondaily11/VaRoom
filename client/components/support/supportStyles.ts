// Styles for the Support page, ported from legacy-pages/support.html and
// scoped under .support-page, including its dark-theme rules (formerly in
// public/js/varoom-dark-theme.css). Rendered only while the page is mounted.

export const SUPPORT_STYLES = `
  .support-page {
    --bg:#000; --surface:#0d1012; --surface-soft:#111416; --text:#f0eee9;
    --muted:#5c584f; --subtle:#5c584f; --line:rgba(255,255,255,.12);
    --red:#ed2347; --display:'Fraunces', Georgia, serif; --body:'Inter', sans-serif;
  }
  .support-page, .support-page * { box-sizing:border-box; }
  
  .support-page { margin:0; color:var(--text); background:var(--bg); font-family:var(--body); }
  .support-page:before { content:"V"; position:fixed; z-index:-1; top:4rem; right:5%; color:rgba(237,35,71,.045); font:700 31rem/1 var(--display); pointer-events:none; }
  .support-page a { color:inherit; text-decoration:none; }
  .support-page button, .support-page input { font:inherit; }
  .support-page button { cursor:pointer; }
  .support-page :focus-visible { outline:2px solid var(--red); outline-offset:3px; }
  .support-page.page { max-width:1120px; margin:0 auto; padding:0 2rem 2.5rem; }
  .support-page .topbar { height:66px; display:flex; align-items:center; border-bottom:1px solid rgba(255,255,255,.09); }
  .support-page .logo { font:700 1.55rem var(--display); letter-spacing:-.04em; }
  .support-page .logo .va { color:var(--red); }
  .support-page .nav { display:flex; align-items:center; gap:2.25rem; margin-left:auto; color:#bbc0c7; font-size:.78rem; }
  .support-page .nav a { padding:1.4rem 0 1.15rem; }
  .support-page .nav a:hover, .support-page .nav a.active { color:var(--text); }
  .support-page .nav a.active { border-bottom:2px solid rgba(255,255,255,.24); }
  .support-page .account { display:flex; align-items:center; gap:.55rem; margin-left:2rem; color:#d5d7da; font-size:.78rem; }
  .support-page .avatar { display:grid; place-items:center; width:29px; height:29px; border-radius:50%; background:#57453e; font-size:.68rem; }
  .support-page .hero { position:relative; padding:3.4rem 0 1.6rem; max-width:850px; }
  .support-page .eyebrow, .support-page .section-label { display:flex; align-items:center; gap:.55rem; color:#c2c4c7; font-size:.62rem; letter-spacing:.24em; text-transform:uppercase; }
  .support-page .eyebrow:before, .support-page .section-label:before { content:""; width:22px; height:1px; background:var(--red); }
  .support-page h1, .support-page h2, .support-page h3, .support-page p { margin:0; }
  .support-page h1 { max-width:680px; margin-top:.7rem; font:600 clamp(2.8rem,6vw,4.5rem)/1.04 var(--display); letter-spacing:-.045em; }
  .support-page .hero-copy { margin-top:.85rem; max-width:570px; color:#aab0b7; font-size:.9rem; line-height:1.65; }
  .support-page .search { display:flex; align-items:center; gap:.75rem; max-width:610px; margin-top:1.7rem; padding:.35rem .4rem .35rem 1rem; border:1px solid #34393e; border-radius:999px; background:rgba(20,23,26,.72); }
  .support-page .search svg { flex:none; color:#d2d4d6; }
  .support-page .search input { min-width:0; flex:1; border:0 !important; outline:0 !important; color:var(--text) !important; background:transparent !important; background-color:transparent !important; box-shadow:none !important; -webkit-appearance:none; appearance:none; font-size:.78rem; }
  .support-page .search input::placeholder { color:#8a9098; }
  .support-page .search button { display:grid; place-items:center; width:31px; height:31px; border:0; border-radius:50%; color:#e5e5e5; background:#171a1d; }
  .support-page .search button:hover { background:var(--red); }
  .support-page .support-actions { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; margin-top:1rem; }
  .support-page .action { min-height:144px; padding:1.1rem; text-align:left; color:var(--text); border:1px solid var(--line); border-radius:8px; background:linear-gradient(135deg,rgba(20,23,25,.9),rgba(10,12,13,.9)); transition:border-color .2s, transform .2s; }
  .support-page .action:hover { border-color:#667079; transform:translateY(-2px); }
  .support-page .action-icon { display:grid; place-items:center; width:36px; height:36px; margin-bottom:1rem; border-radius:50%; color:#e5e5e5; background:#25292d; }
  .support-page .action h3 { font:600 1rem var(--display); }
  .support-page .action p { margin-top:.4rem; color:#a6abb1; font-size:.68rem; line-height:1.55; }
  .support-page .write-button { flex:none; padding:.7rem 1rem; border:1px solid #525960; border-radius:999px; color:var(--text); background:transparent; font-size:.75rem; }
  .support-page .write-button:hover { border-color:var(--red); color:#fff; }
  .support-page .action.is-active { border-color:rgba(237,35,71,.65); box-shadow:0 0 0 1px rgba(237,35,71,.2); }
  .support-page .support-modal-backdrop {
    position:fixed; inset:0; display:grid; place-items:center; padding:1rem; background:rgba(4,6,8,.75); backdrop-filter:blur(2px); z-index:20;
  }
  .support-page .support-modal-backdrop[hidden] { display:none; }
  .support-page .support-modal {
    position:relative; width:min(100%, 540px); max-height:90vh; overflow:auto; padding:1.2rem 1.2rem 1.1rem; border:1px solid rgba(255,255,255,.12); border-radius:12px; background:linear-gradient(180deg, rgba(13,16,18,.97), rgba(10,12,13,.98)); box-shadow:0 24px 80px rgba(0,0,0,.45);
  }
  .support-page .support-modal-close {
    position:absolute; top:.85rem; right:.85rem; display:grid; place-items:center; width:32px; height:32px; border:1px solid rgba(255,255,255,.08); border-radius:50%; color:#d9dce0; background:rgba(255,255,255,.02);
  }
  .support-page .support-panel, .support-page .support-form {
    display:flex; flex-direction:column; gap:.8rem; width:100%;
  }
  .support-page .support-panel h2, .support-page .support-form h2 { font:600 1.8rem/1.1 var(--display); letter-spacing:-.04em; }
  .support-page .support-panel p, .support-page .support-form p { color:#b3b9bf; font-size:.78rem; line-height:1.6; }
  .support-page .field-label { margin-top:.15rem; color:#dfe2e5; font-size:.68rem; letter-spacing:.08em; text-transform:uppercase; }
  .support-page .support-form input, .support-page .support-form textarea, .support-page .support-form select {
    width:100%; min-height:44px; padding:.8rem .9rem; border:1px solid #2f353b; border-radius:8px; color:var(--text); background:rgba(10,12,14,.9); font:inherit;
  }
  .support-page .support-form textarea { min-height:140px; resize:vertical; }
  .support-page .support-form input:focus, .support-page .support-form textarea:focus, .support-page .support-form select:focus { border-color:var(--red); outline:none; }
  .support-page .support-form select { appearance:none; cursor:pointer; padding-right:2.4rem;
    background-image:linear-gradient(45deg, transparent 50%, #9aa1a8 50%), linear-gradient(135deg, #9aa1a8 50%, transparent 50%);
    background-position:calc(100% - 1.2rem) 50%, calc(100% - .85rem) 50%; background-size:.35rem .35rem; background-repeat:no-repeat; }
  .support-page .support-form select option { color:#f0eee9; background:#0d1012; }
  .support-page .reply-email-known { display:flex; align-items:center; justify-content:space-between; gap:1rem; min-height:44px; padding:.55rem .55rem .55rem .9rem; border:1px solid #2f353b; border-radius:8px; background:rgba(10,12,14,.9); color:var(--text); font-size:.85rem; letter-spacing:.02em; }
  .support-page .reply-email-change { flex:none; padding:.4rem .75rem; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:transparent; color:#cfd3d7; font-size:.7rem; cursor:pointer; }
  .support-page .reply-email-change:hover { border-color:var(--red); color:#fff; }

  /* Rate VaRoom */
  .support-page .rate-card { margin-top:1.8rem; padding:1.5rem; border:1px solid var(--line); border-radius:8px; background:rgba(17,20,22,.8); }
  .support-page .rate-card h2 { font:600 1.35rem var(--display); }
  .support-page .rate-card > p { margin-top:.35rem; color:#9aa1a8; font-size:.78rem; line-height:1.6; }
  .support-page .rate-form { display:grid; gap:.9rem; margin-top:1.1rem; }
  .support-page .rate-stars { display:flex; gap:.35rem; border:0; padding:0; margin:0; }
  .support-page .rate-star { width:44px; height:44px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #2f353b; border-radius:10px; background:rgba(10,12,14,.9); color:#5c636a; font-size:1.35rem; line-height:1; cursor:pointer; transition:color .15s ease, border-color .15s ease, transform .15s ease; }
  .support-page .rate-star.is-on { color:var(--red); border-color:rgba(237,35,71,.55); }
  .support-page .rate-star:hover { transform:translateY(-1px); border-color:var(--red); }
  .support-page .rate-star:focus-visible { outline:2px solid var(--red); outline-offset:2px; }
  .support-page .rate-form textarea { width:100%; min-height:96px; padding:.8rem .9rem; border:1px solid #2f353b; border-radius:8px; color:var(--text); background:rgba(10,12,14,.9); font:inherit; font-size:.85rem; resize:vertical; }
  .support-page .rate-form textarea:focus { border-color:var(--red); outline:none; }
  .support-page .rate-footer { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
  .support-page .rate-note { color:#9aa1a8; font-size:.72rem; }
  .support-page .rate-note.is-error { color:#ff8fa3; }
  .support-page .rate-card .write-button:disabled { opacity:.55; cursor:default; }
  .support-page .rate-signin { display:inline-flex; margin-top:1rem; }
  .support-page .support-form-actions, .support-page .support-panel-actions { display:flex; justify-content:flex-end; gap:.8rem; margin-top:.25rem; }
  .support-page .support-form-secondary {
    padding:.7rem 1rem; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:transparent; color:var(--text); font-size:.75rem;
  }
  .support-page .support-form-message { min-height:1.2rem; margin-top:.2rem; color:#f0c2c5; font-size:.72rem; }
  .support-page .success-icon {
    display:grid; place-items:center; width:56px; height:56px; margin-bottom:.2rem; border-radius:50%; background:rgba(105,168,123,.14); color:#8fc99f; font-size:1.7rem; font-weight:700;
  }
  .support-page .support-success { align-items:flex-start; }
  .support-page .support-success p { color:#dfe3e6; font-size:.85rem; }
  .support-page .support-success .write-button { margin-top:.15rem; }
  .support-page .support-success-compact { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.7rem; min-height:190px; padding:1.4rem .75rem; text-align:center; }
  .support-page .support-success-compact .success-icon { position:relative; flex:none; width:58px; height:58px; margin:0 0 .3rem; color:#9bd3a8; background:rgba(105,168,123,.14); font-size:1.7rem; animation:success-pop .35s ease-out both; }
  .support-page .support-success-compact .success-icon:after { content:""; position:absolute; inset:7px; border:1px solid rgba(143,201,159,.38); border-radius:50%; animation:success-ring .65s ease-out both; }
  .support-page .support-success-compact strong { font:600 1.3rem/1.1 var(--display); }
  .support-page .support-success-compact p { max-width:300px; margin:0; color:#bfc4c8; font-size:.78rem; line-height:1.55; }
  @keyframes success-pop { from { opacity:0; transform:scale(.72); } to { opacity:1; transform:scale(1); } }
  @keyframes success-ring { from { opacity:.8; transform:scale(.7); } to { opacity:0; transform:scale(1.25); } }
  .support-page .is-submitting { opacity:.7; pointer-events:none; }
  @media (max-width:560px) {
    .support-page .support-modal { padding:1rem .9rem 1rem; }
    .support-page .support-panel h2, .support-page .support-form h2 { font-size:1.5rem; }
    .support-page .support-form-actions, .support-page .support-panel-actions { flex-direction:column-reverse; }
    .support-page .support-form-secondary, .support-page .write-button.submit-button { width:100%; }
  }
  .support-page .articles { margin-top:2.7rem; }
  .support-page .articles h2, .support-page .contact h2 { margin-top:.55rem; font:600 2rem var(--display); letter-spacing:-.03em; }
  .support-page footer { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-top:2.5rem; padding-top:1.1rem; border-top:1px solid rgba(255,255,255,.08); color:#777d84; font-size:.6rem; }
  .support-page footer strong { color:var(--text); font:600 1.35rem var(--display); }
  .support-page footer nav { display:flex; flex-wrap:wrap; gap:1rem; }
  .support-page footer nav a:hover { color:var(--text); }
  @media (max-width:800px) {
    .support-page.page { padding:0 1rem 1.5rem; }
    .support-page .nav { display:none; }
    .support-page .account { margin-left:auto; }
    .support-page .hero { padding-top:2.5rem; }
    .support-page .support-actions {
      grid-auto-flow:column;
      grid-auto-columns:calc(100% - 1rem);
      grid-template-columns:none;
      overflow-x:auto;
      padding-bottom:.35rem;
      scroll-snap-type:x mandatory;
      scrollbar-width:none;
    }
    .support-page .support-actions::-webkit-scrollbar { display:none; }
    .support-page .action { scroll-snap-align:start; }
    .support-page:before { right:-7rem; font-size:22rem; }
  }
  @media (max-width:560px) {
    .support-page h1 { font-size:2.65rem; }
    .support-page .action { min-height:125px; }
    .support-page footer { align-items:flex-start; flex-direction:column; }
  }

  /* Support owns a fixed black canvas; global VaRoom theme selectors must not alter it. */
  html:has(.support-page),
  body:has(.support-page),
  #__next:has(.support-page),
  #__next > main:has(.support-page) { background:#000 !important; }
  .support-page,
  .support-page .topbar,
  .support-page main,
  .support-page footer { background:#000 !important; }
  .support-page .search { background:rgba(20,23,26,.72) !important; border-color:#34393e !important; }
  .support-page .search input,
  .support-page #search-input {
    background: transparent !important;
    background-color: transparent !important;
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    -webkit-appearance: none !important;
    appearance: none !important;
    color: var(--text) !important;
  }
  .support-page .action { background:linear-gradient(135deg,rgba(20,23,25,.9),rgba(10,12,13,.9)) !important; border-color:var(--line) !important; }
  .support-page .action-icon,
  .support-page .search button { background:#171a1d !important; border:0 !important; }
  .support-page .search button:hover { background:var(--red) !important; }
  .support-page .support-form input,
  .support-page .support-form textarea,
  .support-page .support-form select { background-color:rgba(10,12,14,.9) !important; border-color:#2f353b !important; }

  /* Dark theme (formerly public/js/varoom-dark-theme.css "SUPPORT PAGES"). */
  [data-theme="dark"] .support-page,
  [data-theme="dark"] .support-page main,
  [data-theme="dark"] .support-page .topbar { background:#000000 !important; }
  [data-theme="dark"] .support-page .topbar { border-bottom-color:rgba(255,255,255,.07) !important; }
  [data-theme="dark"] .support-page .search { background:rgba(255,255,255,.05) !important; border-color:rgba(255,255,255,.12) !important; }
  [data-theme="dark"] .support-page .action,
  [data-theme="dark"] .support-page .rate-card,
  [data-theme="dark"] .support-page .topic,
  [data-theme="dark"] .support-page .help-item { background:rgba(255,255,255,.03) !important; border-color:rgba(255,255,255,.07) !important; box-shadow:none !important; }
  [data-theme="dark"] .support-page .action-icon,
  [data-theme="dark"] .support-page .topic-icon,
  [data-theme="dark"] .support-page .search button { background:rgba(255,255,255,.06) !important; border:1px solid rgba(255,255,255,.07); }
  [data-theme="dark"] .support-page footer { border-top-color:rgba(255,255,255,.07) !important; }
  @media (max-width: 800px) {
    [data-theme="dark"] .support-page .topbar,
    [data-theme="dark"] .support-page main,
    [data-theme="dark"] .support-page footer { background:#000000 !important; }
    [data-theme="dark"] .support-page .search,
    [data-theme="dark"] .support-page .action,
    [data-theme="dark"] .support-page .topic,
    [data-theme="dark"] .support-page .help-item { background:rgba(255,255,255,.03) !important; border-color:rgba(255,255,255,.07) !important; }
  }
  /* ---------- Help centre ---------- */
  .support-page .topbar { gap:1rem; }
  .support-page .topbar-title { color:#9aa1a8; font-size:.78rem; padding-left:1rem; border-left:1px solid rgba(255,255,255,.14); }
  .support-page .topbar-contact { margin-left:auto; padding:.5rem .95rem; border:1px solid #3a4046; border-radius:999px; color:var(--text); background:transparent; font-size:.75rem;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  @media (hover:hover){ .support-page .topbar-contact:hover { border-color:var(--red); } }
  .support-page .topbar-contact:active { transform:scale(var(--press-scale,.97)); }
  .support-page .search-results { max-width:610px; margin-top:.6rem; padding:.5rem; border:1px solid #2b3035; border-radius:16px; background:#0b0d0f; animation:sp-fade-up var(--motion-quick,200ms) var(--ease-out,ease) both; }
  .support-page .search-count { padding:.35rem .6rem .45rem; color:#8a9098; font-size:.7rem; }
  .support-page .search-results ul { margin:0; padding:0; list-style:none; }
  .support-page .search-results li button { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; width:100%; padding:.7rem .7rem; border:0; border-radius:10px; color:var(--text); background:transparent; text-align:left;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .support-page .search-results li button:hover { background:#16191c; } }
  .support-page .search-results li button:focus-visible { background:#16191c; }
  .support-page .search-result-title { font-size:.88rem; font-weight:600; }
  .support-page .search-result-topic { flex:none; color:#8a9098; font-size:.7rem; }
  .support-page .search-empty { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.5rem .6rem; }
  .support-page .search-empty p { color:#c2c6ca; font-size:.82rem; }

  .support-page .topics { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:.9rem; margin-top:1.4rem; }
  .support-page .topic { display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto auto; column-gap:.85rem; row-gap:.2rem; align-items:start; min-height:118px; padding:1.05rem 1.1rem;
    text-align:left; color:var(--text); border:1px solid var(--line); border-radius:14px; background:linear-gradient(135deg,rgba(20,23,25,.9),rgba(10,12,13,.9));
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  @media (hover:hover){ .support-page .topic:hover { border-color:#667079; } }
  .support-page .topic:active { transform:scale(var(--press-scale,.97)); }
  .support-page .topic.is-active { border-color:rgba(237,35,71,.7) !important; box-shadow:0 0 0 1px rgba(237,35,71,.25); }
  .support-page .topic-icon { grid-row:1 / span 3; display:grid; place-items:center; width:38px; height:38px; border-radius:50%; color:#e5e5e5; background:#25292d; }
  .support-page .topic-title { font:600 1.02rem var(--display); }
  .support-page .topic-text { color:#a6abb1; font-size:.74rem; line-height:1.45; }
  .support-page .topic-count { margin-top:.35rem; color:#7e858c; font-size:.66rem; letter-spacing:.06em; text-transform:uppercase; }

  .support-page .articles-head { display:flex; align-items:flex-end; justify-content:space-between; gap:1rem; }
  .support-page .help-list { display:flex; flex-direction:column; gap:.55rem; margin-top:1rem; }
  .support-page .help-item { border:1px solid var(--line); border-radius:14px; background:rgba(14,16,18,.9); scroll-margin-top:1rem;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease); }
  .support-page .help-item.is-open { border-color:#4a5157; }
  .support-page .help-item-head { display:flex; align-items:center; gap:1rem; width:100%; padding:1rem 1.15rem; border:0; color:var(--text); background:transparent; text-align:left; }
  .support-page .help-item-titles { flex:1; display:flex; flex-direction:column; gap:.2rem; min-width:0; }
  .support-page .help-item-title { font:600 1.02rem var(--display); }
  .support-page .help-item-summary { color:#a6abb1; font-size:.78rem; line-height:1.45; }
  .support-page .help-item-chevron { flex:none; width:10px; height:10px; border-right:2px solid #9aa1a8; border-bottom:2px solid #9aa1a8; transform:rotate(45deg) translate(-2px,-2px);
    transition:transform var(--motion-quick,200ms) var(--ease-in-out,ease-in-out); }
  .support-page .help-item.is-open .help-item-chevron { transform:rotate(225deg) translate(-2px,-2px); }
  /* Opens and closes by animating its grid row (animation.md C5). */
  .support-page .help-item-panel { display:grid; grid-template-rows:0fr; opacity:0;
    transition:grid-template-rows var(--motion-standard,250ms) var(--ease-in-out,ease-in-out), opacity var(--motion-quick,200ms) var(--ease-out,ease); }
  .support-page .help-item.is-open .help-item-panel { grid-template-rows:1fr; opacity:1; }
  .support-page .help-item-inner { min-height:0; overflow:hidden; padding:0 1.15rem; }
  .support-page .help-item.is-open .help-item-inner { padding-bottom:1.1rem; }
  .support-page .help-item ol { margin:.1rem 0 0; padding-left:1.2rem; color:#d0d3d6; font-size:.86rem; line-height:1.75; }
  .support-page .help-item li { padding-left:.25rem; }
  .support-page .help-item strong { color:#fff; font-weight:600; }
  .support-page .help-item-note { margin-top:.75rem; padding:.6rem .75rem; border-left:2px solid var(--red); color:#b9bec2; font-size:.8rem; line-height:1.5; }
  .support-page .help-item-link { display:inline-block; margin-top:.75rem; color:#ff8fa3; font-size:.8rem; font-weight:600; }
  @media (hover:hover){ .support-page .help-item-link:hover { text-decoration:underline; } }

  .support-page .contact { margin-top:3rem; }
  .support-page .contact-copy { margin-top:.5rem; color:#aab0b7; font-size:.85rem; }
  @keyframes sp-fade-up { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
  @media (max-width:800px) {
    .support-page .topics { grid-template-columns:1fr 1fr; }
    .support-page .topbar-title { display:none; }
  }
  @media (max-width:560px) {
    .support-page .topics { grid-template-columns:1fr; }
    .support-page .topic { min-height:0; }
    .support-page .articles-head { align-items:flex-start; flex-direction:column; }
    .support-page .search-empty { align-items:flex-start; flex-direction:column; }
  }
  @media (prefers-reduced-motion:reduce) {
    .support-page .help-item-panel, .support-page .help-item-chevron, .support-page .topic, .support-page .topbar-contact, .support-page .search-results li button, .support-page .help-item { transition:none; }
    .support-page .search-results { animation:none; }
    .support-page .topic:active, .support-page .topbar-contact:active { transform:none; }
  }
`;
