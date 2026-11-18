// Onboarding: one light column centred on the page (no side panel), light in
// every theme. Each step sits under a back arrow and a progress bar; what people list or
// look for is picked from photo tiles. Motion follows animation.md (C4 step
// slides, B9 progress, B4 press, B3 stagger) with a reduced-motion fallback.

export const ONBOARDING_STYLES = `
  .onb{ --ink:#24211E; --muted:#5c584f; --soft:#6b665e; --line:#E4E1DA; --paper:#FBFAF8; --card:#FFFFFF; --red:#C41E3A; --red-deep:#8F1229; --ok:#1e7a4a; --bad:#a82038;
    min-height:100vh; min-height:100dvh; display:flex; font-family:Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color:var(--ink); background:var(--paper); color-scheme:light; }
  .onb *, .onb *::before, .onb *::after{ box-sizing:border-box; }

  .onb-main{ flex:1; min-width:0; min-height:100vh; min-height:100dvh; display:flex; justify-content:center; align-items:center; padding:48px 32px; background:var(--paper); }
  /* The app's dark theme paints every <main> black; the form side stays light. */
  html[data-theme="dark"] .onb .onb-main{ background:var(--paper) !important; color:var(--ink); }
  .onb-flow{ width:min(480px, 100%); display:flex; flex-direction:column; gap:22px; }
  .onb-flow.is-wide{ width:min(640px, 100%); }
  .onb-topbar{ display:flex; align-items:center; gap:14px; }
  .onb-back-arrow{ width:40px; height:40px; margin-left:-8px; flex-shrink:0; border:0; border-radius:50%; background:transparent; color:var(--ink); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  .onb-back-arrow:active{ transform:scale(var(--press-scale,.97)); }
  .onb-back-arrow:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }
  @media (hover:hover){ .onb-back-arrow:hover{ background:#EFEBE5; } }
  .onb-progress{ flex:1; height:4px; border-radius:999px; background:var(--line); overflow:hidden; }
  .onb-progress-fill{ display:block; height:100%; border-radius:inherit; background:var(--red); transform-origin:left center; transition:transform var(--motion-standard,250ms) var(--ease-in-out,ease-in-out); }
  .onb-stage.is-forward{ animation:onb-in-right var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .onb-stage.is-back{ animation:onb-in-left var(--motion-standard,250ms) var(--ease-out,ease) both; }
  @keyframes onb-in-right{ from{ opacity:0; transform:translateX(24px); } to{ opacity:1; transform:none; } }
  @keyframes onb-in-left{ from{ opacity:0; transform:translateX(-24px); } to{ opacity:1; transform:none; } }
  .onb-form{ width:100%; display:flex; flex-direction:column; gap:24px; }
  .onb-sheet{ display:flex; flex-direction:column; gap:18px; padding:24px; background:var(--card); border:1px solid var(--line); border-radius:22px; box-shadow:0 1px 2px rgba(36,33,30,.04), 0 18px 40px -24px rgba(36,33,30,.28); }
  .onb-sheet .onb-input{ background:var(--paper); }
  .onb-sheet .onb-input:focus-within{ background:var(--card); }
  .onb-actions{ position:sticky; bottom:0; z-index:2; display:flex; flex-direction:column; gap:10px; margin-top:-6px; padding:12px 0 calc(4px + env(safe-area-inset-bottom)); background:linear-gradient(to top, var(--paper) 72%, rgba(251,250,248,0)); }
  .onb-heading{ display:flex; flex-direction:column; gap:10px; }
  .onb-heading h1{ margin:0; font-family:Fraunces, Georgia, serif; font-weight:700; font-size:clamp(34px, 3.4vw, 44px); line-height:1.05; letter-spacing:-0.02em; }
  .onb-heading p{ margin:0; font-size:1rem; line-height:1.5; color:var(--muted); }
  .onb-field{ display:flex; flex-direction:column; gap:7px; }
  .onb-field > label, .onb-label{ font-size:0.8125rem; font-weight:600; color:var(--ink); }
  .onb-input{ display:flex; align-items:center; gap:10px; height:52px; padding:0 16px; background:var(--card); border:1.5px solid var(--line); border-radius:12px; transition:border-color .15s ease, box-shadow .15s ease; }
  .onb-input:focus-within{ border-color:var(--ink); box-shadow:0 0 0 4px rgba(196,30,58,.12); }
  .onb-input.is-invalid{ border-color:var(--bad); }
  .onb-input input{ flex:1; min-width:0; height:100%; border:0; outline:0; background:transparent; font:500 1rem Inter, system-ui, sans-serif; color:var(--ink); }
  .onb-input input::placeholder{ color:#a39c93; font-weight:400; }
  .onb-prefix{ color:var(--soft); font-weight:500; }
  .onb-prefix.is-strong{ color:var(--ink); font-weight:600; }
  .onb-divider{ width:1px; height:20px; background:var(--line); }
  .onb-help{ margin:0; font-size:0.75rem; color:var(--soft); }
  .onb-help.is-ok{ color:var(--ok); font-weight:600; }
  .onb-help.is-error{ color:var(--bad); font-weight:600; }
  .onb-spinner{ width:16px; height:16px; border:2px solid #d8d3cb; border-top-color:var(--ink); border-radius:50%; animation:onb-spin .7s linear infinite; flex-shrink:0; }
  @keyframes onb-spin{ to{ transform:rotate(360deg); } }

  .onb-photo{ display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .onb-photo-ring{ position:relative; }
  .onb-photo-frame{ position:relative; width:104px; height:104px; flex-shrink:0; border-radius:50%; overflow:hidden; background:#F3F1ED; display:flex; align-items:center; justify-content:center; touch-action:none; cursor:pointer; box-shadow:0 0 0 1px var(--line); }
  .onb-photo.has-photo .onb-photo-frame{ box-shadow:0 0 0 3px var(--card), 0 0 0 4px var(--line); }
  .onb-photo-badge{ position:absolute; right:-2px; bottom:-2px; width:34px; height:34px; border-radius:50%; border:3px solid var(--card); background:var(--ink); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  .onb-photo-badge svg{ width:15px; height:15px; }
  .onb-photo-badge:active{ transform:scale(var(--press-scale,.97)); }
  .onb-photo-badge:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }
  .onb-optional{ font-weight:500; color:var(--soft); }
  .onb-photo-frame.is-adjustable{ cursor:grab; }
  .onb-photo-frame.is-adjusting{ cursor:grabbing; }
  .onb-photo-frame img{ position:absolute; max-width:none; user-select:none; -webkit-user-drag:none; transform:translate(-50%,-50%); pointer-events:none; }
  .onb-photo-frame img.is-whole{ inset:0; width:100%; height:100%; object-fit:cover; transform:none; }
  .onb-photo-copy{ display:flex; flex-direction:column; align-items:center; gap:4px; min-width:0; }
  .onb-photo-title{ font-weight:600; font-size:0.9375rem; }
  .onb-photo-actions{ display:flex; justify-content:center; gap:12px; flex-wrap:wrap; margin-top:2px; }
  .onb-link-btn{ padding:0; border:0; background:none; font:600 0.8125rem Inter, system-ui, sans-serif; color:var(--red-deep); cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
  .onb-link-btn:hover{ color:#5e0c1b; }

  .onb-tiles{ display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:16px 14px; }
  .onb-tile{ grid-column:span 2; display:flex; flex-direction:column; gap:8px; padding:0; border:0; background:none; font:inherit; color:var(--ink); text-align:center; cursor:pointer; -webkit-tap-highlight-color:transparent;
    animation:onb-tile-in var(--motion-standard,250ms) var(--ease-out,ease) both; animation-delay:calc(var(--onb-i, 0) * 30ms); transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  /* Hosts' five tiles sit in one row. */
  .onb-tiles.is-5{ grid-template-columns:repeat(5, minmax(0, 1fr)); gap:12px; }
  .onb-tiles.is-5 .onb-tile{ grid-column:auto; }
  .onb-tile:active{ transform:scale(var(--press-scale,.97)); }
  .onb-tile:focus-visible{ outline:none; }
  .onb-tile:focus-visible .onb-tile-media{ box-shadow:0 0 0 3px var(--paper), 0 0 0 6px rgba(196,30,58,.45); }
  .onb-tile-media{ position:relative; display:block; aspect-ratio:1 / 1; border-radius:18px; overflow:hidden; background:#EAE7E1; box-shadow:0 0 0 0 transparent; transition:box-shadow var(--motion-micro,150ms) var(--ease-out,ease); }
  .onb-tile-media img{ display:block; width:100%; height:100%; object-fit:cover; transition:transform var(--motion-emphasis,300ms) var(--ease-out,ease), filter var(--motion-micro,150ms) var(--ease-out,ease); }
  .onb-tile-media::after{ content:''; position:absolute; inset:0; background:linear-gradient(to bottom, rgba(0,0,0,.18), rgba(0,0,0,0) 40%); pointer-events:none; }
  @media (hover:hover){ .onb-tile:hover .onb-tile-media img{ transform:scale(1.04); } }
  .onb-tiles.is-5 .onb-tile-media{ aspect-ratio:3 / 4; border-radius:16px; }
  .onb-tiles.is-5 .onb-tile-label{ font-size:0.875rem; }
  .onb-tile.is-selected .onb-tile-media{ box-shadow:0 0 0 3px var(--paper), 0 0 0 6px var(--red); }
  .onb-tile.is-selected .onb-tile-media img{ filter:brightness(.88); }
  .onb-tile-check{ position:absolute; top:10px; right:10px; z-index:1; width:28px; height:28px; border-radius:50%; border:2px solid rgba(255,255,255,.95); background:rgba(0,0,0,.18); color:#fff; display:flex; align-items:center; justify-content:center;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), border-color var(--motion-micro,150ms) var(--ease-out,ease); }
  .onb-tile-check svg{ transform:scale(.4); opacity:0; transition:transform var(--motion-quick,200ms) var(--ease-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease); }
  .onb-tile.is-selected .onb-tile-check{ background:var(--red); border-color:var(--red); }
  .onb-tile.is-selected .onb-tile-check svg{ transform:none; opacity:1; }
  .onb-tile-label{ font-weight:600; font-size:0.9375rem; line-height:1.25; }
  .onb-tile.is-selected .onb-tile-label{ color:var(--red-deep); }
  @keyframes onb-tile-in{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }

  .onb-primary{ height:54px; border:0; border-radius:999px; background:var(--red); color:#fff; font:600 1rem Inter, system-ui, sans-serif; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  .onb-primary:disabled{ background:#E7E3DC; color:#6b665e; cursor:not-allowed; }
  .onb-primary:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  .onb-primary:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }
  @media (hover:hover){ .onb-primary:not(:disabled):hover{ background:var(--red-deep); } }
  .onb-footnote{ margin:0; text-align:center; font-size:0.75rem; color:var(--soft); }
  .onb-alert{ margin:0; padding:12px 14px; border-radius:12px; background:#fbe8eb; color:var(--bad); font-size:0.875rem; font-weight:500; }
  .onb-upload-note{ display:flex; align-items:center; gap:8px; }
  .onb-upload-failed{ display:flex; flex-direction:column; gap:6px; }
  .onb-loading{ flex:1; display:flex; align-items:center; justify-content:center; }

  @media (max-width: 900px){
    .onb-main{ align-items:flex-start; padding:20px 20px 32px; }
    .onb-heading h1{ font-size:1.875rem; }
    .onb-heading p{ font-size:0.875rem; }
    .onb-form{ gap:20px; }
  }
  /* Laptops (often 640–800 px tall with display scaling): each step fits without scrolling. */
  @media (min-width: 901px) and (max-height: 860px){
    .onb-main{ padding:24px 32px; align-items:safe center; }
    .onb-form{ gap:16px; }
    .onb-heading{ gap:6px; }
    .onb-heading h1{ font-size:clamp(30px, 2.8vw, 36px); }
    .onb-heading p{ font-size:0.9375rem; }
    .onb-field{ gap:5px; }
    .onb-input{ height:46px; }
    .onb-flow{ gap:16px; }
    .onb-sheet{ padding:18px 22px; gap:14px; }
    .onb-photo{ gap:8px; }
    .onb-photo-frame{ width:72px; height:72px; }
    .onb-tile-media{ aspect-ratio:5 / 4; }
    .onb-tiles{ gap:12px; }
    .onb-primary{ height:48px; }
  }
  @media (min-width: 901px) and (max-height: 700px){
    .onb-main{ padding:16px 32px; }
    .onb-form{ gap:12px; }
    .onb-heading h1{ font-size:1.75rem; }
    .onb-heading p{ font-size:0.875rem; }
    .onb-input{ height:44px; }
    .onb-flow{ gap:12px; }
    .onb-sheet{ padding:14px 20px; gap:12px; }
    .onb-photo-frame{ width:60px; height:60px; }
    .onb-photo-badge{ width:28px; height:28px; }
    .onb-tile-media{ aspect-ratio:3 / 2; border-radius:14px; }
    .onb-tiles.is-5 .onb-tile-media{ aspect-ratio:1 / 1; }
    .onb-tiles{ gap:10px; }
    .onb-tile{ gap:5px; }
    .onb-tile-label{ font-size:0.875rem; }
    .onb-help{ font-size:0.7188rem; }
    .onb-primary{ height:46px; }
  }
  @media (max-width: 520px){
    .onb-tiles{ grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px 12px; }
    .onb-tiles.is-5{ grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px 12px; }
    .onb-tiles .onb-tile, .onb-tiles.is-5 .onb-tile{ grid-column:span 2; }
    .onb-tiles.is-5 .onb-tile:nth-child(5){ grid-column:2 / span 2; }
    .onb-tile-media, .onb-tiles.is-5 .onb-tile-media{ aspect-ratio:4 / 5; border-radius:16px; }
    .onb-tiles.is-5 .onb-tile-label{ font-size:0.9375rem; }
    .onb-sheet{ padding:20px 16px; border-radius:20px; }
    .onb-photo-frame{ width:88px; height:88px; }
  }
  @media (prefers-reduced-motion: reduce){
    .onb-spinner{ animation:none; }
    .onb-stage.is-forward, .onb-stage.is-back, .onb-tile{ animation:none; }
    .onb-progress-fill, .onb-tile, .onb-tile-media, .onb-tile-media img, .onb-tile-check, .onb-tile-check svg, .onb-primary, .onb-back-arrow, .onb-photo-badge{ transition:none; }
    .onb-tile:active, .onb-primary:not(:disabled):active, .onb-back-arrow:active, .onb-photo-badge:active{ transform:none; }
    .onb-tile:hover .onb-tile-media img{ transform:none; }
  }
`;
