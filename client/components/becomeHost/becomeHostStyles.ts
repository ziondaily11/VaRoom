// Become a Host: the onboarding cards in a panel over Client Home (a full
// screen on phones), and the converting screen's messages. Light in every
// theme, like onboarding. Motion follows animation.md with a reduced-motion
// fallback.

export const BECOME_HOST_STYLES = `
  .bh-layer{ position:fixed; inset:0; z-index:1200; display:flex; align-items:center; justify-content:center; padding:24px;
    background:rgba(20,16,14,.42); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px);
    animation:bh-fade-in var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .bh-layer.is-closing{ animation:bh-fade-out 320ms var(--ease-in,ease) both; }
  .bh-panel{ position:relative; width:min(720px, 100%); max-height:calc(100dvh - 48px); overflow-y:auto; overscroll-behavior:contain; border-radius:28px;
    background:#FBFAF8; box-shadow:0 24px 80px rgba(0,0,0,.28); outline:none; animation:bh-rise var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .bh-panel .onb, .bh-panel .onb-main{ min-height:0; }
  .bh-panel .onb{ border-radius:inherit; }
  .bh-panel .onb-main{ padding:44px 40px 36px; border-radius:inherit; }
  .bh-close{ position:absolute; top:14px; right:14px; z-index:2; width:40px; height:40px; border:0; border-radius:50%; background:transparent; color:#24211E;
    display:flex; align-items:center; justify-content:center; cursor:pointer; transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .bh-close:hover{ background:#EFEBE5; } }
  .bh-close:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }
  .bh-note{ margin:0; font-size:.8125rem; color:var(--soft); text-align:center; }
  .bh-or{ margin:0; text-align:center; font-size:.8125rem; color:var(--soft); }
  .bh-secondary{ height:50px; border:1px solid var(--line); border-radius:999px; background:#fff; color:var(--ink); font:600 .9375rem Inter, system-ui, sans-serif; cursor:pointer;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  .bh-secondary:disabled{ color:var(--soft); cursor:not-allowed; }
  @media (hover:hover){ .bh-secondary:not(:disabled):hover{ background:#F3F1ED; } }
  .bh-secondary:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }

  .bh-converting{ min-height:320px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; text-align:center; }
  .bh-mark{ width:60px; height:60px; border-radius:50%; border:3px solid #EFEBE5; border-top-color:var(--red); animation:bh-spin 900ms linear infinite; }
  .bh-mark.is-done{ border-color:var(--ok); animation:none; display:flex; align-items:center; justify-content:center; color:var(--ok); }
  .bh-mark.is-stopped{ animation:none; border-top-color:#EFEBE5; }
  .bh-phase{ margin:0; font-family:Fraunces, Georgia, serif; font-weight:700; font-size:1.625rem; line-height:1.2; letter-spacing:-.01em; color:var(--ink);
    animation:bh-phase-in 420ms var(--ease-out,ease) both; }
  .bh-steps{ list-style:none; display:flex; gap:8px; margin:0; padding:0; }
  .bh-steps li{ width:28px; height:4px; border-radius:999px; background:#E7E3DC; transition:background-color 300ms var(--ease-out,ease); }
  .bh-steps li.is-active{ background:rgba(196,30,58,.45); }
  .bh-steps li.is-done{ background:var(--red); }
  .bh-failure{ display:flex; flex-direction:column; gap:10px; width:min(420px, 100%); }
  .bh-failure-actions{ display:flex; gap:10px; justify-content:center; }
  .bh-failure-actions button{ flex:1; }

  @keyframes bh-fade-in{ from{ opacity:0; } to{ opacity:1; } }
  @keyframes bh-fade-out{ from{ opacity:1; } to{ opacity:0; } }
  @keyframes bh-rise{ from{ opacity:0; transform:translateY(16px) scale(.98); } to{ opacity:1; transform:none; } }
  @keyframes bh-phase-in{ from{ opacity:0; transform:translateY(8px); filter:blur(2px); } to{ opacity:1; transform:none; filter:none; } }
  @keyframes bh-spin{ to{ transform:rotate(360deg); } }

  @media (max-width: 640px){
    .bh-layer{ padding:0; align-items:stretch; }
    .bh-panel{ width:100%; height:100dvh; max-height:none; border-radius:0; }
    .bh-panel .onb-main{ padding:60px 20px 32px; }
  }
  @media (prefers-reduced-motion: reduce){
    .bh-layer, .bh-layer.is-closing, .bh-panel, .bh-phase{ animation-duration:1ms; }
    .bh-mark{ animation:none; }
  }
`;
