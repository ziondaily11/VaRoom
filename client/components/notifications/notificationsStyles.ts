// Styles for the Notifications page, scoped under .notifications-page (no
// global :root variables, so nothing leaks into the shell or other pages).
// Class names avoid the ones the old global dark theme (public/js/varoom-dark-theme.css)
// forces with !important (.notif-icon, .icon-btn, .notif-card).
// The look follows Settings and Bookings: soft paper background, grouped
// white cards with hairline rows. Motion follows animation.md: the tab pill
// slides (SegmentedTabs), rows rise in once on the first network load, the
// unread dot fades out when a row is read, and the mark-all tick draws in.

export const NOTIFICATIONS_STYLES = `
  .notifications-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --paper:#F7F6F3;
    --ink:#0F1419; --muted:#536471; --line:rgba(26,18,16,.12);
    --card:#FFFFFF; --card-line:rgba(26,18,16,.08); --row-hover:rgba(26,18,16,.035); --row-unread:rgba(196,30,58,.035);
    --card-shadow:0 1px 2px rgba(26,18,16,.04), 0 6px 20px -14px rgba(26,18,16,.22);
    --search-line:rgba(26,18,16,.2); --skeleton:rgba(26,18,16,.07);
    --green:#1B8A5A; --green-soft:#E7F7EE; --red-soft:#FBE9EC; --amber:#B45309; --amber-soft:#FFF4E1;
    --black-soft:#EFEFF1; --done:#2EAF65; --tint-red:#C41E3A;
    --font-body:-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  }
  html[data-theme="dark"] .notifications-page{
    --white:#000000; --paper:#000000; --ink:#FFFFFF; --muted:#71767b; --line:rgba(255,255,255,.12);
    --card:#141414; --card-line:rgba(255,255,255,.07); --row-hover:rgba(255,255,255,.05); --row-unread:rgba(196,30,58,.09);
    --card-shadow:none; --search-line:rgba(255,255,255,.2); --skeleton:rgba(255,255,255,.08);
    --green-soft:rgba(30,107,60,.18); --red-soft:rgba(196,30,58,.18); --amber-soft:rgba(180,83,9,.18);
    --black-soft:rgba(255,255,255,.1); --done:#5cd68a;
    --green:#7cc99a; --amber:#f2bd76; --tint-red:#f08b9a;
  }
  .notifications-page{
    flex:1; min-width:0; width:100%; min-height:100vh; overflow-y:auto; box-sizing:border-box;
    background:var(--paper); color:var(--ink); font-family:var(--font-body);
    transition:background var(--motion-quick,200ms) var(--ease-out,ease), color var(--motion-quick,200ms) var(--ease-out,ease);
  }
  .notifications-page *, .notifications-page *::before, .notifications-page *::after{ box-sizing:border-box; }
  .client-layout-active .notifications-page,
  .host-layout-active .notifications-page{ min-height:100%; height:auto; overflow-y:visible; }
  .notifications-page button{ font:inherit; color:inherit; }
  .notifications-page :focus-visible{ outline:2px solid var(--ink); outline-offset:2px; }
  .notifications-page .main-inner{ max-width:760px; margin:0 auto; padding:28px 32px 64px; }
  .notifications-page .icon{ width:18px; height:18px; flex-shrink:0; }
  .notifications-page .icon-sm{ width:15px; height:15px; flex-shrink:0; }
  .notifications-page .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

  /* ---------- Header ---------- */
  .notifications-page .page-header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:20px; }
  .notifications-page .page-header-left{ display:flex; align-items:center; gap:10px; min-width:0; }
  .notifications-page .page-header h1{ margin:0 0 4px; font-size:1.625rem; font-weight:700; letter-spacing:-.02em; }
  .notifications-page .page-header p{ margin:0; color:var(--muted); font-size:.875rem; }
  .notifications-page .header-actions{ display:flex; gap:8px; flex-shrink:0; }
  .notifications-page .notif-btn, .notifications-page .notif-menu-btn{
    width:38px; height:38px; border-radius:999px; border:1px solid var(--line); background:var(--card);
    display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink);
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .notifications-page .notif-btn:active, .notifications-page .notif-menu-btn:active{ transform:scale(var(--press-scale,.97)); }
  .notifications-page .notif-btn:disabled{ cursor:default; }
  .notifications-page .notif-btn:disabled:active{ transform:none; }
  @media (hover:hover){ .notifications-page .notif-btn:not(:disabled):hover, .notifications-page .notif-menu-btn:hover{ background:var(--row-hover); } }
  .notifications-page .notif-btn.mark-all{ color:var(--red); }
  .notifications-page .notif-btn.mark-all.is-complete{ color:var(--done); }
  .notifications-page .mark-all-done path{ stroke-dasharray:1; stroke-dashoffset:0; animation:notif-draw var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .notifications-page .mark-all-done path + path{ animation-delay:90ms; }
  @keyframes notif-draw{ from{ stroke-dashoffset:1; } to{ stroke-dashoffset:0; } }
  .notifications-page .notif-menu-btn{ display:none; }

  /* ---------- Toolbar: tabs and search ---------- */
  .notifications-page .toolbar{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; }
  .notifications-page .toolbar .vr-seg{ flex:0 1 auto; }
  .notifications-page .notif-search{ position:relative; flex:0 1 260px; min-width:0; }
  .notifications-page .notif-search > svg{ position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
  .notifications-page .notif-search input{
    width:100%; height:38px; border-radius:999px; border:1px solid var(--search-line); background:transparent; color:var(--ink);
    padding:0 36px 0 34px; font:inherit; font-size:.875rem; outline:none; -webkit-appearance:none; appearance:none;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .notifications-page .notif-search input::-webkit-search-cancel-button{ display:none; }
  .notifications-page .notif-search input::placeholder{ color:var(--muted); }
  .notifications-page .notif-search input:focus{ border-color:var(--muted); }
  .notifications-page .notif-search-clear{
    position:absolute; right:6px; top:50%; transform:translateY(-50%); width:26px; height:26px; border:0; border-radius:999px;
    background:var(--black-soft); color:var(--muted); display:flex; align-items:center; justify-content:center; cursor:pointer;
  }

  /* ---------- Banner for a failed action (the list stays) ---------- */
  .notifications-page .notif-banner{
    display:flex; align-items:center; gap:10px; margin-bottom:16px; padding:10px 14px; border-radius:12px;
    background:var(--red-soft); color:var(--red); font-size:.85rem; font-weight:600;
  }
  .notifications-page .notif-banner span{ flex:1; }
  .notifications-page .notif-banner button{ border:0; background:transparent; color:inherit; font-weight:700; cursor:pointer; padding:4px 6px; }

  /* ---------- Groups and rows ---------- */
  .notifications-page .notif-section{ margin-bottom:22px; }
  .notifications-page .notif-section-title{ margin:0 0 8px 4px; font-size:.75rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
  .notifications-page .notif-group{
    list-style:none; margin:0; padding:0; background:var(--card); border:1px solid var(--card-line);
    border-radius:16px; overflow:hidden; box-shadow:var(--card-shadow);
  }
  .notifications-page .notif-group > li + li .notif-row::before{
    content:''; position:absolute; top:0; left:72px; right:0; height:1px; background:var(--card-line);
  }
  .notifications-page .notif-row{
    position:relative; display:flex; align-items:flex-start; gap:14px; width:100%; margin:0; padding:14px 18px;
    border:0; background:transparent; text-align:left; cursor:pointer;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .notifications-page .notif-row.is-unread{ background:var(--row-unread); }
  @media (hover:hover){ .notifications-page .notif-row:hover{ background:var(--row-hover); } }
  .notifications-page .notif-row:active{ background:var(--row-hover); }
  .notifications-page .notif-row:focus-visible{ outline:2px solid var(--ink); outline-offset:-2px; border-radius:16px; }
  .notifications-page .notif-badge{
    width:40px; height:40px; border-radius:999px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  }
  .notifications-page .notif-badge.tint-green{ background:var(--green-soft); color:var(--green); }
  .notifications-page .notif-badge.tint-red{ background:var(--red-soft); color:var(--tint-red); }
  .notifications-page .notif-badge.tint-amber{ background:var(--amber-soft); color:var(--amber); }
  .notifications-page .notif-badge.tint-black{ background:var(--black-soft); color:var(--ink); }
  .notifications-page .notif-body{ display:block; flex:1; min-width:0; }
  .notifications-page .notif-top{ display:flex; align-items:baseline; gap:8px; min-width:0; }
  .notifications-page .notif-title{ font-size:.9375rem; font-weight:600; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .notifications-page .notif-row.is-unread .notif-title{ font-weight:700; }
  .notifications-page .notif-tag{ flex-shrink:0; font-size:.6875rem; font-weight:600; color:var(--muted); }
  .notifications-page .notif-desc{ display:block; margin-top:3px; color:var(--muted); font-size:.85rem; line-height:1.45; overflow-wrap:anywhere; }
  .notifications-page .notif-preview{ display:block; margin-top:6px; padding-left:10px; border-left:2px solid var(--line); color:var(--ink); font-size:.85rem; line-height:1.45; overflow-wrap:anywhere; }
  .notifications-page .notif-meta{ display:flex; flex-direction:column; align-items:flex-end; gap:8px; flex-shrink:0; padding-top:2px; }
  .notifications-page .notif-time{ font-size:.75rem; color:var(--muted); white-space:nowrap; }
  .notifications-page .notif-meta-row{ display:flex; align-items:center; gap:6px; color:var(--muted); }
  .notifications-page .notif-dot{
    width:8px; height:8px; border-radius:999px; background:var(--red); opacity:1; transform:scale(1);
    transition:opacity var(--motion-quick,200ms) var(--ease-out,ease), transform var(--motion-quick,200ms) var(--ease-out,ease);
  }
  .notifications-page .notif-dot.is-read{ opacity:0; transform:scale(.4); }
  .notifications-page .notif-chevron{ opacity:.55; }

  /* Rows rise in once, the first time the list arrives from the network (a cached visit shows at once). */
  .notifications-page .is-revealing .notif-group > li{ animation:notif-rise var(--motion-standard,250ms) var(--ease-out,ease) both; animation-delay:calc(var(--i, 0) * 30ms); }
  @keyframes notif-rise{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }

  /* ---------- Empty and error states ---------- */
  .notifications-page .notif-state{
    display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; padding:44px 24px;
    background:var(--card); border:1px solid var(--card-line); border-radius:16px; box-shadow:var(--card-shadow);
  }
  .notifications-page .notif-state-badge{ width:48px; height:48px; border-radius:999px; display:flex; align-items:center; justify-content:center; margin-bottom:8px; background:var(--black-soft); color:var(--muted); }
  .notifications-page .notif-state.is-error .notif-state-badge{ background:var(--red-soft); color:var(--red); }
  .notifications-page .notif-state h2{ margin:0; font-size:1.0625rem; font-weight:700; }
  .notifications-page .notif-state p{ margin:0; max-width:340px; color:var(--muted); font-size:.875rem; line-height:1.45; }
  .notifications-page .notif-state-actions{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:14px; }
  .notifications-page .pill-btn{
    display:inline-flex; align-items:center; justify-content:center; min-height:36px; padding:0 16px; border-radius:999px;
    border:1px solid var(--line); background:transparent; color:var(--ink); font-size:.85rem; font-weight:600; text-decoration:none; cursor:pointer;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .notifications-page .pill-btn.primary{ background:var(--ink); border-color:var(--ink); color:var(--paper); }
  .notifications-page .pill-btn:active{ transform:scale(var(--press-scale,.97)); }
  .notifications-page .pill-btn:disabled{ opacity:.6; cursor:default; }
  @media (hover:hover){ .notifications-page .pill-btn:not(.primary):hover{ background:var(--row-hover); } }

  /* ---------- Skeleton (first visit only) ---------- */
  .notifications-page .sk{ display:block; border-radius:8px; background:var(--skeleton); animation:notif-pulse 1.4s ease-in-out infinite; }
  @keyframes notif-pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.55; } }
  .notifications-page .sk-header{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px; }
  .notifications-page .sk-title{ width:190px; height:28px; margin-bottom:8px; }
  .notifications-page .sk-sub{ width:150px; height:14px; }
  .notifications-page .sk-actions{ display:flex; gap:8px; }
  .notifications-page .sk-circle{ width:38px; height:38px; border-radius:999px; }
  .notifications-page .sk-toolbar{ display:flex; justify-content:space-between; gap:12px; margin-bottom:26px; }
  .notifications-page .sk-tabs{ width:320px; height:36px; border-radius:999px; }
  .notifications-page .sk-search{ width:240px; height:38px; border-radius:999px; }
  .notifications-page .sk-label{ width:60px; height:11px; margin:0 0 10px 4px; }
  .notifications-page .sk-row{ display:flex; gap:14px; padding:16px 18px; }
  .notifications-page .sk-row + .sk-row{ border-top:1px solid var(--card-line); }
  .notifications-page .sk-icon{ width:40px; height:40px; border-radius:999px; flex-shrink:0; }
  .notifications-page .sk-lines{ flex:1; display:flex; flex-direction:column; gap:8px; padding-top:3px; }
  .notifications-page .sk-line1{ width:45%; height:14px; }
  .notifications-page .sk-line2{ width:80%; height:12px; }
  .notifications-page .sk-time{ width:44px; height:11px; }

  /* ---------- Phones and tablets ---------- */
  @media (max-width:860px){
    .notifications-page .notif-menu-btn{ display:flex; }
    .notifications-page .page-header{ align-items:center; }
    .notifications-page .main-inner{ padding:18px 16px 40px; }
  }
  @media (max-width:640px){
    .notifications-page .page-header h1{ font-size:1.3125rem; margin-bottom:2px; }
    .notifications-page .page-header p{ font-size:.78rem; }
    .notifications-page .header-actions{ gap:6px; }
    .notifications-page .notif-btn, .notifications-page .notif-menu-btn{ width:36px; height:36px; }
    .notifications-page .toolbar{ flex-direction:column; align-items:stretch; gap:10px; }
    .notifications-page .notif-search{ flex:1 1 auto; order:-1; }
    .notifications-page .toolbar .vr-seg{ align-self:flex-start; }
    .notifications-page .notif-row{ padding:13px 14px; gap:12px; }
    .notifications-page .notif-group > li + li .notif-row::before{ left:64px; }
    .notifications-page .notif-badge{ width:38px; height:38px; }
    .notifications-page .notif-tag{ display:none; }
    .notifications-page .sk-toolbar{ flex-direction:column; }
    .notifications-page .sk-tabs, .notifications-page .sk-search{ width:100%; }
  }

  @media (prefers-reduced-motion:reduce){
    .notifications-page .is-revealing .notif-group > li, .notifications-page .mark-all-done path, .notifications-page .sk{ animation:none; }
    .notifications-page .notif-dot, .notifications-page .notif-btn, .notifications-page .pill-btn, .notifications-page .notif-row{ transition:none; }
    .notifications-page .notif-btn:active, .notifications-page .pill-btn:active, .notifications-page .notif-menu-btn:active{ transform:none; }
  }
`;
