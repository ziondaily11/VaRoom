// Styles for the location map (components/maps): the map panel used by the
// map card and the /map page, and the card itself. Scoped under .vr-loc and
// .vr-loc-layer; rendered only while a map is on screen. Motion follows
// animation.md: the card scales from .95 at the link that opened it (desktop)
// or slides up (phones), 250 ms in and 200 ms out; reduced motion fades only.

export const LOCATION_PANEL_STYLES = `
  .vr-loc {
    --loc-red:#C41E3A; --loc-ink:#24211E; --loc-muted:#6b665d; --loc-glass:rgba(255,255,255,.9); --loc-line:rgba(36,33,30,.1);
    --il-land:#EFEBE4; --il-block:#E4DED4; --il-park:#D3E5C8; --il-water:#C3DCEA; --il-road:#FFFFFF; --il-major:#FBF4E6; --il-major-edge:#E8DCC4; --il-ring:rgba(36,33,30,.07);
    position:relative; width:100%; height:100%; overflow:hidden; color:var(--loc-ink); font-family:inherit;
    -webkit-tap-highlight-color:transparent;
  }
  [data-theme="dark"] .vr-loc {
    --loc-ink:#E7E9EA; --loc-muted:#8b9096; --loc-glass:rgba(22,24,28,.88); --loc-line:rgba(255,255,255,.12);
    --il-land:#17191d; --il-block:#1e2126; --il-park:#1b2a20; --il-water:#132430; --il-road:#2a2e35; --il-major:#33373f; --il-major-edge:#3b4049; --il-ring:rgba(255,255,255,.05);
  }
  .vr-loc *, .vr-loc *::before, .vr-loc *::after { box-sizing:border-box; }
  .vr-loc button { font:inherit; }

  .vr-loc-map { position:absolute; inset:0; }
  .vr-loc-live { position:absolute; inset:0; opacity:0; pointer-events:none; transition:opacity var(--motion-standard, 250ms) var(--ease-out, ease-out); }
  .vr-loc-live.is-live { opacity:1; pointer-events:auto; }

  /* The drawn map: zoom and drag. */
  .vr-loc-illustration { position:absolute; inset:0; overflow:hidden; background:var(--il-land); cursor:grab; touch-action:none; user-select:none; }
  .vr-loc-illustration.is-dragging { cursor:grabbing; }
  .vr-loc-canvas { position:absolute; inset:-20%; transform-origin:50% 50%; transition:transform var(--motion-quick, 200ms) var(--ease-out, ease-out); will-change:transform; }
  .vr-loc-illustration.is-dragging .vr-loc-canvas, .vr-loc-illustration.is-dragging .vr-loc-marker { transition:none; }
  .vr-loc-art { width:100%; height:100%; display:block; }
  .vr-loc-art .il-land { fill:var(--il-land); }
  .vr-loc-art .il-block { fill:var(--il-block); }
  .vr-loc-art .il-park { fill:var(--il-park); }
  .vr-loc-art .il-water { fill:var(--il-water); }
  .vr-loc-art .il-road { fill:none; stroke:var(--il-road); stroke-width:14; stroke-linecap:round; }
  .vr-loc-art .il-road-major { stroke:var(--il-major); stroke-width:26; paint-order:stroke; filter:drop-shadow(0 0 1.5px var(--il-major-edge)); }
  .vr-loc-art .il-ring { fill:none; stroke:var(--il-ring); stroke-width:3; stroke-dasharray:10 12; }
  .vr-loc-marker { position:absolute; left:50%; top:50%; pointer-events:none; }
  .vr-loc-marker.is-exact { width:44px; height:55px; margin:-55px 0 0 -22px; transform-origin:50% 100%; transform:scale(calc(1 / var(--vr-zoom, 1))); transition:transform var(--motion-quick, 200ms) var(--ease-out, ease-out); animation:vr-loc-drop var(--motion-emphasis, 300ms) var(--ease-out, ease-out) both; }
  .vr-loc-pin { width:100%; height:100%; display:block; filter:drop-shadow(0 6px 10px rgba(0,0,0,.22)); }
  .vr-loc-pin .pin-body { fill:var(--loc-red); }
  .vr-loc-pin .pin-dot { fill:#fff; }
  .vr-loc-marker.is-area { width:0; height:0; }
  .vr-loc-area { position:absolute; width:180px; height:180px; left:-90px; top:-90px; border-radius:50%; background:rgba(196,30,58,.14); border:1.5px solid rgba(196,30,58,.45); animation:vr-loc-fade var(--motion-emphasis, 300ms) var(--ease-out, ease-out) both; }
  @keyframes vr-loc-drop { from { opacity:0; transform:translateY(-10px); } }
  @keyframes vr-loc-fade { from { opacity:0; transform:scale(.9); } }

  .vr-loc-zoom { position:absolute; right:14px; bottom:14px; display:flex; flex-direction:column; border-radius:12px; overflow:hidden; background:var(--loc-glass); box-shadow:0 2px 10px rgba(0,0,0,.12); border:1px solid var(--loc-line); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }
  .vr-loc-zoom button { width:40px; height:40px; border:0; background:transparent; color:var(--loc-ink); font-size:1.25rem; line-height:1; cursor:pointer; transition:background var(--motion-micro, 150ms) var(--ease-out, ease-out); }
  .vr-loc-zoom button + button { border-top:1px solid var(--loc-line); }
  .vr-loc-zoom button:hover:not(:disabled) { background:rgba(127,127,127,.12); }
  .vr-loc-zoom button:disabled { opacity:.35; cursor:default; }

  .vr-loc-notice { position:absolute; left:50%; bottom:16px; transform:translateX(-50%); width:max-content; max-width:min(360px, calc(100% - 96px)); display:flex; flex-direction:column; gap:2px; padding:10px 14px; border-radius:14px; background:var(--loc-glass); border:1px solid var(--loc-line); box-shadow:0 4px 16px rgba(0,0,0,.1); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); font-size:.82rem; line-height:1.4; color:var(--loc-muted); text-align:center; animation:vr-loc-fade var(--motion-standard, 250ms) var(--ease-out, ease-out) both; }
  .vr-loc-notice strong { color:var(--loc-ink); font-size:.86rem; font-weight:600; }
  /* Narrow maps: the note sits left of the zoom buttons. */
  @media (max-width: 640px) {
    .vr-loc-notice { left:14px; right:68px; width:auto; max-width:none; transform:none; text-align:left; }
  }

  /* Label (top left) and the card's controls (top right). */
  .vr-loc-top { position:absolute; left:14px; right:14px; top:14px; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; pointer-events:none; }
  .vr-loc-top > * { pointer-events:auto; }
  .vr-loc-label { display:flex; flex-direction:column; gap:1px; min-width:0; max-width:min(420px, 100%); padding:9px 13px; border-radius:14px; background:var(--loc-glass); border:1px solid var(--loc-line); box-shadow:0 4px 16px rgba(0,0,0,.1); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); }
  .vr-loc-label-title { font-size:.92rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .vr-loc-label-status { font-size:.76rem; color:var(--loc-muted); }
  .vr-loc-label-status.unlocked { color:#1E6B3C; }
  [data-theme="dark"] .vr-loc-label-status.unlocked { color:#7cc99a; }
  .vr-loc-visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

  .vr-loc-problem { position:absolute; left:50%; top:50%; transform:translate(-50%, -50%); width:min(340px, calc(100% - 40px)); display:flex; flex-direction:column; align-items:center; gap:8px; padding:22px 20px; border-radius:18px; text-align:center; background:var(--loc-glass); border:1px solid var(--loc-line); box-shadow:0 10px 30px rgba(0,0,0,.14); backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px); }
  .vr-loc-problem-icon { width:44px; height:44px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--loc-red); background:rgba(196,30,58,.1); }
  .vr-loc-problem strong { font-size:1rem; }
  .vr-loc-problem p { margin:0; font-size:.86rem; line-height:1.5; color:var(--loc-muted); }
  .vr-loc-retry { margin-top:6px; padding:9px 18px; border:0; border-radius:999px; background:var(--loc-red); color:#fff; font-weight:600; cursor:pointer; transition:transform var(--motion-press, 120ms) var(--ease-out, ease-out); }
  .vr-loc-retry:active { transform:scale(var(--press-scale, .97)); }

  @media (prefers-reduced-motion: reduce) {
    .vr-loc-canvas, .vr-loc-live { transition:opacity var(--motion-quick, 200ms) linear; }
    .vr-loc-marker.is-exact, .vr-loc-area, .vr-loc-notice { animation-name:vr-loc-fade-only; }
    @keyframes vr-loc-fade-only { from { opacity:0; } }
  }
`;

