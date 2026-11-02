// Styles for the Map page, ported from legacy-pages/map.html and scoped
// under .map-page, including its dark-theme rules (formerly in
// public/js/varoom-dark-theme.css "MAP & LOCATION", and the shared dark .btn
// rule, here as .map-btn). Rendered only while the page is mounted.

export const MAP_STYLES = `
  .map-page {
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    font-family:var(--font-body); background:var(--paper); color:var(--ink); min-height:100vh;
  }
  [data-theme="dark"] .map-page { --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; }
  body:has(.map-page) { background:#F7F6F3; }
  [data-theme="dark"] body:has(.map-page) { background:#000000; }
  .map-page, .map-page * { margin:0; padding:0; box-sizing:border-box; }
  .map-page a { color:inherit; text-decoration:none; }
  .map-page button { font-family:inherit; cursor:pointer; border:none; background:none; }

  .map-page header { display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.5rem; }
  .map-page .logo { font-family:var(--font-brand); font-weight:900; font-size:1.4rem; }
  .map-page .logo .va { color:var(--red); }
  .map-page .back-link { font-size:.9rem; font-weight:500; }
  .map-page .back-link:hover { color:var(--red); }

  .map-page .map-layout { display:flex; flex-direction:column; height:calc(100vh - 68px); }
  .map-page #vrm-map-canvas { flex:1; background:#ddd; min-height:280px; }

  .map-page .sheet {
    background:var(--white); border-radius:18px 18px 0 0; padding:1.4rem 1.6rem 2rem;
    box-shadow:0 -4px 20px rgba(0,0,0,.08);
  }
  .map-page .sheet-title { font-family:var(--font-display); font-weight:700; font-size:1.15rem; margin-bottom:.3rem; }
  .map-page .sheet-sub { font-size:.88rem; color:var(--muted); margin-bottom:.9rem; line-height:1.5; }
  .map-page .sheet-status { font-size:.85rem; padding:.55rem .8rem; border-radius:10px; background:var(--paper); margin-bottom:1rem; }
  .map-page .sheet-status.locked { color:var(--muted); }
  .map-page .sheet-status.unlocked { color:#1E6B3C; background:#EAF4EE; }
  .map-page .sheet-actions { display:flex; gap:.7rem; flex-wrap:wrap; }
  .map-page .map-btn {
    padding:.75rem 1.1rem; border-radius:10px; font-size:.9rem; font-weight:600; text-align:center;
    border:1px solid #E4E1DA; background:var(--paper); color:var(--ink); flex:1; min-width:140px;
  }
  .map-page .map-btn-primary { background:var(--red); border-color:var(--red); color:#fff; }
  .map-page .map-btn[disabled] { opacity:.5; pointer-events:none; }

  .map-page .pending-map { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1.1rem; background:linear-gradient(180deg, #f3ede9, #e5ddd8); }
  [data-theme="dark"] .map-page .pending-map { background:linear-gradient(180deg, #16181c, #000000); }

  .map-page .pending-globe-wrap { position:relative; width:150px; height:150px; }
  .map-page .pending-globe {
    width:150px; height:150px; border-radius:50%; overflow:hidden; position:relative;
    background: radial-gradient(circle at 35% 30%, #e8c9c9, #C41E3A 55%, #6e1020 100%);
    box-shadow: inset -14px -14px 30px rgba(0,0,0,.45), inset 8px 8px 18px rgba(255,255,255,.25), 0 8px 20px rgba(0,0,0,.2);
  }
  .map-page .pending-globe::before {
    /* Longitude stripes, animated horizontally to read as rotation on a sphere. */
    content:""; position:absolute; inset:0;
    background-image: repeating-linear-gradient(90deg, rgba(255,255,255,.35) 0 2px, transparent 2px 20px);
    animation: pending-globe-spin 3.5s linear infinite;
    mix-blend-mode: overlay;
  }
  .map-page .pending-globe::after {
    /* Latitude lines, static, curved via radial fade for a subtle sphere feel. */
    content:""; position:absolute; inset:0; border-radius:50%;
    background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.18) 0 1px, transparent 1px 26px);
    opacity:.6;
  }
  @keyframes pending-globe-spin {
    from { background-position:0 0; }
    to { background-position:-150px 0; }
  }

  .map-page .pending-pin-ring { position:absolute; top:58%; left:53%; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; border:2px solid #fff; opacity:0; animation:pending-ping 2.2s ease-out infinite; }
  .map-page .pending-pin-ring.r2 { animation-delay:.7s; }
  .map-page .pending-pin-dot { position:absolute; top:58%; left:53%; width:8px; height:8px; margin:-4px 0 0 -4px; border-radius:50%; background:#fff; box-shadow:0 0 4px rgba(0,0,0,.4); }
  .map-page .pending-map-label { font-size:.85rem; color:var(--muted); text-align:center; max-width:220px; line-height:1.5; }
  @keyframes pending-ping {
    0% { transform:scale(0.5); opacity:.9; }
    100% { transform:scale(2.8); opacity:0; }
  }
  @media (min-width: 860px) {
    .map-page .map-layout { flex-direction:row; }
    .map-page .sheet { width:380px; border-radius:0; box-shadow:none; border-left:1px solid #E4E1DA; overflow-y:auto; }
  }

  /* Dark theme (formerly public/js/varoom-dark-theme.css). */
  [data-theme="dark"] .map-page .sheet { background:#000000 !important; border-top:1px solid rgba(255,255,255,.12) !important; }
  [data-theme="dark"] .map-page .sheet-status { background:#16181c !important; color:var(--ink) !important; }
  [data-theme="dark"] .map-page .sheet-status.unlocked { background:rgba(30, 107, 60, .2) !important; color:#7cc99a !important; }
  [data-theme="dark"] .map-page .map-btn { background:transparent !important; border-color:rgba(255,255,255,.12) !important; color:var(--ink) !important; }
`;
