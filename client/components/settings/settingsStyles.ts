// Styles for /settings, ported from legacy-pages/settings.html and scoped
// under .settings-page. One column beside the app shell's sidebar: the
// categories as one grouped card (Apple-style Settings), then each section.
// The page uses the sidebar's white only; dark mode is black. Motion follows
// animation.md with a reduced-motion fallback at the end. Class names are kept
// so the shell's legacy-page rules (shellStyles.ts) apply unchanged.

export const SETTINGS_STYLES = `
  .settings-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#FFFFFF; --nav-active-bg:#E9E7E2;
    --muted:#5c584f; --line:rgba(26,18,16,.12); --row-hover:rgba(26,18,16,.035);
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    /* Sidebar tokens shared with /client-home and /host-home. */
    --glass-bg:rgba(255,255,255,.55);
    --glass-border:rgba(255,255,255,.6);
    --glass-shadow:0 24px 55px #E4E1DA;
    --plan-box:#FFFFFF; --plan-box-head:#F3F1ED; --plan-box-line:rgba(26,18,16,.08); --search-line:rgba(26,18,16,.2);
    --card-shadow:0 1px 2px rgba(26,18,16,.04), 0 6px 20px -14px rgba(26,18,16,.22);
  }
  html[data-theme="dark"] .settings-page{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; --line:rgba(255,255,255,.12); --nav-active-bg:rgba(255,255,255,.14); --row-hover:rgba(255,255,255,.05);
    --glass-bg:#000000;
    --glass-border:rgba(255,255,255,.14);
    --glass-shadow:none;
    --plan-box:#141414; --plan-box-head:#232323; --plan-box-line:rgba(255,255,255,.07); --search-line:rgba(255,255,255,.2);
    --card-shadow:none;
  }
  .settings-page, .settings-page :where(:not(.settings-chats *)){ margin:0; padding:0; box-sizing:border-box; }
  .settings-page{
    font-family:var(--font-body); color:var(--ink); min-height:100vh; overflow-x:hidden;
    background:var(--paper);
  }
  .settings-page a{ color:inherit; text-decoration:none; }
  .settings-page button:where(:not(.settings-chats *)){ font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
  .settings-page :focus-visible{ outline:3px solid var(--ink); outline-offset:3px; }
  .settings-page ul{ list-style:none; }
  .settings-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.4rem; display:flex; align-items:baseline; padding:0 .4rem; }
  .settings-page .logo .va{ color:var(--red); }
  .settings-page .logo .room{ color:var(--ink); }
  
  .settings-page .app-shell{ display:grid; grid-template-columns:280px minmax(0, 1fr); min-height:100vh; background:var(--paper); }

  /* =====================================================================
     MAIN COLUMN — the category list, or the open section, in one column
     ===================================================================== */

  .settings-page .main-col{ min-width:0; display:contents; }
  .settings-page .mobile-topbar{ display:none; }
  .settings-page .settings-main{ grid-column:2; min-width:0; min-height:100vh; padding:0; margin:0; }
  
  /* The contextual skeleton below is the loading UI; avoid a competing
     generic message and keep the final two-column footprint reserved. */
  
  .settings-page .checking-msg{ display:none; }
  .settings-page .page-title{ font-family:var(--font-brand); font-weight:700; font-size:clamp(2rem, 3vw, 2.4rem); line-height:1.1; letter-spacing:-.01em; margin-bottom:.45rem; }
  .settings-page .page-sub{ color:var(--muted); font-size:.95rem; margin-bottom:1.6rem; }
  .settings-page .settings-search{ position:relative; margin-bottom:1.25rem; }
  .settings-page .settings-search svg{ position:absolute; left:.9rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
  .settings-page .settings-search input{ height:42px; border-radius:999px; padding:.55rem .9rem .55rem 2.45rem; background:transparent; border:1px solid var(--search-line); }
  .settings-page .settings-search input:focus{ border-color:var(--muted); }
  html[data-theme="dark"] .settings-page .settings-search input{ border:1px solid var(--search-line) !important; }
  html[data-theme="dark"] .settings-page .settings-search input:focus{ border-color:var(--muted) !important; }
  .settings-page .cat-list [hidden]{ display:none !important; }
  .settings-page .search-where{ font-size:.76rem; color:var(--muted); margin-top:.15rem; }
  .settings-page .search-empty{ padding:1rem .75rem; color:var(--muted); font-size:.88rem; }
  /* One screen at a time: the list, or the open section (the list stays mounted, keeping the search). */
  .settings-page #settings-page{ max-width:760px; min-width:0; margin:0 auto; padding:clamp(2rem, 6vh, 3.5rem) clamp(1.25rem, 4vw, 3rem) 5rem; }
  .settings-page #settings-page.has-selection #view-list{ display:none !important; }
  .settings-page #settings-page:not(.has-selection) > [id^="view-"]:not(#view-list){ display:none !important; }
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
    display:flex; align-items:center; gap:.45rem; height:42px; margin-bottom:1.25rem;
    padding:0 .9rem; border:1px solid var(--line); border-radius:999px;
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
    padding:.9rem 1.1rem;
  }
  .settings-page .skeleton-nav-icon{
    display:flex; align-items:center; justify-content:center; width:36px; height:36px;
    background:transparent; overflow:visible; flex-shrink:0;
  }
  .settings-page .skeleton-nav-icon-shape{ position:relative; overflow:hidden; width:36px; height:36px; border-radius:10px; background:var(--line); }
  .settings-page .skeleton-nav-icon-shape::after{
    content:''; position:absolute; inset:0; transform:translateX(-100%);
    background:linear-gradient(100deg, transparent, var(--skeleton-highlight), transparent);
    animation:settings-skeleton-shimmer 2.4s ease-in-out infinite;
  }
  .settings-page .skeleton-nav-title{ width:32%; height:.9rem; border-radius:4px; }
  .settings-page .skeleton-nav-title.is-desc{ width:62%; height:.7rem; margin-top:.45rem; }
  .settings-page .skeleton-nav-chevron{ display:flex; align-items:center; justify-content:center; width:18px; height:18px; margin-left:auto; flex-shrink:0; background:transparent; overflow:visible; }
  .settings-page .skeleton-nav-chevron-shape{
    width:7px; height:7px; transform:rotate(45deg);
    border-top:2px solid var(--line); border-right:2px solid var(--line); border-radius:1px;
    animation:settings-skeleton-chevron-shimmer 2.4s ease-in-out infinite;
  }
  .settings-page .skeleton-cat-row:last-child{ opacity:.55; }
  @keyframes settings-skeleton-shimmer{
    0%, 55%{ transform:translateX(-100%); }
    100%{ transform:translateX(100%); }
  }
  @keyframes settings-skeleton-chevron-shimmer{
    0%, 55%{ border-color:var(--line); }
    100%{ border-color:var(--skeleton-highlight); }
  }
  @media (min-width:861px){ .settings-page{ overflow-x:clip; } }
  @media (prefers-reduced-motion:reduce){
    .settings-page .skeleton-heading::after, .settings-page .skeleton-search-placeholder::after, .settings-page .skeleton-nav-title::after, .settings-page .skeleton-nav-icon-shape::after, .settings-page .skeleton-nav-chevron-shape{ animation:none; }
  }
  /* Breadcrumb under each section's title: Settings › Section. */
  .settings-page .detail-heading{ display:flex; flex-direction:column; min-width:0; }
  .settings-page .detail-crumbs ol{ display:flex; align-items:center; gap:.35rem; margin-top:.3rem; font-size:.82rem; color:var(--muted); list-style:none; }
  .settings-page .detail-crumbs li{ display:flex; align-items:center; min-width:0; }
  .settings-page .detail-crumbs li[aria-current]{ color:var(--ink); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .settings-page .detail-crumbs button{ font-size:inherit; color:var(--muted); padding:.15rem .3rem; margin:0 -.3rem; border-radius:6px; transition:color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .settings-page .detail-crumbs button:hover{ color:var(--ink); background:var(--row-hover); } }
  .settings-page .detail-head{ display:flex; align-items:flex-start; gap:.9rem; margin-bottom:1.5rem; border-bottom:1px solid var(--line); padding-bottom:1.1rem; }
  .settings-page .detail-back{ width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink); }
  .settings-page .detail-back{ transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .settings-page .detail-back:hover{ background:var(--row-hover); } }
  .settings-page .detail-title{ font-family:var(--font-display); font-weight:700; font-size:1.45rem; }
  .settings-page .detail-sub{ color:var(--muted); font-size:.88rem; margin:-.5rem 0 1.4rem; }
  
  /* ---------- Category list (main screen) ---------- */
  
  /* One grouped card: icon tile, title and description, chevron; inset dividers between rows. */
  .settings-page .cat-list{
    display:flex; flex-direction:column; background:var(--plan-box); border:1px solid var(--plan-box-line);
    border-radius:16px; overflow:hidden; box-shadow:var(--card-shadow);
  }
  .settings-page .cat-row{
    position:relative; display:flex; align-items:center; gap:1rem; background:transparent;
    border:none; border-radius:0; padding:.9rem 1.1rem; text-align:left; width:100%;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .settings-page .cat-row + .cat-row::before{ content:''; position:absolute; top:0; right:0; left:calc(1.1rem + 36px + 1rem); height:1px; background:var(--plan-box-line); }
  @media (hover:hover){ .settings-page .cat-row:not(.disabled):hover{ background:var(--row-hover); } }
  /* Press: the row tints at once (a grouped row does not scale out of its card). */
  .settings-page .cat-row:not(.disabled):active{ background:var(--nav-active-bg); transition-duration:var(--motion-press,120ms); }
  .settings-page .cat-row.disabled{ cursor:default; }
  .settings-page .cat-row.disabled > *{ opacity:.55; }
  .settings-page .cat-icon{
    width:36px; height:36px; border-radius:10px; background:var(--plan-box-head); border:none;
    display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink);
  }
  .settings-page .cat-icon svg{ width:18px; height:18px; }
  .settings-page .cat-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .settings-page .cat-title-row{ display:flex; align-items:center; gap:.5rem; }
  .settings-page .cat-title{ font-weight:600; font-size:.95rem; color:var(--ink); }
  .settings-page .cat-desc{ font-size:.8rem; color:var(--muted); margin-top:.15rem; line-height:1.4; }
  .settings-page .cat-chevron{ display:flex; color:var(--muted); flex-shrink:0; transition:transform var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .settings-page .cat-row:not(.disabled):hover .cat-chevron{ transform:translateX(2px); } }
  .settings-page .soon-badge{
    font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
    background:var(--line); color:var(--muted); padding:.15rem .5rem; border-radius:100px;
  }
  .settings-page .soon-divider{ display:flex; align-items:center; gap:.7rem; padding:.85rem 1.1rem .3rem; border-top:1px solid var(--plan-box-line); color:var(--muted); font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  
  /* ---------- Shared detail-view building blocks ---------- */
  
  .settings-page .settings-section{ margin-bottom:2.2rem; }

  /* The grey box (Plans & Billing style), used by every section. */
  .settings-page .plan-box{ background:var(--plan-box); border:1px solid var(--plan-box-line); border-radius:16px; overflow:hidden; margin-bottom:1.1rem; box-shadow:var(--card-shadow); }
  .settings-page .plan-box-head{ display:flex; align-items:center; gap:.55rem; padding:.85rem 1.4rem; border-bottom:1px solid var(--plan-box-line); font-size:.9rem; font-weight:700; }
  .settings-page .plan-box-head svg{ color:var(--muted); flex-shrink:0; }
  .settings-page .plan-box-body{ padding:1.3rem 1.4rem 1.4rem; }
  .settings-page .plan-box :is(.info-row, .toggle-row, .team-row, .dashboard-account){ padding-left:1.4rem; padding-right:1.4rem; border-bottom-color:var(--plan-box-line); }
  .settings-page .plan-box .expand-pad{ padding:0 1.4rem 1.2rem; }
  .settings-page .plan-box .expand-panel{ border-bottom-color:var(--plan-box-line); }
  @media (hover:hover){ .settings-page .plan-box .info-row.clickable:hover{ background:var(--plan-box-head); } }
  .settings-page .plan-box .info-icon{ border:none; background:var(--plan-box-head); border-radius:10px; width:36px; height:36px; }
  .settings-page .plan-box-body + :is(.team-row, .dashboard-account){ border-top:1px solid var(--plan-box-line); }
  .settings-page .plan-box .team-empty{ margin:0; padding:1rem 1.4rem; }
  .settings-page .plan-box .accounts-empty{ padding:1rem 1.4rem; }
  .settings-page .plan-box .inline-msg:empty{ display:none; }
  .settings-page .search-hit{ animation:settings-search-hit 1.8s ease; }
  @keyframes settings-search-hit{
    0%, 45%{ box-shadow:inset 0 0 0 2px rgba(196,30,58,.6); }
    100%{ box-shadow:inset 0 0 0 2px transparent; }
  }
  @media (prefers-reduced-motion:reduce){ .settings-page .search-hit{ animation-duration:.01s; } }
  @media (max-width:600px){
    .settings-page .plan-box-head, .settings-page .plan-box-body{ padding-left:1.1rem; padding-right:1.1rem; }
    .settings-page .plan-box :is(.info-row, .toggle-row, .team-row, .dashboard-account){ padding-left:1.1rem; padding-right:1.1rem; }
    .settings-page .plan-box .expand-pad{ padding-left:1.1rem; padding-right:1.1rem; }
  }

  /* Dark: fields in a box take the box's heavier grey (not black); a border only while typing.
     !important: the app-wide varoom-dark-theme.css forces .field inputs to black with it. */
  html[data-theme="dark"] .settings-page .plan-box :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea){ background:var(--plan-box-head) !important; border-color:transparent !important; }
  html[data-theme="dark"] .settings-page .plan-box :is(input, select, textarea):focus{ border-color:var(--muted) !important; box-shadow:none !important; }
  html[data-theme="dark"] .settings-page .settings-chats .cs{ --cs-bg:var(--plan-box-head); }

  /* Chats (the shared Chat Settings, in grey boxes here). */
  .settings-page .settings-chats .cs{ padding:0; font-family:inherit; --cs-text:var(--ink); --cs-muted:var(--muted); --cs-divider:var(--plan-box-line); --cs-hover:var(--plan-box-head); --cs-bg:var(--paper); }
  .settings-page .settings-chats .cs-section, .settings-page .settings-chats .cs-section:first-child{ padding:0; margin-bottom:1.1rem; background:var(--plan-box); border:1px solid var(--plan-box-line); border-radius:16px; box-shadow:var(--card-shadow); }
  .settings-page .settings-chats .cs-section__title{ margin:0; padding:.85rem 1.4rem; border-bottom:1px solid var(--plan-box-line); font-size:.9rem; font-weight:700; letter-spacing:0; text-transform:none; color:var(--ink); }
  .settings-page .settings-chats .cs-section__list{ border-top:none; padding:.2rem 1.4rem .5rem; }
  .settings-page .settings-chats .cs-row__label{ font-size:.92rem; font-weight:600; }
  .settings-page .settings-chats .cs-row__desc{ font-size:.8rem; }
  .settings-page .settings-chats .cs-row--nav{ margin:0 -.6rem; padding-left:.6rem; padding-right:.6rem; width:calc(100% + 1.2rem); }
  @media (max-width:600px){ .settings-page .settings-chats .cs-section__title, .settings-page .settings-chats .cs-section__list{ padding-left:1.1rem; padding-right:1.1rem; } }
  .settings-page .section-title{ font-size:.78rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:.7rem; }
  .settings-page .card{ background:transparent; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  .settings-page .info-row{
    display:flex; align-items:center; gap:.9rem; padding:1rem 1.2rem; border-bottom:1px solid var(--line); cursor:default;
  }
  .settings-page .info-row:last-child{ border-bottom:none; }
  .settings-page .info-row.clickable{ cursor:pointer; transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ .settings-page .info-row.clickable:hover{ background:var(--row-hover); } }
  /* Rows sit inside rounded cards that clip overflow: their focus ring is drawn inside. */
  .settings-page :is(.info-row.clickable, .cat-row, .cs-row):focus-visible{ outline:2px solid var(--ink); outline-offset:-2px; }
  .settings-page .info-chevron{ transition:transform var(--motion-quick,200ms) var(--ease-in-out,ease-in-out); }
  .settings-page .info-row.clickable[aria-expanded="true"] .info-chevron{ transform:rotate(90deg); }
  .settings-page .info-icon{ width:34px; height:34px; border-radius:9px; background:transparent; border:1px solid var(--line); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--ink); }
  .settings-page .info-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .settings-page .info-label{ font-size:.82rem; color:var(--muted); }
  .settings-page .info-value{ font-size:.92rem; font-weight:600; margin-top:.1rem; word-break:break-word; }
  .settings-page .info-chevron{ color:var(--muted); flex-shrink:0; }
  .settings-page .info-main > .info-label:only-child{ font-size:.92rem; font-weight:600; color:var(--ink); }
  .settings-page .info-row.danger .info-icon{ color:var(--red-deep); }
  .settings-page .info-row.danger .info-label{ color:var(--red-deep); font-weight:600; }
  /* Opens and closes smoothly by animating its grid row (animation.md C5). */
  .settings-page .expand-panel{ display:grid; grid-template-rows:0fr; opacity:0; border-bottom:0 solid var(--line);
    transition:grid-template-rows var(--motion-standard,250ms) var(--ease-in-out,ease-in-out), opacity var(--motion-quick,200ms) var(--ease-out,ease); }
  .settings-page .expand-panel.show{ grid-template-rows:1fr; opacity:1; border-bottom-width:1px; }
  .settings-page .expand-panel:last-child{ border-bottom:none; }
  .settings-page .expand-inner{ min-height:0; overflow:hidden; }
  .settings-page .expand-pad{ padding:0 1.2rem 1.1rem; }
  .settings-page .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1rem; }
  .settings-page .field:last-child{ margin-bottom:0; }
  .settings-page label:where(:not(.settings-chats *)){ font-size:.85rem; font-weight:600; }
  .settings-page :is(input, select):where(:not(.settings-chats *)){
    font-family:inherit; font-size:.92rem; padding:.7rem .85rem;
    border:1px solid var(--line); border-radius:10px;
    background:var(--paper); color:var(--ink); width:100%;
  }
  .settings-page :is(input, select):where(:not(.settings-chats *)):focus{ outline:none; border-color:var(--ink); }
  .settings-page .btn{
    background:var(--ink); color:var(--paper); padding:.7rem 1.25rem; border-radius:999px;
    font-weight:600; font-size:.85rem; white-space:nowrap;
    transition:opacity var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  @media (hover:hover){ .settings-page .btn:not(:disabled):hover{ opacity:.85; } }
  .settings-page .btn:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  .settings-page .btn:disabled{ opacity:.45; cursor:not-allowed; }
  .settings-page .btn-block{ width:100%; text-align:center; }
  .settings-page .btn-danger{ background:var(--red); color:var(--white); }
  @media (hover:hover){ .settings-page .btn-danger:not(:disabled):hover{ background:var(--red-deep); opacity:1; } }
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
  .settings-page .team-roles{ margin:.3rem 0 1.2rem; }
  .settings-page .team-role{ display:flex; align-items:flex-start; gap:.8rem; padding:.75rem 0; border-top:1px solid var(--line); cursor:pointer; }
  .settings-page .team-role:last-child{ border-bottom:1px solid var(--line); }
  .settings-page .team-role input{ flex:0 0 auto; width:1.05rem; height:1.05rem; margin:.1rem 0 0; padding:0; accent-color:var(--red); cursor:pointer; }
  .settings-page .team-role-text{ display:flex; flex-direction:column; gap:.1rem; font-size:.9rem; }
  .settings-page .team-role-text span{ color:var(--muted); font-size:.8rem; }
  .settings-page .team-roles.compact{ display:flex; flex-wrap:wrap; gap:.3rem 1.4rem; margin:0 0 .7rem; }
  .settings-page .team-roles.compact .team-role{ align-items:center; gap:.5rem; padding:.2rem 0; border:0; }
  .settings-page .team-roles.compact .team-role-text{ font-size:.85rem; }
  .settings-page .team-list{ margin-top:.9rem; }
  .settings-page .team-row{ padding:1rem 1.2rem; border-bottom:1px solid var(--line); }
  .settings-page .team-row:last-child{ border-bottom:0; }
  .settings-page .team-person{ display:flex; flex-wrap:wrap; align-items:baseline; gap:.2rem .6rem; margin-bottom:.6rem; }
  .settings-page .team-person span{ color:var(--muted); font-size:.82rem; }
  .settings-page .team-chip{ padding:.1rem .5rem; border-radius:999px; background:var(--nav-active-bg); font-size:.72rem !important; font-weight:600; }
  .settings-page .team-chip.on{ color:var(--red) !important; }
  .settings-page .team-actions{ display:flex; flex-wrap:wrap; align-items:center; gap:.8rem; }
  .settings-page .team-link{ border:0; background:none; padding:0; color:var(--muted); font:inherit; font-size:.85rem; font-weight:600; cursor:pointer; }
  .settings-page .team-link.danger{ color:var(--red-deep); }
  .settings-page .team-listings{ margin-top:1rem; padding-top:.8rem; border-top:1px dashed var(--line); }
  .settings-page .team-listings-head, .settings-page .team-listing{ display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.35rem 0; font-size:.88rem; }
  .settings-page .team-empty{ margin:.8rem 0 0; color:var(--muted); font-size:.88rem; }
  .settings-page .field-pair{ display:grid; grid-template-columns:1fr 1fr; gap:0 1rem; }
  @media (max-width:560px){ .settings-page .field-pair{ grid-template-columns:1fr; } }
  .settings-page .switch{ position:relative; width:44px; height:26px; flex-shrink:0; }
  .settings-page .switch input{ opacity:0; width:0; height:0; }
  /* On is red, like the Chats switches; the knob slides and stretches while pressed (animation.md B5). */
  .settings-page .switch-track{
    position:absolute; inset:0; background:var(--line); border-radius:100px;
    transition:background-color var(--motion-quick,200ms) var(--ease-out,ease); cursor:pointer;
  }
  .settings-page .switch-track::before{
    content:''; position:absolute; width:20px; height:20px; left:3px; top:3px;
    background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.25);
    transition:transform var(--motion-quick,200ms) var(--ease-in-out,ease-in-out), width var(--motion-press,120ms) var(--ease-out,ease);
  }
  .settings-page .switch input:checked + .switch-track{ background:var(--red); }
  .settings-page .switch input:checked + .switch-track::before{ transform:translateX(18px); }
  .settings-page .switch:active input:not(:disabled) + .switch-track::before{ width:24px; }
  .settings-page .switch:active input:checked:not(:disabled) + .switch-track::before{ transform:translateX(14px); }
  .settings-page .switch input:focus-visible + .switch-track{ outline:3px solid var(--ink); outline-offset:2px; }
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
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .settings-page .appearance-pill:active{ transform:scale(var(--press-scale,.97)); }
  .settings-page .appearance-pill.active{ border-color:var(--ink); background:var(--line); }
  .settings-page .username-field{ position:relative; }
  .settings-page .username-field input{ padding-right:2.6rem; }
  .settings-page .username-status{ position:absolute; right:.8rem; top:50%; transform:translateY(-50%); display:flex; align-items:center; font-weight:700; font-size:.95rem; }
  .settings-page .username-status.available, .settings-page .username-availability.available{ color:#1a7f37; }
  .settings-page .username-status.taken, .settings-page .username-availability.taken, .settings-page .username-availability.invalid, .settings-page .username-availability.reserved{ color:var(--red-deep); }
  html[data-theme="dark"] .settings-page .username-status.available, html[data-theme="dark"] .settings-page .username-availability.available{ color:#3fb950; }
  .settings-page .username-availability{ min-height:1.1rem; margin:.4rem 0 0; font-size:.8rem; color:var(--muted); }
  .settings-page .settings-spinner{ width:16px; height:16px; border:2px solid var(--line); border-top-color:var(--ink); border-radius:50%; animation:settings-spin .7s linear infinite; }
  @keyframes settings-spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion: reduce){ .settings-page .settings-spinner{ animation-duration:2s; } }
  .settings-page .font-size-setting{ margin-top:0; }
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
  .settings-page .note-box{ padding:0 .3rem; margin:-.3rem 0 1.4rem; font-size:.8rem; color:var(--muted); line-height:1.5; }
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
    .settings-page .app-shell{ grid-template-columns:240px minmax(0, 1fr); }
  }
  @media (max-width:860px){
    .settings-page .app-shell{ display:block; }
    .settings-page .mobile-topbar{
      position:relative; display:flex; align-items:center; min-height:44px;
      padding:1.2rem 5vw 0;
    }
    .settings-page .mobile-menu-btn{ color:var(--ink); display:flex; }
    .settings-page .mobile-topbar .logo{ position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; }
    .settings-page .settings-main{ min-height:0; }
    .settings-page #settings-page{ padding:1.4rem 5vw 5rem; }
  }
  @media (max-width:520px){
    .settings-page #settings-page{ padding-top:1rem; }
    .settings-page .cat-row, .settings-page .skeleton-cat-row{ padding:.95rem 1rem; }
    .settings-page .cat-row + .cat-row::before{ left:calc(1rem + 36px + 1rem); }
  }

  /* Your Account while the server decides: the shape of its rows. */
  .settings-page .account-skeleton{ padding:.4rem 0; }
  .settings-page .account-skeleton-row{ display:flex; align-items:center; gap:.9rem; padding:1rem 1.4rem; }
  .settings-page .account-skeleton-icon{ width:36px; height:36px; border-radius:10px; flex-shrink:0; }
  .settings-page .account-skeleton-text{ flex:1; display:flex; flex-direction:column; gap:.45rem; }
  .settings-page .account-skeleton-text .skeleton-nav-title{ width:38%; height:.8rem; }
  .settings-page .account-skeleton-text .skeleton-nav-title.is-short{ width:22%; height:.65rem; }

  /* Moving between the list and a section (animation.md C4), never on first paint: wide screens
     fade the new screen up 6px; phones slide a section in from the right and the list back from the left. */
  .settings-page #settings-page.nav-forward > [id^="view-"]:not(#view-list),
  .settings-page #settings-page.nav-back #view-list{ animation:settings-pane-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  @keyframes settings-pane-in{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
  @keyframes settings-from-right{ from{ opacity:0; transform:translateX(24px); } to{ opacity:1; transform:none; } }
  @keyframes settings-from-left{ from{ opacity:0; transform:translateX(-24px); } to{ opacity:1; transform:none; } }
  @media (max-width:860px){
    .settings-page #settings-page.nav-forward > [id^="view-"]:not(#view-list){ animation:settings-from-right var(--motion-standard,250ms) var(--ease-out,ease) both; }
    .settings-page #settings-page.nav-back #view-list{ animation:settings-from-left var(--motion-standard,250ms) var(--ease-out,ease) both; }
  }

  @media (prefers-reduced-motion:reduce){
    .settings-page .cat-row, .settings-page .cat-chevron, .settings-page .detail-crumbs button, .settings-page .btn, .settings-page .appearance-pill, .settings-page .info-row.clickable, .settings-page .info-chevron,
    .settings-page .expand-panel, .settings-page .switch-track, .settings-page .switch-track::before{ transition:none; }
    .settings-page .cat-row .cat-chevron, .settings-page .btn:active, .settings-page .appearance-pill:active{ transform:none !important; }
    .settings-page .switch:active input + .switch-track::before{ width:20px; }
    .settings-page .switch:active input:checked + .switch-track::before{ transform:translateX(18px); }
    .settings-page #settings-page > [id^="view-"], .settings-page #settings-page #view-list{ animation:none !important; }
  }
  
`;
