// Onboarding, Split design: a dark brand panel (steps and a live preview)
// beside a light form; on phones the panel becomes a dark header above the
// form sheet. The form side stays light in every theme so the split holds.

export const ONBOARDING_STYLES = `
  .onb{ --ink:#24211E; --muted:#5c584f; --soft:#6b665e; --line:#E4E1DA; --paper:#FBFAF8; --card:#FFFFFF; --panel:#171412; --panel-ink:#F4F1EC; --panel-muted:#a39c93; --red:#C41E3A; --red-bright:#E5384F; --red-deep:#8F1229; --ok:#1e7a4a; --bad:#a82038;
    min-height:100vh; min-height:100dvh; display:flex; font-family:Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color:var(--ink); background:var(--paper); color-scheme:light; }
  .onb *, .onb *::before, .onb *::after{ box-sizing:border-box; }
  .onb-panel{ flex:0 0 clamp(380px, 38vw, 520px); background:var(--panel); color:var(--panel-ink); padding:40px 48px; display:flex; flex-direction:column; gap:40px; position:sticky; top:0; height:100vh; height:100dvh; }
  .onb-logo{ font-family:Fraunces, Georgia, serif; font-weight:900; font-size:26px; letter-spacing:-0.04em; color:var(--panel-ink); text-decoration:none; }
  .onb-logo .va{ color:var(--red-bright); }
  .onb-steps{ margin:0; padding:0; list-style:none; display:flex; flex-direction:column; gap:14px; }
  .onb-step{ display:flex; align-items:center; gap:12px; font-size:14px; color:var(--panel-muted); }
  .onb-step-dot{ width:28px; height:28px; border-radius:50%; border:1.5px solid #4a443f; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
  .onb-step.is-current{ color:var(--panel-ink); font-weight:600; }
  .onb-step.is-current .onb-step-dot{ border-color:var(--red-bright); background:var(--red-bright); color:#fff; }
  .onb-step.is-done .onb-step-dot{ border-color:#4a443f; background:#2a2522; color:var(--panel-ink); }
  .onb-preview{ flex:1; display:flex; flex-direction:column; justify-content:center; gap:14px; min-height:0; }
  .onb-eyebrow{ margin:0; font-size:12px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--panel-muted); }
  .onb-panel-note{ margin:0; font-size:13px; color:var(--panel-muted); }
  .onb-mobile-title{ display:none; }

  .onb-card{ background:#fff; color:var(--ink); border-radius:20px; overflow:hidden; box-shadow:0 30px 60px -20px rgba(0,0,0,.6); }
  .onb-card-cover{ height:120px; background:linear-gradient(135deg, #C41E3A, #6e1022); }
  .onb-card-body{ padding:0 22px 22px; display:flex; flex-direction:column; gap:12px; }
  .onb-card-avatar{ position:relative; width:76px; height:76px; margin-top:-38px; border-radius:50%; border:4px solid #fff; background:#EAE7E1; overflow:hidden; display:flex; align-items:center; justify-content:center; }
  .onb-card-avatar img{ position:absolute; max-width:none; transform:translate(-50%,-50%); }
  .onb-card-avatar img.is-whole{ inset:0; width:100%; height:100%; object-fit:cover; transform:none; }
  .onb-card-name{ font-family:Fraunces, Georgia, serif; font-weight:700; font-size:22px; overflow-wrap:anywhere; }
  .onb-card-handle{ font-size:14px; color:var(--soft); overflow-wrap:anywhere; }
  .onb-chips{ display:flex; gap:8px; flex-wrap:wrap; }
  .onb-chip{ display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; background:#F3F1ED; font-size:12px; font-weight:600; color:var(--ink); }
  .onb-chip.is-empty{ color:#8a847d; }
  .onb-picks{ display:flex; flex-direction:column; gap:12px; padding:22px; border-radius:20px; background:#211d1a; border:1px solid #2e2925; }
  .onb-picks-title{ margin:0; font-family:Fraunces, Georgia, serif; font-size:20px; font-weight:700; }
  .onb-picks .onb-chip{ background:#2e2925; color:var(--panel-ink); }
  .onb-picks .onb-chip.is-empty{ color:var(--panel-muted); }

  .onb-main{ flex:1; min-width:0; display:flex; justify-content:center; align-items:center; padding:48px 32px; background:var(--paper); }
  /* The app's dark theme paints every <main> black; the form side stays light. */
  html[data-theme="dark"] .onb .onb-main{ background:var(--paper) !important; color:var(--ink); }
  .onb-form{ width:min(480px, 100%); display:flex; flex-direction:column; gap:24px; }
  .onb-heading{ display:flex; flex-direction:column; gap:10px; }
  .onb-heading h1{ margin:0; font-family:Fraunces, Georgia, serif; font-weight:700; font-size:clamp(34px, 3.4vw, 44px); line-height:1.05; letter-spacing:-0.02em; }
  .onb-heading p{ margin:0; font-size:16px; line-height:1.5; color:var(--muted); }
  .onb-field{ display:flex; flex-direction:column; gap:7px; }
  .onb-field > label, .onb-label{ font-size:13px; font-weight:600; color:var(--ink); }
  .onb-input{ display:flex; align-items:center; gap:10px; height:52px; padding:0 16px; background:var(--card); border:1.5px solid var(--line); border-radius:12px; transition:border-color .15s ease, box-shadow .15s ease; }
  .onb-input:focus-within{ border-color:var(--ink); box-shadow:0 0 0 4px rgba(196,30,58,.12); }
  .onb-input.is-invalid{ border-color:var(--bad); }
  .onb-input input{ flex:1; min-width:0; height:100%; border:0; outline:0; background:transparent; font:500 16px Inter, system-ui, sans-serif; color:var(--ink); }
  .onb-input input::placeholder{ color:#a39c93; font-weight:400; }
  .onb-prefix{ color:var(--soft); font-weight:500; }
  .onb-prefix.is-strong{ color:var(--ink); font-weight:600; }
  .onb-divider{ width:1px; height:20px; background:var(--line); }
  .onb-help{ margin:0; font-size:12px; color:var(--soft); }
  .onb-help.is-ok{ color:var(--ok); font-weight:600; }
  .onb-help.is-error{ color:var(--bad); font-weight:600; }
  .onb-spinner{ width:16px; height:16px; border:2px solid #d8d3cb; border-top-color:var(--ink); border-radius:50%; animation:onb-spin .7s linear infinite; flex-shrink:0; }
  @keyframes onb-spin{ to{ transform:rotate(360deg); } }

  .onb-photo{ display:flex; align-items:center; gap:16px; padding:14px 16px; border:1.5px dashed #cfcac1; border-radius:16px; background:var(--card); }
  .onb-photo.has-photo{ border-style:solid; border-color:var(--line); }
  .onb-photo-frame{ position:relative; width:96px; height:96px; flex-shrink:0; border-radius:50%; overflow:hidden; background:#F3F1ED; display:flex; align-items:center; justify-content:center; touch-action:none; }
  .onb-photo-frame.is-adjustable{ cursor:grab; }
  .onb-photo-frame.is-adjusting{ cursor:grabbing; }
  .onb-photo-frame img{ position:absolute; max-width:none; user-select:none; -webkit-user-drag:none; transform:translate(-50%,-50%); pointer-events:none; }
  .onb-photo-frame img.is-whole{ inset:0; width:100%; height:100%; object-fit:cover; transform:none; }
  .onb-photo-copy{ display:flex; flex-direction:column; gap:4px; min-width:0; }
  .onb-photo-title{ font-weight:600; font-size:15px; }
  .onb-photo-actions{ display:flex; gap:12px; flex-wrap:wrap; margin-top:4px; }
  .onb-link-btn{ padding:0; border:0; background:none; font:600 13px Inter, system-ui, sans-serif; color:var(--red-deep); cursor:pointer; text-decoration:underline; text-underline-offset:2px; }
  .onb-link-btn:hover{ color:#5e0c1b; }

  .onb-options{ display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px; }
  .onb-option{ display:flex; align-items:center; gap:12px; min-height:58px; padding:12px 14px; border-radius:14px; border:1.5px solid var(--line); background:var(--card); text-align:left; font:inherit; color:var(--ink); cursor:pointer; transition:border-color .15s ease, background .15s ease; }
  .onb-option:hover{ border-color:#bdb7ad; }
  .onb-option:focus-visible{ outline:3px solid rgba(196,30,58,.35); outline-offset:2px; }
  .onb-option.is-selected{ border-color:var(--red); }
  .onb-option.is-wide{ grid-column:1 / -1; }
  .onb-option-copy{ flex:1; display:flex; flex-direction:column; gap:2px; min-width:0; }
  .onb-option-title{ font-weight:600; font-size:15px; }
  .onb-option-desc{ font-size:12px; color:var(--soft); }
  .onb-check{ width:22px; height:22px; border-radius:7px; border:1.5px solid #cfcac1; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .onb-option.is-selected .onb-check{ border-color:var(--red); background:var(--red); color:#fff; }
  .onb-radio{ width:20px; height:20px; border-radius:50%; border:1.5px solid #cfcac1; flex-shrink:0; }
  .onb-option.is-selected .onb-radio{ border:6px solid var(--red); }
  .onb-icon{ width:36px; height:36px; border-radius:10px; background:#F3F1ED; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink); }
  .onb-option.is-selected .onb-icon{ background:#fbe8eb; color:var(--red-deep); }

  .onb-primary{ height:54px; border:0; border-radius:14px; background:var(--ink); color:#fff; font:600 16px Inter, system-ui, sans-serif; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; transition:opacity .15s ease; }
  .onb-primary:disabled{ opacity:.45; cursor:not-allowed; }
  .onb-primary:not(:disabled):hover{ background:#000; }
  .onb-footnote{ margin:-10px 0 0; text-align:center; font-size:12px; color:var(--soft); }
  .onb-back{ align-self:center; }
  .onb-alert{ margin:0; padding:12px 14px; border-radius:12px; background:#fbe8eb; color:var(--bad); font-size:14px; font-weight:500; }
  .onb-loading{ flex:1; display:flex; align-items:center; justify-content:center; }

  @media (max-width: 900px){
    .onb{ flex-direction:column; background:var(--panel); }
    .onb-panel{ position:static; height:auto; flex:none; padding:22px 20px 26px; gap:14px; }
    .onb-panel-top{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .onb-logo{ font-size:22px; }
    .onb-steps, .onb-preview, .onb-panel-note{ display:none; }
    .onb-mobile-step{ font-size:12px; color:var(--panel-muted); }
    .onb-mobile-title{ display:block; margin:6px 0 0; font-family:Fraunces, Georgia, serif; font-weight:700; font-size:30px; line-height:1.1; letter-spacing:-0.02em; color:var(--panel-ink); }
    .onb-main{ flex:1; align-items:flex-start; padding:24px 20px 32px; border-radius:24px 24px 0 0; }
    .onb-heading h1{ display:none; }
    .onb-heading p{ font-size:14px; }
    .onb-form{ gap:20px; }
  }
  @media (min-width: 901px){ .onb-mobile-step{ display:none; } }
  /* Laptops (often 640–800 px tall with display scaling): each step fits without scrolling. */
  @media (min-width: 901px) and (max-height: 860px){
    .onb-panel{ padding:28px 40px; gap:24px; }
    .onb-card-cover{ height:88px; }
    .onb-main{ padding:24px 32px; align-items:safe center; }
    .onb-form{ gap:16px; }
    .onb-heading{ gap:6px; }
    .onb-heading h1{ font-size:clamp(30px, 2.8vw, 36px); }
    .onb-heading p{ font-size:15px; }
    .onb-field{ gap:5px; }
    .onb-input{ height:46px; }
    .onb-photo{ padding:10px 14px; gap:14px; }
    .onb-photo-frame{ width:72px; height:72px; }
    .onb-option{ min-height:50px; padding:9px 12px; }
    .onb-icon{ width:32px; height:32px; }
    .onb-primary{ height:48px; }
  }
  @media (min-width: 901px) and (max-height: 700px){
    .onb-panel{ padding:22px 36px; gap:18px; }
    .onb-card-cover{ height:72px; }
    .onb-main{ padding:16px 32px; }
    .onb-form{ gap:12px; }
    .onb-heading h1{ font-size:28px; }
    .onb-heading p{ font-size:14px; }
    .onb-input{ height:44px; }
    .onb-photo{ padding:8px 12px; }
    .onb-photo-frame{ width:60px; height:60px; }
    .onb-option{ min-height:46px; padding:7px 12px; }
    .onb-option-desc{ font-size:11.5px; }
    .onb-help{ font-size:11.5px; }
    .onb-primary{ height:46px; }
    .onb-footnote{ margin-top:-6px; }
  }
  @media (max-width: 520px){
    .onb-options{ grid-template-columns:minmax(0, 1fr); }
    .onb-photo-frame{ width:80px; height:80px; }
  }
  @media (prefers-reduced-motion: reduce){ .onb-spinner{ animation:none; } }
`;
