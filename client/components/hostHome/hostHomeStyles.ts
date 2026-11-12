// Styles for /host-home, ported unchanged from legacy-pages/host-home.html
// (this style exists only while the page is mounted). The page's third
// style block styled only its own account menu, which the host shell
// replaces; it is not ported.

export const HOST_HOME_STYLES = `
  :root{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#0F1419; --paper:#FFFFFF;
    --surface-card:#F7F9F9;
    --muted:#536471;
    --font-display:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-body:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-brand:'Fraunces', serif;
    --glass-bg:rgba(255,255,255,.85);
    --glass-border:rgba(0,0,0,.08);
    --glass-shadow:0 24px 55px rgba(0,0,0,.08);
    --glow-a:transparent;
    --glow-b:transparent;
    --line:#CFD9DE;
    --line-soft:#E1E8ED;
    --control-bg:#EFF3F4;
    --control-active:#E9E7E2;
    --control-hover:#EFEDE8;
    --control-strong:#0F1419;
    --control-strong-text:#FFFFFF;
    --neutral-icon:#536471;
    --tile-bg:#F7F9F9;
    --media-stage-fill:#F7F9F9;
    --host-rail-outline:#CFD9DE;
  }
  [data-theme="dark"]{
    --white:#000000;
    --paper:#000000;
    --surface-card:#0d0d0d;
    --ink:#E7E9EA;
    --muted:#71767b;
    --glass-bg:rgba(0,0,0,.85);
    --glass-border:rgba(255,255,255,.09);
    --glass-shadow:0 24px 55px rgba(0,0,0,.5);
    --glow-a:transparent;
    --glow-b:transparent;
    --line:#2f3336;
    --line-soft:#202327;
    --control-bg:#202327;
    --control-active:#2f3336;
    --control-hover:rgba(239, 243, 244, 0.1);
    --control-strong:#EFF3F4;
    --control-strong-text:#0F1419;
    --neutral-icon:#71767b;
    --tile-bg:#0d0d0d;
    --media-stage-fill:#0a0a0a;
    --host-rail-outline:rgba(255,255,255,.28);
  }
  *{ margin:0; padding:0; box-sizing:border-box; }
  body{
    font-family:var(--font-body); color:var(--ink); height:100vh; overflow:hidden;
    transition:background .2s ease, color .2s ease;
    background:var(--paper);
  }
  /* Continuous canvas; hierarchy comes from hairline dividers. */
  html[data-theme="light"] body,
  html[data-theme="light"] .app-shell,
  html[data-theme="light"] .sidebar,
  html[data-theme="light"] .main-col,
  html[data-theme="light"] .topbar,
  html[data-theme="light"] .dash-main{ background:#fff; }

  html[data-theme="dark"] body,
  html[data-theme="dark"] .app-shell,
  html[data-theme="dark"] .sidebar,
  html[data-theme="dark"] .main-col,
  html[data-theme="dark"] .topbar,
  html[data-theme="dark"] .dash-main{ background:#000000; }

  a{ color:inherit; text-decoration:none; }
  button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  :focus-visible{ outline:2px solid var(--red); outline-offset:2px; }

  .app-shell{
    display:grid;
    grid-template-columns: 295px minmax(0, 1fr);
    width:100%;
    height:100vh;
    overflow:hidden;
    background:var(--paper);
  }

  /* ---------- SIDEBAR (line-separated column) ----------
     Spacious vertical layout emulating X navigation. */
  .sidebar{
    width:295px;
    flex-shrink:0;
    background:var(--paper);
    border:none;
    border-right:1px solid var(--line);
    border-radius:0;
    box-shadow:none;
    margin:0;
    padding:0.75rem 0.85rem 1rem;
    display:flex;
    flex-direction:column;
    gap:0.75rem;
    height:100vh;
    overflow-y:auto;
    scrollbar-width:none;
    box-sizing:border-box;
  }
  .sidebar::-webkit-scrollbar{ display:none; }

  .logo{
    font-family:var(--font-brand);
    font-weight:900;
    font-size:1.5rem;
    display:flex;
    align-items:baseline;
    padding:.35rem .6rem;
    margin-bottom:.2rem;
    text-decoration:none;
  }
  .logo .va{ color:var(--red); }
  .logo .room{ color:var(--ink); }
  .beta-pill{ margin-left:auto; font-size:.68rem; font-weight:600; background:rgba(196,30,58,.12); color:var(--red); padding:.15rem .5rem; border-radius:100px; }
  .nav-group{ display:flex; flex-direction:column; gap:.35rem; }
  .nav-group + .nav-group{ border-top:1px solid var(--line); padding-top:.75rem; margin-top:.15rem; }
  .nav-label{ font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); padding:.25rem .75rem .1rem; }

  .nav-item{
    position:relative; display:flex; align-items:center; gap:1rem;
    padding:.65rem .95rem; border-radius:9999px;
    font-size:1rem; font-weight:500; color:var(--ink);
    cursor:pointer; transition:background .15s ease, color .15s ease;
    text-decoration:none;
  }
  .nav-item:hover{ background:var(--control-hover); }
  .nav-item.active{ background:var(--control-active); color:var(--ink); font-weight:700; }
  .nav-item svg{ width:20px; height:20px; flex-shrink:0; }
  .notif-nav-badge{
    position:absolute; top:50%; right:.75rem; min-width:18px; height:18px;
    padding:0 5px; border-radius:999px; background:var(--red); color:#fff;
    transform:translateY(-50%);
    display:flex; align-items:center; justify-content:center; font-size:.65rem; font-weight:700; line-height:1;
  }
  .notif-nav-badge[hidden]{ display:none; }

  .nav-item.soon{ color:var(--muted); cursor:default; }
  .nav-item.soon:hover{ background:none; }

  button.nav-item.soon-active{
    width:100%; text-align:left; font-family:inherit; color:var(--muted);
  }
  button.nav-item.soon-active:hover{ background:var(--control-hover); color:var(--ink); }

  .soon-pill{
    margin-left:auto; font-size:.68rem; font-weight:600;
    background:var(--control-bg); color:var(--muted);
    padding:.15rem .5rem; border-radius:100px;
  }

  .sidebar .list-space-btn{
    display:flex; align-items:center; justify-content:center; gap:.5rem;
    background:var(--red) !important; color:#ffffff !important;
    border:none !important; border-radius:9999px !important;
    padding:.75rem 1rem !important; font-size:.95rem !important; font-weight:700 !important;
    width:100%; box-sizing:border-box; text-decoration:none;
    box-shadow:0 4px 14px rgba(196,30,58,.25);
    margin:.35rem 0;
    transition:background .18s ease, transform .15s ease;
  }
  .sidebar .list-space-btn:hover{
    background:var(--red-deep) !important; color:#ffffff !important;
  }




  .toast{
    position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(20px);
    background:var(--ink); color:var(--white); padding:.8rem 1.4rem; border-radius:100px;
    font-size:.88rem; font-weight:600; z-index:300; opacity:0; pointer-events:none;
    transition:opacity .25s ease, transform .25s ease;
  }
  .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }

  /* ---------- MAIN COLUMN ----------
     A single grid controls both the topbar row and the dashboard body,
     using one shared column track set (main | 1px divider | rail). The
     divider is its own grid item spanning grid-row:1/-1, so the line runs
     from the very top of the viewport straight through the topbar and
     down the full height. */
  /* ---------- MAIN COLUMN ----------
     Structured 3-column layout emulating X:
     Flexible middle feed, 1px hairline divider, flexible right rail matching client-home. */
  .main-col{
    display:grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(620px, 1.3fr) 1px minmax(380px, 1fr);
    height:100vh;
    overflow:hidden;
    min-width:0;
    background:var(--paper);
  }

  .topbar{
    grid-column: 1;
    grid-row: 1;
    display:flex; align-items:center; gap:.75rem;
    padding:.75rem 1rem;
    width:100%;
    box-sizing:border-box;
    background:transparent;
    border-bottom:1px solid var(--line);
  }
  .topbar-list-btn{
    flex-shrink:0; white-space:nowrap;
    display:inline-flex; align-items:center; gap:.45rem;
    padding:.55rem 1.15rem; border-radius:9999px;
    font-size:.88rem; font-weight:700;
    background:var(--control-strong) !important;
    color:var(--control-strong-text) !important;
    transition:all .18s ease;
  }
  .topbar-list-btn:hover{ opacity:.9; transform:translateY(-1px); }

  .col-divider{
    grid-column: 2;
    grid-row: 1 / -1;
    background:var(--line);
    width:1px;
    height:100%;
  }

  .search-wrap{
    flex:1; display:flex; align-items:center; gap:.6rem;
    background:transparent; border-radius:9999px; padding:.55rem 1rem;
    border:1px solid var(--line);
    box-shadow:none;
    min-width:0;
    transition:all .18s ease;
  }
  .search-wrap input{ flex:1; min-width:0; border:none; background:transparent; font-family:inherit; font-size:.92rem; color:var(--ink); }
  .search-wrap input:focus{ outline:none; }
  .search-wrap:focus-within{
    border-color:var(--muted);
    background:transparent;
    box-shadow:0 0 0 1px var(--muted);
  }
  .search-btn{ color:var(--muted); display:flex; align-items:center; }
  .search-wrap input::placeholder{ color:var(--muted); opacity:1; }

  .topbar-right{ margin-left:auto; display:flex; align-items:center; gap:1.2rem; }
  .icon-btn{ color:var(--muted); }
  .icon-btn:hover{ color:var(--ink); }

  .topbar-avatar-btn{ display:none; }
  .avatar-circle{
    width:38px; height:38px; border-radius:50%; background:var(--red); color:var(--white);
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem;
  }

  /* ---------- DASHBOARD HEADER ---------- */
  .dash-header{ padding:.65rem 0 0; width:100%; box-sizing:border-box; }

  /* dash-body is a pass-through wrapper only — display:contents lifts
     dash-main/host-rail up to be direct grid items of .main-col (row 2),
     sharing the exact same column tracks as the topbar/divider above. */
  .dash-body{
    display:contents;
  }
  .dash-main{
    grid-column: 1;
    grid-row: 2;
    min-width:0;
    overflow-y:auto;
    height:100%;
    padding:0;
    scrollbar-width:none;
  }
  .dash-main::-webkit-scrollbar{ display:none; }
  /* A system feed notice: the listing-style separators keep it visible
     without introducing a coloured card or changing feed proportions. */
  .suspension-notice{display:block;margin:0 0 1rem;padding:1.15rem 1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:transparent;color:var(--ink)}
  .suspension-notice-title{font-size:1.15rem;font-weight:750;letter-spacing:-.02em;margin:0 0 .35rem}.suspension-notice-copy{max-width:48rem;margin:0;font-size:.9rem;line-height:1.5;color:var(--muted)}.suspension-notice-action{display:inline-block;margin-top:.65rem;color:var(--red);font-size:.88rem;font-weight:700}
  @media(max-width:680px){.suspension-notice{padding:.9rem 0}.suspension-notice-title{font-size:1.08rem}.suspension-notice-action{font-size:.82rem}}
  .host-rail{
    grid-column: 3;
    grid-row: 2;
    padding:0 1.25rem 3rem 1.25rem;
    display:flex;
    flex-direction:column;
    align-items:stretch;
    gap:1rem;
    overflow-y:auto;
    height:100%;
    scrollbar-width:none;
    min-width:0;
    width:100%;
    box-sizing:border-box;
    align-content:start;
  }
  .host-rail::-webkit-scrollbar{ display:none; }

  .dash-header,
  .feed-area {
    width:100%;
    margin:0 auto;
    min-width:0;
    box-sizing:border-box;
  }

  .feed-area {
    min-width:0;
    padding-bottom:2rem;
    border-right:none;
    box-sizing:border-box;
  }

  .list-btn-primary{
    display:flex; align-items:center; gap:.5rem;
    background:var(--red); color:var(--white);
    padding:.75rem 1.3rem; border-radius:100px; font-weight:700; font-size:.9rem;
    transition:background .2s ease;
  }
  .list-btn-primary:hover{ background:var(--red-deep); }

  .stats-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.85rem; }
  .stats-head h2{ font-size:.95rem; font-weight:800; color:var(--ink); letter-spacing:-.01em; }
  .stats-head a{ font-size:.82rem; font-weight:600; color:var(--red); text-decoration:none; }
  .stats-head a:hover{ text-decoration:underline; }
  .property-news-refresh{ border:0; background:transparent; color:var(--red); font:inherit; font-size:.78rem; font-weight:600; cursor:pointer; padding:0; }
  .property-news-refresh:hover{ text-decoration:underline; }
  .property-news-refresh:disabled{ cursor:default; opacity:.6; text-decoration:none; }

  @media (max-width:1360px){
    .main-col{ grid-template-columns: minmax(580px, 1.25fr) 1px minmax(360px, 1fr); }
    .dash-main{ min-width:0; }
    .host-rail{ padding-left:1.25rem; padding-right:1.25rem; }
  }

  @media (max-width:1180px){
    .host-rail{ display:none; }
    .col-divider{ display:none; }
    .main-col{ grid-template-columns: minmax(0, 760px); }
    /* Fill the column: auto margins alone sized it to the tabs (594px on a 390px phone). */
    .dash-main{ margin:0 auto; min-width:0; width:100%; }
    .dash-header,
    .feed-area{ min-width:0; }
  }

  @media (max-width:520px){
    .topbar-list-btn{ width:42px; height:42px; padding:0; justify-content:center; }
    .topbar-list-btn .btn-label{ display:none; }
  }

  /* ---------- ATTENTION ROW STYLES (reused inside .notif-panel-card) ---------- */
  .attention-list{ display:flex; flex-direction:column; }
  .attention-row{
    display:flex; align-items:center; gap:.8rem;
    padding:.7rem 0; border-bottom:1px solid var(--line-soft);
  }
  .attention-row:last-child{ border-bottom:none; }
  .attention-icon{
    width:34px; height:34px; border-radius:50%; flex-shrink:0;
    background:rgba(196,30,58,.08); color:var(--red);
    display:flex; align-items:center; justify-content:center;
  }
  .attention-body{ min-width:0; }
  .attention-title{ font-size:.88rem; font-weight:600; }
  .attention-sub{ font-size:.78rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .attention-row a.attention-link{
    margin-left:auto; font-size:.8rem; font-weight:600; color:var(--red); flex-shrink:0;
  }
  .attention-clear{
    display:flex; align-items:center; gap:.8rem; padding:.4rem 0;
  }
  .attention-clear .attention-icon{ background:#EAF4EE; color:#1E6B3C; }
  .attention-clear-title{ font-size:.88rem; font-weight:600; }
  .attention-clear-sub{ font-size:.78rem; color:var(--muted); }

  /* ---------- DESKTOP RIGHT-RAIL MODULES ----------
     Transparent module sections enclosed in a single perimeter container outline, matching client-home. */
  .host-rail > .sidebar-module{
    position:relative;
    width:100%;
    height:auto;
    flex-shrink:0;
    box-sizing:border-box;
    container-type:inline-size;
    background:transparent !important;
    border:0 !important;
    border-radius:16px !important;
    box-shadow:none !important;
    padding:1.2rem 1.2rem 1.3rem !important;
    margin-bottom:0 !important;
  }
  .host-rail > .sidebar-module::after{
    content:"";
    position:absolute;
    inset:0;
    border:1px solid var(--host-rail-outline);
    border-radius:16px;
    pointer-events:none;
  }
  .host-rail > .sidebar-module.empty-state-card{
    padding:1.5rem 1.25rem !important;
  }
  .host-rail > .sidebar-module .stats-head{ margin-bottom:.85rem; }
  .host-rail > .sidebar-module .stats-head h2{ font-size:1.02rem; font-weight:800; color:var(--ink); letter-spacing:-.01em; }

  /* ---------- LISTINGS AT A GLANCE ---------- */
  .listings-glance-card{ }
  .listings-glance-grid{ display:grid; grid-template-columns:repeat(2, 1fr); gap:.75rem; width:100%; }
  @container (min-width: 480px){
    .listings-glance-grid{ grid-template-columns:repeat(3, 1fr); gap:.8rem; }
  }
  @container (min-width: 660px){
    .listings-glance-grid{ grid-template-columns:repeat(4, 1fr); gap:.85rem; }
  }
  .glance-tile{
    background:transparent !important; border:1px solid var(--line) !important; border-radius:12px;
    overflow:hidden; display:block; transition:border-color .15s ease;
  }
  .glance-tile:hover{ border-color:var(--muted) !important; }
  .glance-thumb{
    height:76px; background:transparent !important; color:var(--muted);
    display:flex; align-items:center; justify-content:center;
    border-bottom:1px solid var(--line);
  }
  .glance-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
  .glance-body{ padding:.5rem .6rem; }
  .glance-title{ font-size:.82rem; font-weight:700; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .glance-sub{ font-size:.72rem; color:var(--muted); margin-top:.1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .glance-tile.add-tile{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:.35rem; color:var(--muted); min-height:104px; font-size:.78rem; font-weight:600;
    border:1px dashed var(--line) !important; background:transparent !important;
  }
  .glance-tile.add-tile:hover{ color:var(--red); border-color:var(--red) !important; }

  /* ---------- VAROOM UPDATES ---------- */
  .varoom-updates-card{ }
  #varoom-updates{ width:100%; }
  .update-card{
    width:100%;
    box-sizing:border-box;
    background:transparent;
    border:none !important;
    border-bottom:1px solid var(--line) !important;
    border-radius:0 !important;
    padding:0 0 .9rem 0 !important;
    margin-bottom:0;
  }
  .update-card:last-child{
    border-bottom:none !important;
    padding-bottom:0 !important;
  }
  .update-photos{ display:grid; grid-template-columns:repeat(auto-fit, minmax(70px, 1fr)); gap:.4rem; margin-bottom:.5rem; }
  .update-photos .update-img{ width:100%; aspect-ratio:1/1; object-fit:cover; margin-bottom:0; border-radius:8px; }
  .update-img{ width:100%; border-radius:10px; margin-bottom:.5rem; display:block; }
  .update-title{ font-weight:700; font-size:.88rem; color:var(--ink); margin-bottom:.2rem; }
  .update-body{ font-size:.82rem; color:var(--muted); line-height:1.4; }

  /* ---------- PROPERTY NEWS ----------
     The desktop instance participates in the rail module system. The mobile
     instance retains its existing responsive treatment below. */
  .property-news-card:not(.sidebar-module){
    background:var(--white); border:1px solid var(--line); border-radius:0;
    box-shadow:none; padding:1.2rem 1.2rem 1.1rem;
    border-bottom:1px solid var(--line);
  }

  /* ---------- NOTIFICATIONS PANEL (glass) ---------- */
  .notif-panel-card{ }
  .notif-panel-head{ display:flex; align-items:center; gap:.6rem; margin-bottom:.7rem; }
  .notif-panel-bell{
    width:28px; height:28px; border-radius:50%; background:rgba(196,30,58,.14); color:var(--red);
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .notif-panel-head h2{ font-size:.92rem; font-weight:700; color:var(--ink); }
  .notif-panel-badge{
    margin-left:auto; font-size:.7rem; font-weight:700; background:var(--red); color:#fff;
    padding:.2rem .55rem; border-radius:100px; flex-shrink:0;
  }
  .property-news-list{ display:flex; flex-direction:column; gap:0; width:100%; }
  .property-news-item{
    display:block;
    background:transparent;
    border:none !important;
    border-bottom:1px solid var(--line) !important;
    border-radius:0 !important;
    padding:.85rem 0 !important;
    box-shadow:none !important;
    transition:none;
  }
  .property-news-item:last-child{
    border-bottom:none !important;
    padding-bottom:0 !important;
  }
  .property-news-item:hover .property-news-title{ color:var(--red); }
  .property-news-image-wrap{ display:block; height:0; overflow:hidden; margin:0; border-radius:10px; background:rgba(26,18,16,.04); opacity:0; }
  .property-news-image-wrap.is-loaded{ height:108px; margin:0 0 .65rem; opacity:1; }
  .property-news-image{ display:block; width:100%; height:108px; object-fit:cover; }
  .property-news-kicker{ color:var(--muted); font-size:.7rem; font-weight:600; margin-bottom:.15rem; }
  .property-news-title{ font-size:.9rem; font-weight:700; line-height:1.35; color:var(--ink); transition:color .15s ease; }
  .property-news-meta{ display:flex; align-items:center; flex-wrap:wrap; gap:.35rem; margin-top:.25rem; color:var(--muted); font-size:.74rem; }
  .property-news-source{ margin-top:.25rem; color:var(--muted); font-size:.68rem; line-height:1.35; }
  .property-news-source-link{ color:inherit; text-decoration:underline; text-decoration-color:rgba(196,30,58,.38); text-underline-offset:2px; }
  .property-news-source-link:hover{ color:var(--red); text-decoration-color:currentColor; }
  .property-news-detail-link{ display:block; color:inherit; }
  .property-news-status{
    display:inline-flex; align-items:center; width:max-content; margin-top:.45rem;
    border-radius:100px; padding:.18rem .48rem; background:var(--control-active); color:var(--ink);
    font-size:.64rem; font-weight:700; letter-spacing:.05em;
  }
  .property-news-status.status-effective, .property-news-status.status-approved{ background:#EAF4EE; color:#1E6B3C; }
  .property-news-empty, .property-news-error{ color:var(--muted); font-size:.82rem; line-height:1.5; padding:.2rem 0; }
  .property-news-empty-card{
    background:transparent; border:none; border-radius:0;
    padding:1.4rem 1rem 1rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:.35rem;
  }
  .property-news-empty-icon-wrap{
    width:36px; height:36px; border-radius:50%; background:rgba(196,30,58,.08); color:var(--red);
    display:flex; align-items:center; justify-content:center; margin-bottom:.15rem;
  }
  .property-news-empty-title{ font:700 .88rem/1.3 var(--font-display); color:var(--ink); }
  .property-news-empty-desc{ font-size:.76rem; color:var(--muted); line-height:1.45; margin:0; }
  .property-news-empty-badge{
    display:inline-flex; align-items:center; gap:.4rem; font-size:.68rem; font-weight:600;
    color:#1E6B3C; background:#EAF4EE; padding:.2rem .6rem; border-radius:100px; margin-top:.35rem;
  }
  .property-news-empty-dot{
    width:6px; height:6px; border-radius:50%; background:#28a745; box-shadow:0 0 0 2px rgba(40,167,69,.2);
  }
  .property-news-error{ color:var(--red-deep); }
  .property-news-view-all{ display:inline-flex; margin-top:.85rem; font-size:.82rem; font-weight:600; color:var(--red); }
  .property-news-view-all:hover{ color:var(--red-deep); }
  @keyframes news-shimmer{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }

  .mobile-widget-slot{ display:none; }

  /* ---------- NO LISTINGS EMPTY STATE ---------- */
  .empty-state-card{
    text-align:center;
  }
  .empty-state-card .empty-icon{
    width:44px; height:44px; border-radius:50%; margin:0 auto .8rem;
    background:rgba(196,30,58,.08); color:var(--red-deep);
    display:flex; align-items:center; justify-content:center;
  }
  .empty-state-card h3{ font-family:var(--font-display); font-weight:600; font-size:1.1rem; margin-bottom:.3rem; }
  .empty-state-card p{ font-size:.85rem; color:var(--muted); margin-bottom:1rem; }
  .empty-state-card .list-btn-primary{ display:inline-flex; }

  .feed-area{ padding:0 0 5rem; width:100%; box-sizing:border-box; }

  .tabs{
    display:flex;
    flex-wrap:nowrap;
    overflow-x:auto;
    scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
    gap:.45rem;
    padding:0 1rem .65rem;
    border-bottom:1px solid var(--line);
    margin-bottom:0;
  }
  .tabs::-webkit-scrollbar{ display:none; }
  .tab{
    flex-shrink:0;
    white-space:nowrap;
    padding:.42rem .95rem;
    border-radius:9999px;
    font-size:.86rem;
    font-weight:600;
    background:transparent;
    border:1px solid var(--line);
    color:var(--muted);
    cursor:pointer;
    transition:all .15s ease;
  }
  .tab:hover{ background:var(--control-hover); color:var(--ink); }
  .tab.active{ background:var(--control-active); color:var(--ink); font-weight:700; border-color:var(--line); }

  .state-msg{ color:var(--muted); font-size:.95rem; padding:2rem 0; text-align:center; }

  /* ---------- HOME FEED SKELETON ---------- */
  @keyframes skel-pulse{ 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
  .skel{ background:var(--line-soft); border-radius:6px; animation:skel-pulse 1.3s ease-in-out infinite; }

  .skel-card{
    background:transparent;
    border:0;
    border-bottom:1px solid var(--line);
    border-radius:0;
    padding:1rem 1.25rem .85rem;
    margin:0;
  }
  .skel-card-head{ display:flex; align-items:center; gap:.7rem; margin-bottom:.55rem; }
  .skel-avatar{ width:38px; height:38px; border-radius:50%; flex-shrink:0; }
  .skel-card-head-body{ flex:1; min-width:0; }
  .skel-menu{ width:24px; height:24px; flex:0 0 24px; border-radius:50%; }
  .skel-name{ width:130px; height:12px; margin-bottom:.4rem; }
  .skel-loc{ width:190px; height:9px; }
  .skel-line{ height:9px; margin-bottom:.4rem; }
  .skel-line.short{ width:55%; margin-bottom:.75rem; }
  .skel-media{ width:auto; max-width:460px; height:auto; aspect-ratio:4 / 3; border-radius:16px; margin:0 0 .75rem 56px; }
  .skel-line{ margin-left:56px; }
  .skel-actions{ display:flex; gap:.5rem; }
  .skel-pill{ width:58px; height:24px; border-radius:999px; }

  .home-widget-loader{
    min-height:180px; width:100%; display:grid; place-items:center;
    box-sizing:border-box; color:var(--muted); font-size:.82rem; text-align:center;
  }
  .home-widget-message{ width:100%; display:grid; place-items:center; box-sizing:border-box; padding:1rem; color:var(--muted); font-size:.82rem; text-align:center; }
  .home-widget-spinner{
    width:22px; height:22px; border:2px solid var(--line); border-top-color:var(--muted);
    border-radius:50%; animation:home-widget-spin .8s linear infinite;
  }
  @keyframes home-widget-spin{ to{ transform:rotate(360deg); } }
  @media (prefers-reduced-motion:reduce){ .home-widget-spinner{ animation:none; border-top-color:var(--line); } }
  .home-widget-content{ display:flex; flex-direction:column; gap:.9rem; }
  .home-widget-content[data-loading="true"]{ min-height:90px; }
  .home-widget-content[data-loading="true"] .home-widget-loader{ min-height:90px; }
  #listings-glance-grid[data-loading="true"]{ min-height:350px; display:grid; place-items:center; }
  #listings-glance-grid[data-loading="true"] > .home-widget-loader{ grid-column:1 / -1; }
  .property-news-list{ min-height:180px; }

  .card{
    background:transparent;
    border:0;
    border-bottom:1px solid var(--line);
    border-radius:0;
    padding:1rem 1.25rem .85rem;
    margin:0;
    color:var(--ink);
    display:flex;
    flex-direction:column;
  }
  [data-theme="dark"] .card{ color:var(--ink); }
  .card-head{ position:relative; z-index:10; display:flex; align-items:center; gap:.65rem; margin-bottom:.45rem; }
  .card-avatar{ width:38px; height:38px; border-radius:50%; background:var(--red-deep); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem; flex-shrink:0; overflow:hidden; }
  .card-avatar img{ width:100%; height:100%; object-fit:cover; }
  .card-host-name{ font-weight:700; font-size:.95rem; display:flex; align-items:center; gap:.35rem; color:var(--ink); text-decoration:none; }
  .verified-tick{ color:var(--red); font-size:.85rem; }
  .card-location{ font-size:.82rem; color:var(--muted); }
  .card-map-link{ color:var(--red); font-weight:600; }
  .card-map-link:hover{ text-decoration:underline; }
  .card-time{ margin-left:auto; font-size:.78rem; color:var(--muted); }
  .card-menu-wrap{ position:relative; z-index:11; margin-left:.4rem; }
  .card-menu-btn{
    width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    color:var(--muted); background:none; border:none; cursor:pointer; flex-shrink:0;
  }
  .card-menu-btn:hover{ background:var(--control-hover); color:var(--ink); }

  .card-menu-dropdown{
    display:none; position:absolute; top:32px; right:0; z-index:100;
    background:var(--white); border:1px solid var(--line); border-radius:12px;
    box-shadow:0 12px 30px -10px rgba(26,18,16,.3); min-width:170px; padding:.4rem;
  }
  .card-menu-dropdown.open{ display:block; }
  .card-menu-dropdown.open.is-portaled{
    position:fixed; top:0; right:auto; z-index:1000;
    max-height:calc(100vh - 16px); max-width:calc(100vw - 16px);
    overflow-y:auto; overscroll-behavior:contain;
  }
  .card-video .varoom-video-player{ z-index:1; }
  .card-menu-item{
    display:block; width:100%; text-align:left; padding:.6rem .8rem; border-radius:8px;
    font-size:.85rem; font-weight:500; color:var(--ink); background:none; border:none; cursor:pointer;
  }
  .card-menu-item:hover{ background:rgba(196,30,58,.08); }
  .card-menu-item.destructive{ border-top:1px solid var(--line-soft); margin-top:.35rem; padding-top:.8rem; color:#C41E3A; }
  [data-theme="dark"] .card-menu-item.destructive{ color:#ff7186; }
  .card-menu-section{ padding:.45rem .8rem .2rem; color:var(--ink); opacity:.75; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
  .modal-overlay{ display:none; position:fixed; inset:0; z-index:300; background:rgba(26,18,16,.5); align-items:center; justify-content:center; padding:1rem; }
  .modal-overlay.open{ display:flex; }
  .modal-card{ background:var(--white); color:var(--ink); border-radius:18px; padding:1.5rem; max-width:460px; width:100%; }
  .modal-card h2{ margin-bottom:1rem; }
  .modal-field{ margin-bottom:.8rem; }
  .modal-field label{ display:block; font-size:.78rem; font-weight:700; margin-bottom:.3rem; }
  .modal-field input, .modal-field textarea, .modal-field select{ width:100%; padding:.65rem; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); font:inherit; }
  .modal-field textarea{ min-height:80px; resize:vertical; }
  .modal-actions{ display:flex; gap:.6rem; margin-top:1rem; }
  .modal-actions button{ flex:1; padding:.7rem; border-radius:999px; font-weight:600; }
  .modal-cancel{ border:1px solid var(--line); color:var(--ink); }
  .modal-save{ background:var(--red); color:#fff; }
  .niche-prompt-card{ max-width:430px; }
  .niche-prompt-card p{ color:var(--muted); font-size:.9rem; line-height:1.5; margin:-.4rem 0 1.1rem; }
  .niche-prompt-options{ display:grid; grid-template-columns:1fr 1fr; gap:.6rem; }
  .niche-prompt-option{ padding:.75rem .8rem; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--paper); font:inherit; font-weight:600; text-align:left; cursor:pointer; }
  .niche-prompt-option:hover, .niche-prompt-option:focus-visible{ border-color:var(--red); color:var(--red-deep); }
  .niche-prompt-option:disabled{ opacity:.6; cursor:wait; }
  .niche-prompt-msg{ min-height:1.2em; color:var(--red); font-size:.82rem; margin:.8rem 0 0; }
  .listing-status-banner{ color:var(--red-deep); font-size:.8rem; font-weight:700; margin:.2rem 0 .6rem; text-transform:capitalize; }
  .glance-tile > .card-menu-wrap{ position:absolute; top:.4rem; right:.4rem; z-index:3; }

  .report-modal-overlay{
    display:none; position:fixed; inset:0; z-index:250;
    background:rgba(26,18,16,.5); align-items:center; justify-content:center; padding:1.2rem;
  }
  .report-modal-overlay.open{ display:flex; }
  .report-modal{
    background:var(--white); border-radius:18px; padding:1.6rem 1.7rem; max-width:420px; width:100%;
  }
  .report-modal h3{ font-family:var(--font-display); font-weight:600; font-size:1.2rem; margin-bottom:.4rem; }
  .report-modal p{ font-size:.85rem; color:var(--muted); margin-bottom:1.1rem; line-height:1.5; }
  .report-modal .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1rem; }
  .report-modal label{ font-size:.86rem; font-weight:600; }
  .report-modal select, .report-modal textarea{
    font-family:inherit; font-size:.92rem; padding:.7rem .85rem; border:1px solid var(--line);
    border-radius:10px; background:var(--paper); color:var(--ink); width:100%;
  }
  .report-modal textarea{ min-height:80px; resize:vertical; }
  .report-modal-actions{ display:flex; gap:.7rem; margin-top:1.2rem; }
  .report-modal-actions button{ flex:1; padding:.8rem 1rem; border-radius:100px; font-weight:600; font-size:.9rem; }
  .report-cancel-btn{ background:transparent; border:1.5px solid var(--line); color:var(--ink); }
  .report-submit-btn{ background:var(--red); color:#fff; }
  .report-submit-btn:hover{ background:var(--red-deep); }
  .report-modal-msg{ font-size:.83rem; margin-top:.7rem; text-align:center; }
  .report-modal-msg.error{ color:var(--red); }
  .report-modal-msg.success{ color:#2e7d32; }

  .card-caption, .card-desc{ font-size:.94rem; line-height:1.45; margin:0 0 .65rem; color:var(--ink); overflow-wrap:anywhere; }
  [data-theme="dark"] .card-caption, [data-theme="dark"] .card-desc{ color:var(--ink); }

  .card-photos{
    display:grid; grid-template-columns:1fr 1fr; gap:.45rem;
    border-radius:16px; border:1px solid var(--line); overflow:hidden; margin-bottom:.65rem;
  }
  .card-photos img{ width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; display:block; }
  .card-photos.single{ grid-template-columns:1fr; }
  .card-photos.single img{ height:clamp(240px, 36vw, 440px); }
  .media-carousel{
    position:relative; overflow:hidden; border-radius:16px; border:1px solid var(--line); margin-bottom:.65rem; background:#000;
    touch-action:pan-y; user-select:none; -webkit-user-select:none;
  }
  .media-carousel.single-media{ border-radius:16px; }
  .media-slide-track{
    display:flex; width:100%; transition:transform .28s ease;
    will-change:transform;
  }
  .media-slide{ flex:0 0 100%; width:100%; }
  .media-slide img{ display:block; width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; }
  .media-carousel.single-media .media-slide img{ height:clamp(240px, 36vw, 440px); }
  .media-index-pill{
    position:absolute; top:.7rem; right:.7rem; z-index:2;
    border-radius:999px; padding:.28rem .6rem; background:rgba(26,18,16,.68);
    color:#fff; font-size:.72rem; font-weight:700; line-height:1;
    backdrop-filter:blur(6px);
  }
  .media-dots{
    position:absolute; z-index:3; left:50%; bottom:.65rem; transform:translateX(-50%);
    display:flex; justify-content:center; align-items:center; gap:.38rem;
    padding:.3rem .5rem; min-height:16px; border-radius:999px;
    background:rgba(26,18,16,.42); backdrop-filter:blur(5px);
  }
  .media-dot{
    width:6px; height:6px; border-radius:50%; background:var(--line);
    transition:all .2s ease; display:inline-block;
  }
  .media-dot.active{ background:var(--red); transform:scale(1.2); }
  .media-carousel-arrow{
    position:absolute; z-index:3; top:50%; transform:translateY(-50%);
    width:34px; height:34px; display:none; place-items:center; border-radius:50%;
    background:rgba(26,18,16,.58); color:#fff; font-size:1.7rem; line-height:1;
    transition:background .18s ease, transform .18s ease;
  }
  .media-carousel-arrow:hover{ background:rgba(26,18,16,.78); transform:translateY(-50%) scale(1.06); }
  .media-carousel-arrow.prev{ left:.65rem; }
  .media-carousel-arrow.next{ right:.65rem; }
  @media (hover:hover) and (pointer:fine){ .media-carousel:not(.single-media) .media-carousel-arrow{ display:grid; } }
  .card-video{ position:relative; border-radius:16px; border:1px solid var(--line); overflow:hidden; margin-bottom:.65rem; background:#000; }
  .card-video video{ display:block; width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; background:#000; }
  .card-video.single video{ height:clamp(240px, 36vw, 440px); }
  .host-video-upload{ margin:0 0 .75rem; }
  .host-video-upload-btn{
    display:inline-flex; align-items:center; gap:.5rem; padding:.5rem .8rem; border-radius:999px;
    background:#FBE4E7; color:var(--red-deep); font-size:.76rem; font-weight:700; cursor:pointer;
  }
  .host-video-upload input{ display:none; }
  .photo-placeholder{ grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px; background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%); display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.85); font-size:.85rem; font-weight:600; }
  .card-media-empty{ grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px; background:var(--line-soft); border:1px solid var(--line); }
  .card-media-loading,.card-media-unavailable{
    grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px;
    background:var(--media-stage-fill); border:1px solid var(--line); color:var(--muted);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem;
    font-size:.82rem; font-weight:600;
  }
  .card-media-loading{ background:#fff; }
  @keyframes discover-media-spin{ to{ transform:rotate(360deg); } }

  /* Discover media follows the source's own proportions. */
  #feed-list.discover-media-feed .card{ --discover-content-inset:56px; }
  #feed-list.discover-media-feed .card-caption{ margin-left:var(--discover-content-inset); }
  #feed-list.discover-media-feed .media-carousel,
  #feed-list.discover-media-feed .card-video{
    width:var(--discover-media-width, calc(100% - var(--discover-content-inset))); max-width:calc(100% - var(--discover-content-inset)); height:var(--discover-media-height, auto); margin-left:var(--discover-content-inset); margin-right:auto;
    position:relative; overflow:hidden; border:0; border-radius:16px; background:transparent;
  }
  #feed-list.discover-media-feed .media-carousel::after,
  #feed-list.discover-media-feed .card-video::after{ content:''; position:absolute; inset:0; z-index:4; border:1px solid var(--line); border-radius:inherit; pointer-events:none; }
  #feed-list.discover-media-feed .media-slide::before,
  #feed-list.discover-media-feed .card-video::before{ content:''; position:absolute; inset:-28px; z-index:0; background-image:var(--discover-ambient-image); background-position:center; background-size:cover; filter:blur(24px) saturate(1.12); pointer-events:none; }
  #feed-list.discover-media-feed .media-slide-track{ height:100%; }
  #feed-list.discover-media-feed .media-slide{ height:100%; display:flex; align-items:center; justify-content:center; position:relative; background:transparent; }
  #feed-list.discover-media-feed .media-slide img{ max-width:100%; height:auto; object-fit:initial; }
  .media-image-skeleton{ position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; background:#fff; }
  .card-media-loading::before,.media-image-skeleton::after,.media-loading-indicator::after{
    content:''; width:36px; height:36px; flex:none; border:0; border-radius:0;
    background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='%23bdbdbd' stroke-width='4' stroke-linecap='round'%3E%3Cpath d='M16 3v4' opacity='.3'/%3E%3Cpath d='m25.2 6.8-2.8 2.8' opacity='.4'/%3E%3Cpath d='M29 16h-4' opacity='.55'/%3E%3Cpath d='m25.2 25.2-2.8-2.8' opacity='.7'/%3E%3Cpath d='M16 29v-4' opacity='.9'/%3E%3Cpath d='m6.8 25.2 2.8-2.8'/%3E%3Cpath d='M3 16h4' opacity='.8'/%3E%3Cpath d='m6.8 6.8 2.8 2.8' opacity='.55'/%3E%3C/svg%3E") center / contain no-repeat;
    animation:discover-media-spin .8s steps(8) infinite;
  }
  .media-loading-indicator{ position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; background:#fff; }
  html[data-theme="dark"] .card-media-loading,html[data-theme="dark"] .media-image-skeleton,html[data-theme="dark"] .media-loading-indicator{ background:#000; }
  .card-video.is-loaded .media-loading-indicator,.card-video.is-failed .media-loading-indicator{ display:none; }
  .card-video.is-autoplay-blocked .media-loading-indicator{ display:none; pointer-events:none; }
  #feed-list.discover-media-feed .card-video{ height:auto; background:transparent; }
  #feed-list.discover-media-feed .card-video video,
  #feed-list.discover-media-feed .card-video .varoom-video-player,
  #feed-list.discover-media-feed .card-video .varoom-video-player > video{
    display:block; width:100%; height:auto; object-fit:contain; background:transparent;
  }
  #feed-list.discover-media-feed .card-video .varoom-video-player{ height:100%; display:flex; align-items:center; justify-content:center; }
  #feed-list.discover-media-feed .media-slide img{ position:relative; z-index:1; margin:0; }
  #feed-list.discover-media-feed .card-video > video{ position:relative; z-index:1; }
  #feed-list.discover-media-feed .card-media-empty{
    height:auto; min-height:0; padding:1.4rem; border-radius:16px; background:transparent; border:1px solid var(--line);
  }
  #feed-list.discover-media-feed .card-media-loading{
    height:auto; aspect-ratio:4 / 3; min-height:0; padding:0; margin-left:var(--discover-content-inset); width:min(414px, calc(100% - var(--discover-content-inset))); max-width:calc(100% - var(--discover-content-inset));
    display:flex; align-items:center; justify-content:center; background:#fff; color:transparent;
  }
  html[data-theme="dark"] #feed-list.discover-media-feed .card-media-loading{ background:#000; }
  #feed-list.discover-media-feed .card-media-unavailable{
    height:auto; min-height:0; padding:1.4rem; margin-left:var(--discover-content-inset); width:calc(100% - var(--discover-content-inset)); background:transparent;
  }

  .badge-row{ display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.9rem; }

  .badge{ display:flex; align-items:center; gap:.3rem; font-size:.76rem; font-weight:600; padding:.3rem .65rem; border-radius:100px; }
  .badge-verified{ background:#EAF4EE; color:#1E6B3C; }
  .badge-host{ background:#E9F0FB; color:#1A4E8F; }
  .badge-soon{ background:var(--line-soft); color:var(--muted); font-weight:500; }

  .action-row{ display:flex; align-items:center; gap:1.25rem; padding-top:.5rem; border-top:none; }

  .action-btn{
    display:flex; align-items:center; gap:.35rem;
    font-size:.82rem; font-weight:500; color:var(--muted);
    padding:.35rem .55rem; border-radius:9999px;
    transition:color .15s ease, background .15s ease;
  }
  .bookmark-btn{ margin-left:0; color:var(--muted); }
  .bookmark-btn:hover{ color:var(--red); }
  .bookmark-btn.saved{ color:var(--red); }
  .like-btn{ margin-left:auto; color:var(--ink); flex-shrink:0; white-space:nowrap; }
  .like-btn:hover{ color:var(--ink); }
  .like-btn .like-count{ font-variant-numeric:tabular-nums; }

  /* ---------- MOBILE ---------- */
  .sidebar-backdrop{ display:none; position:fixed; inset:0; background:rgba(26,18,16,.45); z-index:190; }
  .sidebar-backdrop.show{ display:block; }

  .bottom-bar{ display:none; }

  @media (max-width:860px){
    .app-shell{ grid-template-columns:1fr; }

    .sidebar{
      position:fixed; inset:0 auto 0 0; width:80vw; max-width:360px; height:100vh; margin:0;
      background:var(--white); border-radius:0; z-index:200;
      transform:translateX(-100%); transition:transform .25s ease;
      box-shadow:0 0 40px rgba(26,18,16,.25);
    }
    .sidebar.mobile-open{ transform:translateX(0); }

    .dash-header{ padding:1.4rem 0 0; }
    .main-col{ height:auto; overflow-y:visible; overflow-x:hidden; grid-template-rows:auto auto; }
    .dash-body{ padding:0 1rem; gap:1.2rem; }
    .col-divider{ display:none; }
    .dash-main{ overflow-y:visible; height:auto; padding:0; }
    .host-rail{ padding:0 0 6rem; overflow-y:visible; height:auto; }
    .feed-area{ padding:.75rem .7rem 1.4rem; }
    .card{ border:none; border-radius:0; border-bottom:1px solid var(--line); margin:0 -.7rem; padding:1rem .7rem .85rem; }
    .action-row{ padding-right:1rem; }
    .skel-card{ border:none; border-radius:0; border-bottom:1px solid var(--line); margin:0 -.7rem; padding:1rem .7rem .85rem; }
    .card-photos{ gap:.3rem; }
    .card-photos img{ height:clamp(220px, 52vw, 460px); }
    .card-photos.single img{ height:clamp(250px, 60vw, 520px); }
    .media-carousel{ margin-bottom:.55rem; }
    .media-slide img{ height:clamp(220px, 52vw, 460px); }
    .media-carousel.single-media .media-slide img{ height:clamp(250px, 60vw, 520px); }
    /* Restore natural aspect ratio for discover-media-feed on mobile —
       the fixed clamp height above must not override discover's own sizing. */
    #feed-list.discover-media-feed .media-slide img{ height:auto; object-fit:initial; }
    #feed-list.discover-media-feed .card-video video,
    #feed-list.discover-media-feed .card-video .varoom-video-player,
    #feed-list.discover-media-feed .card-video .varoom-video-player > video{ height:auto; object-fit:contain; }
    #feed-list.discover-media-feed .media-carousel,
    #feed-list.discover-media-feed .card-video{
      width:var(--discover-media-width, calc(100% - 2 * var(--discover-content-inset)));
      max-width:calc(100% - 2 * var(--discover-content-inset));
    }
    #feed-list.discover-media-feed .card-media-loading{ width:min(414px, calc(100% - 2 * var(--discover-content-inset))); max-width:calc(100% - 2 * var(--discover-content-inset)); }
    #feed-list.discover-media-feed .media-slide{ display:flex; align-items:center; }
    #feed-list.discover-media-feed .media-slide img{ margin:auto; }
    .media-index-pill{ top:.55rem; right:.55rem; font-size:.66rem; }
    .media-dots{ bottom:.5rem; }

    body{ height:auto; overflow-y:visible; overflow-x:hidden; }
    .app-shell{ height:auto; overflow-y:visible; overflow-x:hidden; }

    .sidebar .nav-item[data-mobile-hide]{ display:none; }
    .topbar-avatar-btn{ flex-shrink:0; display:flex; }
    .topbar-avatar-btn:hover .avatar-circle{ outline:2px solid rgba(196,30,58,.25); outline-offset:2px; }
    .topbar{
      position:sticky; top:0; z-index:100;
      background:var(--glass-bg);
      backdrop-filter:blur(18px) saturate(140%); -webkit-backdrop-filter:blur(18px) saturate(140%);
    }

    /* Your listings at a glance grid stays desktop-only — real photos/category tiles, too heavy for mobile. */
    .listings-glance-card{ display:none !important; }

    #notif-panel-card{ display:none !important; }

    .mobile-widget-slot{ display:block; margin-bottom:1.4rem; }

    /* Category filters: one scrollable row, never wrap */
    .tabs{
      flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch;
      scrollbar-width:none; margin:0 0 1.4rem; padding:0 .7rem;
    }
    .tabs::-webkit-scrollbar{ display:none; }
    .tab{ flex-shrink:0; white-space:nowrap; }

    .bottom-bar{
      display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); align-items:center;
      position:fixed; bottom:0; left:50%; width:min(100% - 1rem, 32rem);
      transform:translateX(-50%); z-index:150; min-height:3.7rem;
      background:var(--white); border:1px solid var(--line-soft); border-radius:999px;
      box-shadow:0 10px 28px rgba(26,18,16,.14);
      padding:.3rem .35rem calc(.3rem + env(safe-area-inset-bottom));
      margin-bottom:max(.45rem, env(safe-area-inset-bottom));
    }
    .bottom-bar-item{
      display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.18rem;
      min-width:0; min-height:2.85rem; border-radius:999px;
      font-size:.62rem; font-weight:600; color:var(--ink);
      padding:.35rem .2rem; background:none; border:none; font-family:inherit; cursor:pointer;
      white-space:nowrap;
    }
    .bottom-bar-item.active{ background:var(--control-active, #E9E7E2); color:var(--ink); font-weight:700; }
    .bottom-bar-item svg{ width:1.05rem; height:1.05rem; flex-shrink:0; }
    .bottom-bar-item:focus-visible{ outline-color:var(--red); outline-offset:-2px; }
    .bottom-notification-icon{ position:relative; display:flex; }
    .bottom-notification-count{
      position:absolute; top:-7px; right:-11px; min-width:15px; height:15px;
      padding:0 4px; border-radius:999px; background:var(--red); color:var(--white);
      font-size:.58rem; line-height:15px; font-weight:700;
    }
    .bottom-notification-count[hidden]{ display:none; }
    .bottom-bar-item .avatar-mini{
      width:20px; height:20px; border-radius:50%; overflow:hidden;
      background:var(--red); color:var(--white); display:flex; align-items:center; justify-content:center;
      font-size:.62rem; font-weight:700;
    }
    .bottom-bar-item .avatar-mini img{ width:100%; height:100%; object-fit:cover; }
  }

  /*
   * Host Home's interface is deliberately neutral at every viewport. Red is
   * reserved for inline navigation/actions (for example, "View on Map" and
   * "View all") rather than being used as control chrome or decoration.
   * These overrides follow the shared dark-mode sheet so they apply equally
   * to the desktop layout, tablet layout, sidebar drawer, and mobile bar.
   */
  :root{
    --control-bg:#EFF3F4;
    --control-active:#E9E7E2;
    --control-hover:#EFEDE8;
    --control-strong:#0F1419;
    --control-strong-text:#FFFFFF;
    --neutral-icon:#536471;
    --host-rail-outline:#CFD9DE;
  }
  [data-theme="dark"]{
    --control-bg:#202327;
    --control-active:#2f3336;
    --control-hover:rgba(239, 243, 244, 0.1);
    --control-strong:#EFF3F4;
    --control-strong-text:#0F1419;
    --neutral-icon:#71767b;
    --host-rail-outline:rgba(255,255,255,.28);
  }

  :focus-visible,
  .bottom-bar-item:focus-visible{ outline-color:var(--neutral-icon); }

  .beta-pill,
  .property-news-kicker,
  .listing-status-banner,
  .property-news-error,
  .verified-tick{ color:var(--ink); }
  .beta-pill,
  .property-news-status,
  .host-video-upload-btn{
    background:var(--control-active);
    color:var(--ink);
    border-color:var(--line);
  }

  .nav-item.active,
  [data-theme="dark"] .nav-item.active,
  .sidebar .nav-item.active,
  [data-theme="dark"] .sidebar .nav-item.active,
  .bottom-bar-item.active,
  [data-theme="dark"] .bottom-bar-item.active,
  .tab.active,
  [data-theme="dark"] .tab.active,
  [data-theme="dark"] .tab[aria-selected="true"]{
    background:var(--control-active) !important;
    color:var(--ink) !important;
    border-color:var(--line) !important;
  }

  .search-wrap,
  [data-theme="dark"] .search-wrap{
    background:#000000 !important;
    border:1px solid rgba(255,255,255,.22) !important;
    outline:none !important;
    box-shadow:none !important;
  }
  .search-wrap input,
  [data-theme="dark"] .search-wrap input{
    background:transparent !important;
    background-color:transparent !important;
    border:none !important;
    outline:none !important;
    box-shadow:none !important;
    color:var(--ink) !important;
  }
  .search-wrap:focus-within,
  [data-theme="dark"] .search-wrap:focus-within{
    border-color:rgba(255,255,255,.45) !important;
    outline:none !important;
    box-shadow:0 0 0 2px rgba(255,255,255,.12) !important;
  }
  html[data-theme="light"] .search-wrap{
    background:#FFFFFF !important;
    border:1px solid #BBBFC2 !important;
    outline:none !important;
  }
  html[data-theme="light"] .search-wrap:focus-within{
    border-color:#5C584F !important;
    outline:none !important;
    box-shadow:0 0 0 2px rgba(92,88,79,.15) !important;
  }

  .list-btn-primary,
  [data-theme="dark"] .list-btn-primary,
  .topbar-list-btn,
  [data-theme="dark"] .topbar-list-btn,
  .modal-save,
  .report-submit-btn,
  [data-theme="dark"] .report-submit-btn{
    background:var(--control-strong) !important;
    border-color:var(--control-strong) !important;
    color:var(--control-strong-text) !important;
  }
  .topbar-list-btn:hover,
  [data-theme="dark"] .topbar-list-btn:hover,
  .list-btn-primary:hover,
  .report-submit-btn:hover{ background:var(--control-hover) !important; color:var(--ink) !important; border-color:var(--line) !important; }

  .notif-nav-badge,
  .bottom-notification-count,
  .notif-panel-badge,
  .avatar-circle,
  .bottom-bar-item .avatar-mini,
  .card-avatar{
    background:var(--nav-badge-bg, var(--control-active)) !important;
    color:var(--nav-badge-color, var(--ink)) !important;
  }
  .attention-icon,
  .notif-panel-bell,
  .property-news-empty-icon-wrap,
  .empty-state-card .empty-icon{
    background:var(--control-active) !important;
    color:var(--neutral-icon) !important;
  }
  .photo-placeholder{ background:linear-gradient(135deg, var(--control-active), var(--control-bg)) !important; color:var(--ink) !important; }
  .property-news-source-link{ text-decoration-color:var(--line); }
  .property-news-source-link:hover{ color:var(--ink); text-decoration-color:currentColor; }
  .media-dot.active,
  [data-theme="dark"] .media-dot.active{ background:var(--neutral-icon) !important; }
  .glance-tile.add-tile:hover{ color:var(--ink); border-color:var(--line); background:var(--control-hover); }
  .card-menu-item:hover{ background:var(--control-hover); }
  .card-menu-item.destructive,
  [data-theme="dark"] .card-menu-item.destructive,
  .report-modal-msg.error{ color:var(--ink); }
  .bookmark-btn:hover,
  .bookmark-btn.saved{ color:var(--ink); }
  .topbar-avatar-btn:hover .avatar-circle{ outline-color:var(--neutral-icon); }

  /* Desktop right rail modules: clean unified perimeter container outline matching client-home */
  .host-rail > .sidebar-module,
  .host-rail > .listings-glance-card,
  .host-rail > .property-news-card,
  .host-rail > .varoom-updates-card{
    position:relative;
    width:100%;
    height:auto;
    flex-shrink:0;
    box-sizing:border-box;
    container-type:inline-size;
    background:transparent !important;
    border:0 !important;
    border-radius:16px !important;
    box-shadow:none !important;
    padding:1.2rem 1.2rem 1.3rem !important;
    margin-bottom:0 !important;
  }
  .host-rail > .sidebar-module::after,
  .host-rail > .listings-glance-card::after,
  .host-rail > .property-news-card::after,
  .host-rail > .varoom-updates-card::after{
    content:"";
    position:absolute;
    inset:0;
    border:1px solid var(--host-rail-outline);
    border-radius:16px;
    pointer-events:none;
  }
  .host-rail > .sidebar-module.empty-state-card{
    padding:1.5rem 1.25rem !important;
  }

  /* The mobile updates module keeps the same one-per-section transparent
     perimeter. Feed listing cards are deliberately outside these selectors. */
  .mobile-widget-slot > .mobile-varoom-updates-card{
    position:relative;
    background:transparent !important;
    border:0 !important;
    border-radius:16px !important;
    box-shadow:none !important;
    padding:1.15rem 1.2rem !important;
  }
  .mobile-widget-slot > .mobile-varoom-updates-card::after{
    content:"";
    position:absolute;
    inset:0;
    border:1px solid var(--host-rail-outline);
    border-radius:16px;
    pointer-events:none;
  }

  /* Textual, inline actions retain the product accent. */
  .stats-head a,
  .attention-row a.attention-link,
  .card-map-link,
  .property-news-view-all{ color:var(--red); }
  .stats-head a:hover,
  .attention-row a.attention-link:hover,
  .card-map-link:hover,
  .property-news-view-all:hover{ color:var(--red-deep); }

  /* ---------- RIGHT RAIL FOOTER (Social & Legal) ---------- */
  .rail-footer{
    width:100%;
    margin-top:0.25rem;
    padding:0.2rem 0.25rem 0.5rem;
    display:flex;
    flex-direction:column;
    align-items:center;
    text-align:center;
    gap:0.5rem;
    box-sizing:border-box;
    flex-shrink:0;
    background:transparent !important;
    border:none !important;
    border-radius:0 !important;
    box-shadow:none !important;
  }
  .rail-footer::after{
    display:none !important;
  }
  .rail-social-row{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:18px;
    flex-wrap:nowrap;
    width:100%;
  }
  .rail-social-link{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    color:var(--muted);
    transition:color .18s ease, transform .18s ease;
    text-decoration:none;
    line-height:1;
  }
  .rail-social-link:hover{
    color:var(--ink);
    transform:translateY(-1px);
  }
  .rail-social-link:focus-visible{
    outline:2px solid var(--red);
    outline-offset:2px;
    border-radius:4px;
  }
  .rail-social-link svg{
    width:20px;
    height:20px;
    display:block;
    flex-shrink:0;
  }
  .rail-legal-links{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:0.4rem;
    flex-wrap:nowrap;
    width:100%;
    font-size:0.625rem;
    line-height:1.4;
  }
  .rail-legal-link{
    color:var(--muted);
    text-decoration:none;
    white-space:nowrap;
    transition:color .15s ease;
  }
  .rail-legal-link:hover{
    color:var(--ink);
    text-decoration:underline;
  }
  .rail-legal-link:focus-visible{
    outline:2px solid var(--red);
    outline-offset:2px;
    border-radius:2px;
  }
  .rail-legal-divider{
    color:var(--line);
    font-size:0.5625rem;
    opacity:0.85;
    user-select:none;
  }
`;
