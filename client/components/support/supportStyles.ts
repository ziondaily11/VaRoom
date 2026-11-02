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
  .support-page .action h2 { font:600 1rem var(--display); }
  .support-page .action p { margin-top:.4rem; color:#a6abb1; font-size:.68rem; line-height:1.55; }
  .support-page .write-card { display:flex; align-items:center; justify-content:space-between; gap:1.5rem; margin-top:1.8rem; padding:1.25rem 1.5rem; border:1px solid var(--line); border-radius:8px; background:rgba(17,20,22,.8); }
  .support-page .write-card h2 { font:600 1.35rem var(--display); }
  .support-page .write-card p { margin-top:.35rem; color:var(--muted); font-size:.75rem; }
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
  .support-page .support-form input, .support-page .support-form textarea {
    width:100%; min-height:44px; padding:.8rem .9rem; border:1px solid #2f353b; border-radius:8px; color:var(--text); background:rgba(10,12,14,.9); font:inherit;
  }
  .support-page .support-form textarea { min-height:140px; resize:vertical; }
  .support-page .support-form input:focus, .support-page .support-form textarea:focus { border-color:var(--red); outline:none; }
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
  .support-page .articles h2 { margin-top:.55rem; font:600 2rem var(--display); letter-spacing:-.03em; }
  .support-page .article-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin-top:1rem; }
  .support-page .article { min-height:280px; padding:1.25rem 1.35rem 1.3rem; border:1px solid var(--line); border-radius:8px; background:linear-gradient(145deg,rgba(16,19,21,.9),rgba(9,11,12,.95)); transition:border-color .25s, box-shadow .25s; }
  .support-page .article.match { border-color:var(--red); box-shadow:0 0 0 2px rgba(237,35,71,.18); }
  .support-page .article-head { display:flex; align-items:flex-start; gap:.8rem; }
  .support-page .article-icon { display:grid; place-items:center; flex:none; width:38px; height:38px; border-radius:50%; color:#d6d9da; background:#25292c; }
  .support-page .article h3 { padding-top:.15rem; font:600 1.08rem var(--display); }
  .support-page .article-description { margin:.7rem 0 .85rem 2.85rem; color:#aeb3b8; font-size:.72rem; line-height:1.55; }
  .support-page .article ol { margin:0 0 0 2.85rem; padding-left:1rem; color:#c6c9cc; font-size:.7rem; line-height:1.75; }
  .support-page .article li { padding-left:.2rem; }
  .support-page .article strong { color:#e7e7e5; font-size:.62rem; letter-spacing:.08em; }
  .support-page .article-note { margin:.7rem 0 0 2.85rem; padding:.55rem .65rem; border-left:2px solid var(--red); color:#b9bec2; font-size:.68rem; line-height:1.5; }
  .support-page footer { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-top:2.5rem; padding-top:1.1rem; border-top:1px solid rgba(255,255,255,.08); color:#777d84; font-size:.6rem; }
  .support-page footer strong { color:var(--text); font:600 1.35rem var(--display); }
  .support-page footer nav { display:flex; flex-wrap:wrap; gap:1rem; }
  .support-page footer nav a:hover { color:var(--text); }
  .support-page .empty { margin-top:1rem; color:var(--muted); font-size:.8rem; }
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
    .support-page .article-grid { grid-template-columns:1fr; }
    .support-page .article h3 { font-size:1.2rem; }
    .support-page .article-description { font-size:.82rem; }
    .support-page .article ol { font-size:.8rem; }
    .support-page .article strong { font-size:.7rem; }
    .support-page .article-note { font-size:.78rem; }
    .support-page:before { right:-7rem; font-size:22rem; }
  }
  @media (max-width:560px) {
    .support-page h1 { font-size:2.65rem; }
    .support-page .action { min-height:125px; }
    .support-page .write-card { align-items:flex-start; flex-direction:column; }
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
  .support-page .write-card { background:rgba(17,20,22,.8) !important; border-color:var(--line) !important; }
  .support-page .article { background:linear-gradient(145deg,rgba(16,19,21,.9),rgba(9,11,12,.95)) !important; border-color:var(--line) !important; }
  .support-page .action-icon,
  .support-page .article-icon { background:#25292d !important; border:0 !important; }
  .support-page .search button { background:#171a1d !important; border:0 !important; }
  .support-page .search button:hover { background:var(--red) !important; }
  .support-page .support-form input,
  .support-page .support-form textarea { background:rgba(10,12,14,.9) !important; border-color:#2f353b !important; }

  /* Dark theme (formerly public/js/varoom-dark-theme.css "SUPPORT PAGES"). */
  [data-theme="dark"] .support-page,
  [data-theme="dark"] .support-page main,
  [data-theme="dark"] .support-page .topbar { background:#000000 !important; }
  [data-theme="dark"] .support-page .topbar { border-bottom-color:rgba(255,255,255,.07) !important; }
  [data-theme="dark"] .support-page .search { background:rgba(255,255,255,.05) !important; border-color:rgba(255,255,255,.12) !important; }
  [data-theme="dark"] .support-page .action,
  [data-theme="dark"] .support-page .write-card,
  [data-theme="dark"] .support-page .article { background:rgba(255,255,255,.03) !important; border-color:rgba(255,255,255,.07) !important; box-shadow:none !important; }
  [data-theme="dark"] .support-page .action-icon,
  [data-theme="dark"] .support-page .article-icon,
  [data-theme="dark"] .support-page .search button { background:rgba(255,255,255,.06) !important; border:1px solid rgba(255,255,255,.07); }
  [data-theme="dark"] .support-page footer { border-top-color:rgba(255,255,255,.07) !important; }
  @media (max-width: 800px) {
    [data-theme="dark"] .support-page .topbar,
    [data-theme="dark"] .support-page main,
    [data-theme="dark"] .support-page footer { background:#000000 !important; }
    [data-theme="dark"] .support-page .search,
    [data-theme="dark"] .support-page .action,
    [data-theme="dark"] .support-page .write-card,
    [data-theme="dark"] .support-page .article { background:rgba(255,255,255,.03) !important; border-color:rgba(255,255,255,.07) !important; }
  }
`;