export const LOCATION_CARD_STYLES = `
  .vr-loc-layer { position:fixed; inset:0; z-index:100050; }
  .vr-loc-scrim { position:absolute; inset:0; background:rgba(20,16,14,.42); animation:vr-loc-scrim-in var(--motion-standard, 250ms) var(--ease-out, ease-out) both; }
  [data-theme="dark"] .vr-loc-scrim { background:rgba(0,0,0,.6); }
  .vr-loc-card {
    position:absolute; inset:0; margin:auto; width:min(960px, calc(100vw - 48px)); height:min(680px, calc(100dvh - 48px));
    border-radius:22px; overflow:hidden; background:#EFEBE4; box-shadow:0 24px 70px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.04);
    animation:vr-loc-card-in var(--motion-standard, 250ms) var(--ease-out, ease-out) both;
  }
  [data-theme="dark"] .vr-loc-card { background:#17191d; box-shadow:0 24px 70px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08); }
  .vr-loc-close { width:40px; height:40px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; border-radius:50%; border:1px solid var(--loc-line); background:var(--loc-glass); color:var(--loc-ink); box-shadow:0 4px 16px rgba(0,0,0,.12); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); cursor:pointer; transition:transform var(--motion-press, 120ms) var(--ease-out, ease-out), background var(--motion-micro, 150ms) var(--ease-out, ease-out); }
  .vr-loc-close:hover { background:var(--loc-glass); filter:brightness(.97); }
  .vr-loc-close:active { transform:scale(var(--press-scale, .97)); }
  .vr-loc-close:focus-visible { outline:2px solid var(--loc-red); outline-offset:2px; }
  .vr-loc-layer.is-closing { pointer-events:none; }
  .vr-loc-layer.is-closing .vr-loc-scrim { animation:vr-loc-scrim-out 200ms var(--ease-in, ease-in) both; }
  .vr-loc-layer.is-closing .vr-loc-card { animation:vr-loc-card-out 200ms var(--ease-in, ease-in) both; }
  @keyframes vr-loc-scrim-in { from { opacity:0; } }
  @keyframes vr-loc-scrim-out { to { opacity:0; } }
  @keyframes vr-loc-card-in { from { opacity:0; transform:scale(.95); } }
  @keyframes vr-loc-card-out { to { opacity:0; transform:scale(.95); } }

  /* Phones: a sheet from the bottom. */
  @media (max-width: 640px) {
    .vr-loc-card { inset:auto 0 0 0; margin:0; width:100%; height:calc(100dvh - 56px); border-radius:22px 22px 0 0; animation-name:vr-loc-sheet-in; }
    .vr-loc-layer.is-closing .vr-loc-card { animation-name:vr-loc-sheet-out; }
    .vr-loc-card .vr-loc-zoom, .vr-loc-card .vr-loc-notice { bottom:calc(14px + env(safe-area-inset-bottom)); }
    @keyframes vr-loc-sheet-in { from { transform:translateY(100%); } }
    @keyframes vr-loc-sheet-out { to { transform:translateY(100%); } }
  }

  @media (prefers-reduced-motion: reduce) {
    .vr-loc-card { animation-name:vr-loc-fade-in-only; }
    .vr-loc-layer.is-closing .vr-loc-card { animation-name:vr-loc-fade-out-only; }
    @keyframes vr-loc-fade-in-only { from { opacity:0; } }
    @keyframes vr-loc-fade-out-only { to { opacity:0; } }
  }
`;
