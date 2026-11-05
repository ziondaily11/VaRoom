// Styles for /settings, ported from legacy-pages/settings.html and scoped
// under .settings-page. The legacy sidebar rules are dropped (the app shell
// renders its own sidebar); class names are kept so the shell's legacy-page
// rules (shellStyles.ts) apply unchanged.

export const SETTINGS_STYLES = `
  .settings-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f; --line:rgba(26,18,16,.12); --row-hover:rgba(26,18,16,.035);
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    /* Sidebar tokens shared with /client-home and /host-home. */
    --glass-bg:rgba(255,255,255,.55);
    --glass-border:rgba(255,255,255,.6);
    --glass-shadow:0 24px 55px #E4E1DA;
  }
  html[data-theme="dark"] .settings-page{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; --line:rgba(255,255,255,.12); --nav-active-bg:rgba(255,255,255,.14); --row-hover:rgba(255,255,255,.05);
    --glass-bg:#000000;
    --glass-border:rgba(255,255,255,.14);
    --glass-shadow:none;
  }
  .settings-page, .settings-page *{ margin:0; padding:0; box-sizing:border-box; }
  .settings-page{
    font-family:var(--font-body); color:var(--ink); min-height:100vh; overflow-x:hidden;
    transition:background .2s ease, color .2s ease;
    background:var(--paper);
  }
  .settings-page a{ color:inherit; text-decoration:none; }
  .settings-page button{ font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
  .settings-page :focus-visible{ outline:3px solid var(--ink); outline-offset:3px; }
  .settings-page ul{ list-style:none; }
  .settings-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.4rem; display:flex; align-items:baseline; padding:0 .4rem; }
  .settings-page .logo .va{ color:var(--red); }
  .settings-page .logo .room{ color:var(--ink); }
  
  .settings-page .app-shell{ display:grid; grid-template-columns:280px minmax(400px, 420px) minmax(0, 1fr); min-height:100vh; background:var(--paper); }
  
  /* =====================================================================
     MAIN COLUMN — Settings navigation and detail panes
     ===================================================================== */
  
  .settings-page .main-col{ min-width:0; display:contents; }
  .settings-page .mobile-topbar{ display:none; }
  .settings-page .settings-main{
    grid-column:2 / 4; min-width:0; min-height:100vh; display:grid;
    grid-template-columns:minmax(300px, 370px) minmax(0, 1fr);
    padding:0; margin:0;
  }
  
  /* The contextual skeleton below is the loading UI; avoid a competing
     generic message and keep the final two-column footprint reserved. */
  
  .settings-page .checking-msg{ display:none; }
  .settings-page .page-title{ font-family:var(--font-display); font-weight:700; font-size:1.45rem; margin-bottom:1.2rem; }
  .settings-page .page-sub{ color:var(--muted); font-size:.82rem; margin-bottom:1.1rem; }
  .settings-page .settings-search{ position:relative; margin-bottom:1rem; }
  .settings-page .settings-search svg{ position:absolute; left:.8rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
  .settings-page .settings-search input{ height:38px; border-radius:999px; padding:.55rem .85rem .55rem 2.3rem; background:transparent; }
  .settings-page #settings-page{ display:grid; grid-template-columns:subgrid; grid-column:1 / -1; min-width:0; }
  .settings-page #view-list{ grid-column:1; min-width:0; padding:1.6rem 1rem 4rem; border-right:1px solid var(--line); }
  .settings-page #settings-page > [id^="view-"]:not(#view-list){ grid-column:2; min-width:0; padding:1.6rem clamp(1.5rem, 4vw, 4rem) 5rem; }
  .settings-page #settings-page:not(.has-selection) > [id^="view-"]:not(#view-list){ display:none !important; }
  .settings-page .settings-skeleton{
    grid-column:1; min-width:0; padding:1.6rem 1rem 4rem; border-right:1px solid var(--line);
  }
  .settings-page .settings-skeleton[hidden]{ display:none; }
  .settings-page .settings-skeleton{ --skeleton-highlight:rgba(255,255,255,.5); }
  html[data-theme="dark"] .settings-page .settings-skeleton{ --skeleton-highlight:rgba(255,255,255,.12); }
  .settings-page .skeleton-heading, .settings-page .skeleton-search-placeholder, .settings-page .skeleton-nav-title, .settings-page .skeleton-nav-icon-shape{
    position:relative; overflow:hidden; background:var(--line);
  }
  .settings-page .skeleton-heading::after, .settings-page .skeleton-search-placeholder::after, .settings-page .skeleton-nav-title::after, .settings-page .skeleton-nav-icon-shape::after{
    content:''; position:absolute; inset:0; transform:translateX(-100%);
    background:linear-gradient(100deg, transparent, var(--skeleton-highlight), transparent);
    animation:settings-skeleton-shimmer 2.4s ease-in-out infinite;
  }
  .settings-page .skeleton-heading{ width:5.2rem; height:1.15em; border-radius:4px; }
  .settings-page .skeleton-search{
    display:flex; align-items:center; gap:.45rem; height:38px; margin-bottom:1rem;
    padding:0 .85rem 0 .8rem; border:1px solid var(--line); border-radius:999px;
  }
  .settings-page .skeleton-search-glyph{ width:14px; height:14px; position:relative; flex-shrink:0; }
  .settings-page .skeleton-search-glyph::before{
    content:''; position:absolute; width:9px; height:9px; left:0; top:0;
    border:2px solid var(--muted); border-radius:50%;
  }
  .settings-page .skeleton-search-glyph::after{
    content:''; position:absolute; width:5px; height:2px; right:-1px; bottom:0;
    background:var(--muted); transform:rotate(45deg); transform-origin:center;
  }
  .settings-page .skeleton-search-placeholder{ width:7.3rem; height:.8rem; border-radius:4px; }
  .settings-page .skeleton-cat-row{
    display:flex; align-items:center; gap:1rem; min-height:0; width:100%;
    padding:1rem .75rem; border-bottom:1px solid var(--line);
  }
  .settings-page .skeleton-nav-icon{
    display:flex; align-items:center; justify-content:center; width:30px; height:30px;
    background:transparent; overflow:visible; flex-shrink:0;
  }
  .settings-page .skeleton-nav-icon-shape{ position:relative; overflow:hidden; width:20px; height:20px; border-radius:5px; background:var(--line); }
  .settings-page .skeleton-nav-icon-shape::after{
    content:''; position:absolute; inset:0; transform:translateX(-100%);
    background:linear-gradient(100deg, transparent, var(--skeleton-highlight), transparent);
    animation:settings-skeleton-shimmer 2.4s ease-in-out infinite;
  }
  .settings-page .skeleton-nav-title{ width:42%; height:1rem; border-radius:4px; }
  .settings-page .skeleton-nav-chevron{ display:flex; align-items:center; justify-content:center; width:18px; height:18px; margin-left:auto; flex-shrink:0; background:transparent; overflow:visible; }
  .settings-page .skeleton-nav-chevron-shape{
    width:7px; height:7px; transform:rotate(45deg);
    border-top:2px solid var(--line); border-right:2px solid var(--line); border-radius:1px;
    animation:settings-skeleton-chevron-shimmer 2.4s ease-in-out infinite;
  }
  .settings-page .skeleton-soon-divider{ margin:.8rem 0 -.1rem; }
  .settings-page .skeleton-cat-row:last-child{ border-bottom:none; opacity:.55; }
  @keyframes settings-skeleton-shimmer{
    0%, 55%{ transform:translateX(-100%); }
    100%{ transform:translateX(100%); }
  }
  @keyframes settings-skeleton-chevron-shimmer{
    0%, 55%{ border-color:var(--line); }
    100%{ border-color:var(--skeleton-highlight); }
  }
  @media (min-width:861px){
    .settings-page{ overflow-x:clip; }
    .settings-page #view-list, .settings-page #settings-page > [id^="view-"]:not(#view-list), .settings-page .settings-skeleton{ grid-row:1; }
    .settings-page #view-list, .settings-page .settings-skeleton{
      position:sticky; top:0; align-self:start; height:100vh;
    }
    .settings-page #settings-page.is-loading #view-list{ visibility:hidden; }
  }
  @media (prefers-reduced-motion:reduce){
    .settings-page .skeleton-heading::after, .settings-page .skeleton-search-placeholder::after, .settings-page .skeleton-nav-title::after, .settings-page .skeleton-nav-icon-shape::after, .settings-page .skeleton-nav-chevron-shape{ animation:none; }
  }
  .settings-page .detail-head{ display:flex; align-items:center; gap:.9rem; margin-bottom:.3rem; border-bottom:1px solid var(--line); padding-bottom:1.1rem; }
  .settings-page .detail-back{ width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink); }
  .settings-page .detail-back:hover{ background:rgba(255,255,255,.08); }
  .settings-page .detail-title{ font-family:var(--font-display); font-weight:700; font-size:1.45rem; }
  .settings-page .detail-sub{ color:var(--muted); font-size:.88rem; margin:.8rem 0 2rem; }
  
  /* ---------- Category list (main screen) ---------- */
  
  .settings-page .cat-list{ display:flex; flex-direction:column; }
  .settings-page .cat-row{
    display:flex; align-items:center; gap:1rem; background:transparent;
    border:none; border-bottom:1px solid var(--line); border-radius:0; padding:1rem .75rem; text-align:left; width:100%;
  }
  .settings-page .cat-row:last-child{ border-bottom:none; }
  .settings-page .cat-row{ position:relative; transition:background .15s ease; }
  .settings-page .cat-row:hover{ background:var(--row-hover); }
  .settings-page .cat-row.active{ background:var(--nav-active-bg); }
  .settings-page .cat-row.active::before{ content:''; position:absolute; left:0; top:.6rem; bottom:.6rem; width:3px; border-radius:0 3px 3px 0; background:var(--red); }
  .settings-page .cat-row.active .cat-title{ font-weight:700; }
  .settings-page .cat-row.active .cat-icon{ color:var(--red); }
  .settings-page .cat-row.disabled{ opacity:.55; cursor:default; }
  .settings-page .cat-row.disabled:hover{ background:transparent; }
  .settings-page .cat-icon{
    width:30px; height:30px; border-radius:0; background:transparent; border:none;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink);
  }
  .settings-page .cat-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .settings-page .cat-title-row{ display:flex; align-items:center; gap:.5rem; }
  .settings-page .cat-title{ font-weight:600; font-size:.9rem; color:var(--ink); }
  .settings-page .cat-desc{ display:none; font-size:.8rem; color:var(--muted); margin-top:.15rem; line-height:1.4; }
  .settings-page .cat-chevron{ color:var(--muted); flex-shrink:0; }
  .settings-page .soon-badge{
    font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
    background:var(--line); color:var(--muted); padding:.15rem .5rem; border-radius:100px;
  }
  .settings-page .soon-divider{ display:flex; align-items:center; gap:.7rem; margin:.8rem 0 -.1rem; color:var(--muted); font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .settings-page .soon-divider::before, .settings-page .soon-divider::after{ content:''; flex:1; height:1px; background:var(--line); }
  
  /* ---------- Shared detail-view building blocks ---------- */
  
  .settings-page .settings-section{ margin-bottom:2.2rem; }
  .settings-page .section-title{ font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:.7rem; }
  .settings-page .card{ background:transparent; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .settings-page .info-row{
    display:flex; align-items:center; gap:.9rem; padding:1rem 1.2rem; border-bottom:1px solid var(--line); cursor:default;
  }
  .settings-page .info-row:last-child{ border-bottom:none; }
  .settings-page .info-row.clickable{ cursor:pointer; }
  .settings-page .info-row.clickable:hover{ background:rgba(255,255,255,.05); }
  .settings-page .info-icon{ width:34px; height:34px; border-radius:9px; background:transparent; border:1px solid var(--line); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink); }
  .settings-page .info-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .settings-page .info-label{ font-size:.82rem; color:var(--muted); }
  .settings-page .info-value{ font-size:.92rem; font-weight:600; margin-top:.1rem; word-break:break-word; }
  .settings-page .info-chevron{ color:var(--muted); flex-shrink:0; }
  .settings-page .info-row.danger .info-icon{ color:var(--red-deep); }
  .settings-page .info-row.danger .info-label{ color:var(--red-deep); font-weight:600; }
  .settings-page .expand-panel{ display:none; padding:0 1.2rem 1.1rem; border-bottom:1px solid var(--line); }
  .settings-page .expand-panel.show{ display:block; }
  .settings-page .expand-panel:last-child{ border-bottom:none; }
  .settings-page .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1rem; }
  .settings-page .field:last-child{ margin-bottom:0; }
  .settings-page label{ font-size:.85rem; font-weight:600; }
  .settings-page input, .settings-page select{
    font-family:inherit; font-size:.92rem; padding:.7rem .85rem;
    border:1px solid var(--line); border-radius:10px;
    background:var(--paper); color:var(--ink); width:100%;
  }
  .settings-page input:focus, .settings-page select:focus{ outline:none; border-color:var(--ink); }
  .settings-page .btn{
    background:var(--ink); color:var(--paper); padding:.7rem 1.15rem; border-radius:10px;
    font-weight:600; font-size:.85rem; white-space:nowrap; transition:opacity .2s ease;
  }
  .settings-page .btn:hover{ opacity:.82; }
  .settings-page .btn:disabled{ opacity:.45; cursor:not-allowed; }
  .settings-page .btn-block{ width:100%; text-align:center; }
  .settings-page .btn-danger{ background:var(--red); color:var(--white); }
  .settings-page .btn-danger:hover{ background:var(--red-deep); opacity:1; }
  .settings-page .btn-red-link{ color:var(--red-deep); font-weight:700; }
  .settings-page .btn-red-link:hover{ text-decoration:underline; }
  .settings-page .btn-ghost{ background:transparent; border:1.5px solid var(--line); color:var(--ink); }
  .settings-page .inline-msg{ font-size:.8rem; margin-top:.6rem; }
  .settings-page .inline-msg.success{ color:#2e7d32; }
  .settings-page .inline-msg.error{ color:var(--red-deep); }
  .settings-page .inline-msg.neutral{ color:var(--muted); }
  
  /* Toggle switches — monochrome */
  
  .settings-page .toggle-row{
    display:flex; align-items:center; justify-content:space-between; gap:1rem;
    padding:1rem 1.2rem; border-bottom:1px solid var(--line);
  }
  .settings-page .toggle-row:last-child{ border-bottom:none; }
  .settings-page .toggle-label{ font-size:.9rem; font-weight:600; }
  .settings-page .toggle-desc{ font-size:.76rem; color:var(--muted); margin-top:.15rem; }
  .settings-page .switch{ position:relative; width:44px; height:26px; flex-shrink:0; }
  .settings-page .switch input{ opacity:0; width:0; height:0; }
  .settings-page .switch-track{
    position:absolute; inset:0; background:var(--line); border-radius:100px;
    transition:background .2s ease; cursor:pointer;
  }
  .settings-page .switch-track::before{
    content:''; position:absolute; width:20px; height:20px; left:3px; top:3px;
    background:var(--white); border-radius:50%; transition:transform .2s ease; box-shadow:0 1px 3px rgba(0,0,0,.25);
  }
  .settings-page .switch input:checked + .switch-track{ background:var(--ink); }
  .settings-page .switch input:checked + .switch-track::before{ transform:translateX(18px); }
  .settings-page .switch input:disabled + .switch-track{ opacity:.45; cursor:not-allowed; }

  /* Reach Out (Your Account, hosts) */

  .settings-page .reach-fields{ padding:1.1rem 1.2rem; }
  .settings-page .reach-intro{ margin:0 0 1rem; }
  .settings-page .reach-subtitle{ margin-top:1.4rem; }
  .settings-page .reach-channel{ display:flex; align-items:center; gap:.9rem; min-width:0; }
  .settings-page .reach-icon img{ display:block; width:22px; height:22px; object-fit:contain; }
  .settings-page .reach-icon svg{ display:block; width:17px; height:17px; }
  
  /* Appearance pills — monochrome */
  
  .settings-page .appearance-options{ display:flex; gap:.7rem; flex-wrap:wrap; }
  .settings-page .appearance-pill{
    display:flex; align-items:center; gap:.5rem;
    border:1.5px solid var(--line); border-radius:12px;
    padding:.7rem 1.1rem; font-size:.86rem; font-weight:600; color:var(--ink);
  }
  .settings-page .appearance-pill.active{ border-color:var(--ink); background:var(--line); }
  .settings-page .username-field{ position:relative; }
  .settings-page .username-field input{ padding-right:2.6rem; }
  .settings-page .username-status{ position:absolute; right:.8rem; top:50%; transform:translateY(-50%); display:flex; align-items:center; font-weight:700; font-size:.95rem; }
  .settings-page .username-status.available, .settings-page .username-availability.available{ color:#1a7f37; }
  .settings-page .username-status.taken, .settings-page .username-availability.taken, .settings-page .username-availability.invalid{ color:var(--red-deep); }
  html[data-theme="dark"] .settings-page .username-status.available, html[data-theme="dark"] .settings-page .username-availability.available{ color:#3fb950; }
  .settings-page .username-availability{ min-height:1.1rem; margin:.4rem 0 0; font-size:.8rem; color:var(--muted); }
  .settings-page .settings-spinner{ width:16px; height:16px; border:2px solid var(--line); border-top-color:var(--ink); border-radius:50%; animation:settings-spin .7s linear infinite; }
  @keyframes settings-spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce){ .settings-page .settings-spinner{ animation-duration:2s; } }
  .settings-page .font-size-setting{ margin-top:1.4rem; }
  .settings-page .font-preview{ display:flex; gap:.75rem; padding:1rem 1.1rem; margin-bottom:1.3rem; border:1px solid var(--line); border-radius:14px; background:var(--white); }
  .settings-page .font-preview-avatar{ flex:0 0 auto; width:2.6rem; height:2.6rem; border-radius:50%; display:grid; place-items:center; background:var(--ink); font-family:var(--font-display); font-weight:900; font-size:1rem; }
  .settings-page .font-preview-avatar .va{ color:var(--red); }
  .settings-page .font-preview-body{ min-width:0; }
  .settings-page .font-preview-head{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.35rem; font-size:.95rem; }
  .settings-page .font-preview-head strong{ color:var(--ink); }
  .settings-page .font-preview-head span{ color:var(--muted); font-size:.9rem; }
  .settings-page .font-preview p{ margin:.2rem 0 0; color:var(--ink); font-size:1rem; line-height:1.45; }
  .settings-page .font-size-setting-head{ display:flex; justify-content:space-between; align-items:baseline; gap:1rem; margin-bottom:.9rem; }
  .settings-page .font-size-setting-label{ font-size:1.15rem; font-weight:700; }
  .settings-page .font-size-setting-value{ font-size:.8rem; color:var(--muted); }
  .settings-page .font-size-slider-row{ display:flex; align-items:center; gap:1rem; }
  .settings-page .font-size-mark{ flex:0 0 auto; font-weight:500; line-height:1; color:var(--ink); }
  .settings-page .font-size-mark.small{ font-size:.8rem; }
  .settings-page .font-size-mark.large{ font-size:1.4rem; }
  .settings-page .font-size-rail{ position:relative; flex:1; min-width:0; height:28px; margin:0 11px; }
  .settings-page .font-size-line, .settings-page .font-size-fill{ position:absolute; left:0; top:50%; height:4px; margin-top:-2px; border-radius:2px; pointer-events:none; }
  .settings-page .font-size-line{ right:0; background:var(--line); }
  .settings-page .font-size-fill{ width:var(--fs-progress); background:var(--red); transition:width .15s ease; }
  .settings-page .font-size-stop{ position:absolute; top:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:var(--line); pointer-events:none; transition:transform .15s ease, background .15s ease; }
  .settings-page .font-size-stop.reached{ background:var(--red); }
  .settings-page .font-size-stop.current{ transform:scale(1.55); }
  .settings-page .font-size-rail:focus-within .font-size-stop.current{ box-shadow:0 0 0 4px rgba(196,30,58,.22); }
  .settings-page .font-size-range{ position:absolute; top:0; left:-11px; width:calc(100% + 22px); height:100%; margin:0; opacity:0; cursor:pointer; -webkit-appearance:none; appearance:none; }
  .settings-page .font-size-range::-webkit-slider-thumb{ -webkit-appearance:none; width:22px; height:28px; }
  .settings-page .font-size-range::-moz-range-thumb{ width:22px; height:28px; border:0; }
  .settings-page .font-size-note{ margin:.7rem 0 0; color:var(--muted); font-size:.78rem; }
  html[data-theme="dark"] .settings-page .font-preview{ background:transparent; }
  .settings-page .note-box{
    background:var(--paper); border:1px solid var(--line);
    border-radius:12px; padding:.9rem 1.1rem; font-size:.8rem; color:var(--muted); line-height:1.5;
    margin-top:1rem;
  }
  .settings-page .delete-confirm-input{ margin:.7rem 0; }
  .settings-page .about-block{ font-size:.86rem; color:var(--muted); line-height:1.65; padding:1.1rem 1.2rem; }
  .settings-page .about-block strong{ color:var(--ink); }
  .settings-page .logout-confirm-panel{ display:none; margin-top:.9rem; padding:1rem; border:1px solid var(--line); border-radius:12px; background:var(--paper); }
  .settings-page .logout-confirm-panel.show{ display:block; }
  .settings-page .dashboard-accounts{ display:flex; flex-direction:column; }
  .settings-page .dashboard-account{ display:flex; align-items:center; gap:.9rem; padding:1rem 1.1rem; border-bottom:1px solid var(--line); }
  .settings-page .dashboard-account:last-child{ border-bottom:none; }
  .settings-page .dashboard-account-avatar{ width:42px; height:42px; border-radius:50%; overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#1d1b1a,#5a4e4b); color:#fff; font-size:.9rem; font-weight:700; }
  .settings-page .dashboard-account-avatar img{ width:100%; height:100%; object-fit:cover; }
  .settings-page .dashboard-account-info{ min-width:0; flex:1; }
  .settings-page .dashboard-account-name{ display:block; font-weight:700; font-size:.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .settings-page .dashboard-account-email{ display:block; margin-top:.2rem; color:var(--muted); font-size:.78rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .settings-page .dashboard-account-current{ color:var(--muted); font-size:.68rem; margin-top:.25rem; }
  .settings-page .dashboard-account-actions{ display:flex; align-items:center; gap:.7rem; flex-shrink:0; }
  .settings-page .dashboard-account-actions button{ font-size:.78rem; font-weight:700; padding:.42rem .65rem; border:1px solid var(--line); border-radius:7px; transition:background .2s ease, border-color .2s ease, color .2s ease; }
  .settings-page .dashboard-account-actions .login-account-btn{ color:var(--ink); background:transparent; }
  .settings-page .dashboard-account-actions .login-account-btn:hover{ background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.28); }
  .settings-page .dashboard-account-actions .delete-account-btn{ color:var(--red); background:transparent; border-color:rgba(196,30,58,.45); }
  .settings-page .dashboard-account-actions .delete-account-btn:hover{ background:rgba(196,30,58,.1); border-color:var(--red); }
  .settings-page .dashboard-account-actions .remove-account-btn{ color:var(--red); background:transparent; border-color:rgba(196,30,58,.45); }
  .settings-page .dashboard-account-actions .remove-account-btn:hover{ background:rgba(196,30,58,.1); border-color:var(--red); }
  .settings-page .dashboard-account-actions button:disabled{ opacity:.5; cursor:wait; }
  .settings-page .accounts-empty{ padding:1.1rem; color:var(--muted); font-size:.85rem; }
  .settings-page .account-limit-note{ margin-top:.65rem; color:var(--muted); font-size:.78rem; }
  .settings-page .accounts-divider{ height:1px; background:var(--line); margin:2rem 0 1.1rem; }
  .settings-page .logout-section{ padding:0; }
  .settings-page .delete-account-dialog{ width:min(460px, calc(100vw - 2rem)); border:1px solid var(--line); border-radius:14px; padding:1.35rem; background:var(--paper); color:var(--ink); box-shadow:0 20px 70px rgba(0,0,0,.6); }
  .settings-page .delete-account-dialog::backdrop{ background:rgba(0,0,0,.72); }
  .settings-page .delete-account-dialog h2{ font-size:1.1rem; margin:0 0 .55rem; }
  .settings-page .delete-account-dialog p{ color:var(--muted); font-size:.84rem; line-height:1.5; margin:0 0 1.1rem; }
  .settings-page .delete-account-dialog label{ display:block; margin-bottom:.45rem; }
  .settings-page .delete-account-dialog select, .settings-page .delete-account-dialog textarea{ margin-bottom:.75rem; }
  .settings-page .delete-account-dialog textarea{ min-height:80px; resize:vertical; }
  .settings-page .delete-account-actions{ display:flex; justify-content:flex-end; gap:.7rem; margin-top:.3rem; }
  .settings-page .delete-account-actions .btn-danger:disabled{ opacity:.45; cursor:not-allowed; }
  @media (max-width:600px){
    .settings-page .dashboard-account{ align-items:flex-start; flex-wrap:wrap; }
    .settings-page .dashboard-account-info{ max-width:calc(100% - 58px); }
    .settings-page .dashboard-account-actions{ width:100%; margin-left:58px; }
  }
  .settings-page .logout-confirm-actions{ display:flex; gap:.6rem; margin-top:.8rem; }
  .settings-page .logout-confirm-actions .btn{ flex:1; }
  
  /* =====================================================================
     RESPONSIVE — sidebar becomes an off-canvas drawer, same mechanism
     (mobile-open class + backdrop) /client-home//host-home use.
     ===================================================================== */
  
  @media (max-width:1100px) and (min-width:861px){
    .settings-page .app-shell{ grid-template-columns:240px minmax(360px, 390px) minmax(0, 1fr); }
  }
  @media (max-width:860px){
    .settings-page .app-shell{ display:block; }
    .settings-page .mobile-topbar{
      position:relative; display:flex; align-items:center; min-height:44px;
      padding:1.2rem 5vw 0;
    }
    .settings-page .mobile-menu-btn{ color:var(--ink); display:flex; }
    .settings-page .mobile-topbar .logo{ position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; }
    .settings-page .settings-main{ display:block; min-height:0; padding-top:1.4rem; }
    .settings-page #settings-page{ display:block !important; }
    .settings-page #view-list{ border-right:none; padding:0 5vw 4rem; }
    .settings-page #settings-page > [id^="view-"]:not(#view-list){ padding:0 5vw 5rem; }
    .settings-page .settings-skeleton{ padding:0 5vw 5rem; }
    .settings-page #settings-page.mobile-detail #view-list{ display:none !important; }
    .settings-page #settings-page:not(.mobile-detail) > [id^="view-"]:not(#view-list){ display:none !important; }
    .settings-page #settings-page:not(.mobile-detail) .settings-skeleton{ display:none; }
  }
  @media (max-width:520px){
    .settings-page .settings-main{ padding-top:1rem; }
    .settings-page .cat-row{ padding:.95rem 1rem; }
    .settings-page .cat-icon{ width:38px; height:38px; }
  }
  .settings-page .mobile-only-chevron{ display:none; }
  @media (max-width:860px){
    .settings-page .mobile-only-chevron{ display:flex; }
  }
  
`;
