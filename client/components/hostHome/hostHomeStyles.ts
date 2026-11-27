// Styles for /host-home, ported from legacy-pages/host-home.html and scoped
// to the page (.host-home-page): nothing here sets the document root or body,
// or restyles the shared host sidebar, its drawer or the mobile bar (the
// shell owns them, so they look the same on every host page).

export const HOST_HOME_STYLES = `
  .host-home-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:var(--va-light); --ink:#0F1419; --paper:var(--va-light);
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
    /* Apple-style surfaces, shared with client home. */
    --home-fill:rgba(118,118,128,.12);
    --home-surface:#F5F5F7;
    --home-raised:var(--va-light);
    --home-shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06);
    --home-ease:cubic-bezier(.25,.1,.25,1);
  }
  html[data-theme="dark"] .host-home-page{
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
    --home-fill:rgba(118,118,128,.24);
    --home-surface:#1C1C1E;
    --home-raised:#2C2C2E;
    --home-shadow:none;
  }
  .host-home-page, .host-home-page *{ margin:0; padding:0; box-sizing:border-box; }
  /* Continuous canvas; hierarchy comes from hairline dividers. */
  html[data-theme="light"] .host-home-page .app-shell,
  html[data-theme="light"] .host-home-page .main-col,
  html[data-theme="light"] .host-home-page .topbar,
  html[data-theme="light"] .host-home-page .dash-main{ background:var(--va-light); }

  html[data-theme="dark"] .host-home-page .app-shell,
  html[data-theme="dark"] .host-home-page .main-col,
  html[data-theme="dark"] .host-home-page .topbar,
  html[data-theme="dark"] .host-home-page .dash-main{ background:#000000; }

  .host-home-page a{ color:inherit; text-decoration:none; }
  .host-home-page button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  .host-home-page :focus-visible{ outline:2px solid var(--red); outline-offset:2px; }

  .host-home-page .app-shell{
    display:grid;
    grid-template-columns: 295px minmax(0, 1fr);
    width:100%;
    height:100vh;
    overflow:hidden;
    background:var(--paper);
  }

  /* ---------- SIDEBAR (line-separated column) ----------
     Spacious vertical layout emulating X navigation. */










  .host-home-page .toast{
    position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(20px);
    background:var(--ink); color:var(--white); padding:.8rem 1.4rem; border-radius:100px;
    font-size:.88rem; font-weight:600; z-index:300; opacity:0; pointer-events:none;
    transition:opacity .25s ease, transform .25s ease;
  }
  .host-home-page .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  .host-home-page .toast .toast-action{ pointer-events:auto; margin-left:.9rem; padding:0; border:0; background:none; color:inherit; font:inherit; text-decoration:underline; cursor:pointer; }

  /* ---------- MAIN COLUMN ----------
     A single grid controls both the topbar row and the dashboard body,
     using one shared column track set (main | 1px divider | rail). The
     divider is its own grid item spanning grid-row:1/-1, so the line runs
     from the very top of the viewport straight through the topbar and
     down the full height. */
  /* ---------- MAIN COLUMN ----------
     Structured 3-column layout emulating X:
     Flexible middle feed, 1px hairline divider, flexible right rail matching client-home. */
  .host-home-page .main-col{
    display:grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: minmax(620px, 1.3fr) 1px minmax(380px, 1fr);
    height:100vh;
    overflow:hidden;
    min-width:0;
    background:var(--paper);
  }

  .host-home-page .topbar{
    grid-column: 1;
    grid-row: 1;
    display:flex; align-items:center; gap:.75rem;
    padding:.75rem 1rem;
    width:100%;
    box-sizing:border-box;
    background:transparent;
    border-bottom:1px solid var(--line);
  }
  .host-home-page .topbar-list-btn{
    flex-shrink:0; white-space:nowrap;
    display:inline-flex; align-items:center; gap:.45rem;
    padding:.55rem 1.15rem; border-radius:9999px;
    font-size:.88rem; font-weight:700;
    background:var(--control-strong) !important;
    color:var(--control-strong-text) !important;
    transition:all .18s ease;
  }
  .host-home-page .topbar-list-btn:hover{ opacity:.9; transform:translateY(-1px); }

  .host-home-page .col-divider{
    grid-column: 2;
    grid-row: 1 / -1;
    background:var(--line);
    width:1px;
    height:100%;
  }

  .host-home-page .search-wrap{
    flex:1; display:flex; align-items:center; gap:.6rem;
    background:var(--home-fill); border-radius:9999px; padding:.55rem 1rem;
    border:1px solid transparent;
    box-shadow:none;
    min-width:0;
    transition:background-color .2s var(--home-ease), border-color .2s var(--home-ease), box-shadow .2s var(--home-ease);
  }
  .host-home-page .search-wrap input{ flex:1; min-width:0; border:none; background:transparent; font-family:inherit; font-size:.92rem; color:var(--ink); }
  .host-home-page .search-wrap input:focus{ outline:none; }
  .host-home-page .search-wrap:focus-within{
    border-color:var(--line);
    background:var(--home-raised);
    box-shadow:0 0 0 4px var(--home-fill);
  }
  .host-home-page .search-btn{ color:var(--muted); display:flex; align-items:center; }
  .host-home-page .search-wrap input::placeholder{ color:var(--muted); opacity:1; }

  .host-home-page .topbar-right{ margin-left:auto; display:flex; align-items:center; gap:1.2rem; }
  .host-home-page .icon-btn{ color:var(--muted); }
  .host-home-page .icon-btn:hover{ color:var(--ink); }

  .host-home-page .topbar-avatar-btn{ display:none; }
  .host-home-page .avatar-circle{
    width:38px; height:38px; border-radius:50%; background:var(--red); color:var(--white);
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem;
  }

  /* ---------- DASHBOARD HEADER ---------- */
  .host-home-page .dash-header{ padding:.65rem 0 0; width:100%; box-sizing:border-box; }

  /* dash-body is a pass-through wrapper only — display:contents lifts
     dash-main/host-rail up to be direct grid items of .main-col (row 2),
     sharing the exact same column tracks as the topbar/divider above. */
  .host-home-page .dash-body{
    display:contents;
  }
  .host-home-page .dash-main{
    grid-column: 1;
    grid-row: 2;
    min-width:0;
    overflow-y:auto;
    height:100%;
    padding:0;
    scrollbar-width:none;
  }
  .host-home-page .dash-main::-webkit-scrollbar{ display:none; }
  /* A system feed notice: the listing-style separators keep it visible
     without introducing a coloured card or changing feed proportions. */
  .host-home-page .suspension-notice{display:block;margin:0 0 1rem;padding:1.15rem 1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:transparent;color:var(--ink)}
  .host-home-page .suspension-notice-title{font-size:1.15rem;font-weight:750;letter-spacing:-.02em;margin:0 0 .35rem}.host-home-page .suspension-notice-copy{max-width:48rem;margin:0;font-size:.9rem;line-height:1.5;color:var(--muted)}.host-home-page .suspension-notice-action{display:inline-block;margin-top:.65rem;color:var(--red);font-size:.88rem;font-weight:700}
  @media(max-width:680px){.host-home-page .suspension-notice{padding:.9rem 0}.host-home-page .suspension-notice-title{font-size:1.08rem}.host-home-page .suspension-notice-action{font-size:.82rem}}
  .host-home-page .host-rail{
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
  .host-home-page .host-rail::-webkit-scrollbar{ display:none; }

  .host-home-page .dash-header,
  .host-home-page .feed-area{
    width:100%;
    margin:0 auto;
    min-width:0;
    box-sizing:border-box;
  }

  .host-home-page .feed-area{
    min-width:0;
    padding-bottom:2rem;
    border-right:none;
    box-sizing:border-box;
  }

  .host-home-page .list-btn-primary{
    display:flex; align-items:center; gap:.5rem;
    background:var(--red); color:var(--white);
    padding:.75rem 1.3rem; border-radius:100px; font-weight:700; font-size:.9rem;
    transition:background .2s ease;
  }
  .host-home-page .list-btn-primary:hover{ background:var(--red-deep); }

  .host-home-page .stats-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.85rem; }
  .host-home-page .stats-head h2{ font-size:.95rem; font-weight:700; color:var(--ink); letter-spacing:-.015em; }
  .host-home-page .stats-head a{ font-size:.82rem; font-weight:600; color:var(--red); text-decoration:none; }
  .host-home-page .stats-head a:hover{ text-decoration:underline; }
  .host-home-page .property-news-refresh{ border:0; background:transparent; color:var(--red); font:inherit; font-size:.78rem; font-weight:600; cursor:pointer; padding:0; }
  .host-home-page .property-news-refresh:hover{ text-decoration:underline; }
  .host-home-page .property-news-refresh:disabled{ cursor:default; opacity:.6; text-decoration:none; }

  @media (max-width:1360px){
    .host-home-page .main-col{ grid-template-columns: minmax(580px, 1.25fr) 1px minmax(360px, 1fr); }
    .host-home-page .dash-main{ min-width:0; }
    .host-home-page .host-rail{ padding-left:1.25rem; padding-right:1.25rem; }
  }

  @media (max-width:1180px){
    .host-home-page .host-rail{ display:none; }
    .host-home-page .col-divider{ display:none; }
    .host-home-page .main-col{ grid-template-columns: minmax(0, 760px); }
    /* Fill the column: auto margins alone sized it to the tabs (594px on a 390px phone). */
    .host-home-page .dash-main{ margin:0 auto; min-width:0; width:100%; }
    .host-home-page .dash-header,
  .host-home-page .feed-area{ min-width:0; }
  }

  @media (max-width:520px){
    .host-home-page .topbar-list-btn{ width:42px; height:42px; padding:0; justify-content:center; }
    .host-home-page .topbar-list-btn .btn-label{ display:none; }
  }

  /* ---------- NEEDS YOUR ATTENTION (right rail) ---------- */
  .host-home-page .attention-list{ display:flex; flex-direction:column; gap:.9rem; }
  .host-home-page .attention-group{ display:flex; flex-direction:column; }
  .host-home-page .attention-group-head{
    display:flex; align-items:center; gap:.6rem; padding:.15rem 0 .45rem;
    font-size:.88rem; font-weight:700; color:var(--ink); text-decoration:none;
  }
  .host-home-page a.attention-group-head:hover{ color:var(--red); }
  .host-home-page .attention-group-head--solo{ padding:.15rem 0; }
  .host-home-page .attention-badge{
    display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px; border-radius:999px;
    background:var(--red); color:#fff; font-size:.72rem; font-weight:800; line-height:1;
  }
  .host-home-page .attention-badge--warn{ background:#B45309; }
  .host-home-page .attention-arrow{ margin-left:auto; color:var(--muted); font-weight:600; }
  .host-home-page .attention-row{
    display:flex; align-items:center; gap:.8rem; padding:.6rem 0;
    border-top:1px solid var(--line-soft); color:var(--ink); text-decoration:none;
  }
  .host-home-page .attention-row--link{ border-radius:10px; transition:background-color .15s ease; }
  .host-home-page .attention-row--link:hover{ background:var(--control-hover); }
  .host-home-page .attention-row--link:focus-visible{ outline:2px solid var(--red); outline-offset:2px; }
  .host-home-page .attention-row-text{ display:flex; flex-direction:column; gap:.1rem; min-width:0; flex:1; }
  .host-home-page .attention-row-text strong{ font-size:.86rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .host-home-page .attention-row-text small{ font-size:.76rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .host-home-page .attention-row-action{ flex:none; font-size:.8rem; font-weight:700; color:var(--red); }
  .host-home-page .attention-done-text{ margin:0 0 .6rem; font-size:.84rem; color:var(--muted); }
  .host-home-page .attention-loader{ min-height:120px; }
  .host-home-page .attention-upgrade{ text-align:left; }
  .host-home-page .attention-upgrade-icon{
    width:40px; height:40px; border-radius:12px; display:grid; place-items:center; margin-bottom:.75rem;
    background:var(--control-active); color:var(--ink);
  }
  .host-home-page .attention-upgrade h3{ font-family:var(--font-display); font-weight:700; font-size:1.05rem; margin:0 0 .3rem; color:var(--ink); }
  .host-home-page .attention-upgrade p{ margin:0 0 1rem; font-size:.85rem; line-height:1.45; color:var(--muted); }
  .host-home-page .attention-upgrade-actions{ display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; }
  .host-home-page .attention-upgrade-actions .list-btn-primary{ display:inline-flex; }
  .host-home-page .attention-not-now{
    border:0; background:none; padding:.4rem .2rem; font:inherit; font-size:.85rem; font-weight:600;
    color:var(--muted); cursor:pointer;
  }
  .host-home-page .attention-not-now:hover{ color:var(--ink); }
  .host-home-page .attention-not-now:focus-visible{ outline:2px solid var(--red); outline-offset:2px; border-radius:6px; }

  /* ---------- DESKTOP RIGHT-RAIL MODULES ----------
     Transparent module sections enclosed in a single perimeter container outline, matching client-home. */
  .host-home-page .host-rail > .sidebar-module{
    position:relative;
    width:100%;
    height:auto;
    flex-shrink:0;
    box-sizing:border-box;
    container-type:inline-size;
    background:var(--home-surface) !important;
    border:0 !important;
    border-radius:20px !important;
    box-shadow:var(--home-shadow) !important;
    padding:1.2rem 1.2rem 1.3rem !important;
    margin-bottom:0 !important;
  }
  .host-home-page .host-rail > .sidebar-module.empty-state-card{
    padding:1.5rem 1.25rem !important;
  }
  .host-home-page .host-rail > .sidebar-module .stats-head{ margin-bottom:.85rem; }
  .host-home-page .host-rail > .sidebar-module .stats-head h2{ font-size:1.02rem; font-weight:700; color:var(--ink); letter-spacing:-.015em; }

  /* ---------- VAROOM UPDATES ---------- */
  .host-home-page .varoom-updates-card{ }
  .host-home-page #varoom-updates{ width:100%; }
  .host-home-page .update-card{
    width:100%;
    box-sizing:border-box;
    background:transparent;
    border:none !important;
    border-bottom:1px solid var(--line) !important;
    border-radius:0 !important;
    padding:0 0 .9rem 0 !important;
    margin-bottom:0;
  }
  .host-home-page .update-card:last-child{
    border-bottom:none !important;
    padding-bottom:0 !important;
  }
  .host-home-page .update-photos{ display:grid; grid-template-columns:repeat(auto-fit, minmax(70px, 1fr)); gap:.4rem; margin-bottom:.5rem; }
  .host-home-page .update-photos .update-img{ width:100%; aspect-ratio:1/1; object-fit:cover; margin-bottom:0; border-radius:8px; }
  .host-home-page .update-img{ width:100%; border-radius:10px; margin-bottom:.5rem; display:block; }
  .host-home-page .update-title{ font-weight:700; font-size:.88rem; color:var(--ink); margin-bottom:.2rem; }
  .host-home-page .update-body{ font-size:.82rem; color:var(--muted); line-height:1.4; }

  /* ---------- PROPERTY NEWS ----------
     The desktop instance participates in the rail module system. The mobile
     instance retains its existing responsive treatment below. */
  .host-home-page .property-news-card:not(.sidebar-module){
    background:var(--white); border:1px solid var(--line); border-radius:0;
    box-shadow:none; padding:1.2rem 1.2rem 1.1rem;
    border-bottom:1px solid var(--line);
  }

  /* ---------- NOTIFICATIONS PANEL (glass) ---------- */
  .host-home-page .notif-panel-card{ }
  .host-home-page .notif-panel-head{ display:flex; align-items:center; gap:.6rem; margin-bottom:.7rem; }
  .host-home-page .notif-panel-bell{
    width:28px; height:28px; border-radius:50%; background:rgba(196,30,58,.14); color:var(--red);
    display:flex; align-items:center; justify-content:center; flex-shrink:0;
  }
  .host-home-page .notif-panel-head h2{ font-size:.92rem; font-weight:700; color:var(--ink); }
  .host-home-page .notif-panel-badge{
    margin-left:auto; font-size:.7rem; font-weight:700; background:var(--red); color:#fff;
    padding:.2rem .55rem; border-radius:100px; flex-shrink:0;
  }
  .host-home-page .property-news-list{ display:flex; flex-direction:column; gap:0; width:100%; }
  .host-home-page .property-news-item{
    display:block;
    background:transparent;
    border:none !important;
    border-bottom:1px solid var(--line) !important;
    border-radius:0 !important;
    padding:.85rem 0 !important;
    box-shadow:none !important;
    transition:none;
  }
  .host-home-page .property-news-item:last-child{
    border-bottom:none !important;
    padding-bottom:0 !important;
  }
  .host-home-page .property-news-item:hover .property-news-title{ color:var(--red); }
  .host-home-page .property-news-image-wrap{ display:block; height:0; overflow:hidden; margin:0; border-radius:10px; background:rgba(26,18,16,.04); opacity:0; }
  .host-home-page .property-news-image-wrap.is-loaded{ height:108px; margin:0 0 .65rem; opacity:1; }
  .host-home-page .property-news-image{ display:block; width:100%; height:108px; object-fit:cover; }
  .host-home-page .property-news-kicker{ color:var(--muted); font-size:.7rem; font-weight:600; margin-bottom:.15rem; }
  .host-home-page .property-news-title{ font-size:.9rem; font-weight:700; line-height:1.35; color:var(--ink); transition:color .15s ease; }
  .host-home-page .property-news-meta{ display:flex; align-items:center; flex-wrap:wrap; gap:.35rem; margin-top:.25rem; color:var(--muted); font-size:.74rem; }
  .host-home-page .property-news-source{ margin-top:.25rem; color:var(--muted); font-size:.68rem; line-height:1.35; }
  .host-home-page .property-news-source-link{ color:inherit; text-decoration:underline; text-decoration-color:rgba(196,30,58,.38); text-underline-offset:2px; }
  .host-home-page .property-news-source-link:hover{ color:var(--red); text-decoration-color:currentColor; }
  .host-home-page .property-news-detail-link{ display:block; color:inherit; }
  .host-home-page .property-news-status{
    display:inline-flex; align-items:center; width:max-content; margin-top:.45rem;
    border-radius:100px; padding:.18rem .48rem; background:var(--control-active); color:var(--ink);
    font-size:.64rem; font-weight:700; letter-spacing:.05em;
  }
  .host-home-page .property-news-status.status-effective,
  .host-home-page .property-news-status.status-approved{ background:#EAF4EE; color:#1E6B3C; }
  .host-home-page .property-news-empty,
  .host-home-page .property-news-error{ color:var(--muted); font-size:.82rem; line-height:1.5; padding:.2rem 0; }
  .host-home-page .property-news-empty-card{
    background:transparent; border:none; border-radius:0;
    padding:1.4rem 1rem 1rem; text-align:center; display:flex; flex-direction:column; align-items:center; gap:.35rem;
  }
  .host-home-page .property-news-empty-icon-wrap{
    width:36px; height:36px; border-radius:50%; background:rgba(196,30,58,.08); color:var(--red);
    display:flex; align-items:center; justify-content:center; margin-bottom:.15rem;
  }
  .host-home-page .property-news-empty-title{ font:700 .88rem/1.3 var(--font-display); color:var(--ink); }
  .host-home-page .property-news-empty-desc{ font-size:.76rem; color:var(--muted); line-height:1.45; margin:0; }
  .host-home-page .property-news-empty-badge{
    display:inline-flex; align-items:center; gap:.4rem; font-size:.68rem; font-weight:600;
    color:#1E6B3C; background:#EAF4EE; padding:.2rem .6rem; border-radius:100px; margin-top:.35rem;
  }
  .host-home-page .property-news-empty-dot{
    width:6px; height:6px; border-radius:50%; background:#28a745; box-shadow:0 0 0 2px rgba(40,167,69,.2);
  }
  .host-home-page .property-news-error{ color:var(--red-deep); }
  .host-home-page .property-news-view-all{ display:inline-flex; margin-top:.85rem; font-size:.82rem; font-weight:600; color:var(--red); }
  .host-home-page .property-news-view-all:hover{ color:var(--red-deep); }
  @keyframes news-shimmer{ 0%{ background-position:200% 0; } 100%{ background-position:-200% 0; } }


  /* ---------- NO LISTINGS EMPTY STATE ---------- */
  .host-home-page .empty-state-card{
    text-align:center;
  }
  .host-home-page .empty-state-card .empty-icon{
    width:44px; height:44px; border-radius:50%; margin:0 auto .8rem;
    background:rgba(196,30,58,.08); color:var(--red-deep);
    display:flex; align-items:center; justify-content:center;
  }
  .host-home-page .empty-state-card h3{ font-family:var(--font-display); font-weight:600; font-size:1.1rem; margin-bottom:.3rem; }
  .host-home-page .empty-state-card p{ font-size:.85rem; color:var(--muted); margin-bottom:1rem; }
  .host-home-page .empty-state-card .list-btn-primary{ display:inline-flex; }

  .host-home-page .feed-area{ padding:0 0 5rem; width:100%; box-sizing:border-box; }

  /* Category tabs: an Apple segmented control (a raised pill in a soft
     track). The hairline under the row now sits on .dash-header. */
  .host-home-page .dash-header{ padding-bottom:.65rem; border-bottom:1px solid var(--line); }
  .host-home-page .tabs{
    display:flex;
    flex-wrap:nowrap;
    overflow-x:auto;
    scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
    gap:2px;
    width:fit-content;
    max-width:calc(100% - 2rem);
    padding:3px;
    margin:0 1rem;
    border-radius:9999px;
    background:var(--home-fill);
    box-sizing:border-box;
  }
  .host-home-page .tabs::-webkit-scrollbar{ display:none; }
  .host-home-page .tab{
    flex-shrink:0;
    white-space:nowrap;
    padding:.42rem .95rem;
    border-radius:9999px;
    font-size:.86rem;
    font-weight:600;
    background:transparent;
    border:0;
    color:var(--muted);
    cursor:pointer;
    transition:background-color .2s var(--home-ease), color .2s var(--home-ease), box-shadow .2s var(--home-ease), transform .15s var(--home-ease);
  }
  .host-home-page .tab:hover{ color:var(--ink); }
  .host-home-page .tab:active{ transform:scale(.97); }
  .host-home-page .tab.active{
    background:var(--home-raised);
    color:var(--ink);
    font-weight:600;
    box-shadow:0 1px 3px rgba(0,0,0,.12), 0 1px 1px rgba(0,0,0,.04);
  }

  .host-home-page .state-msg{ color:var(--muted); font-size:.95rem; padding:2rem 0; text-align:center; }

  /* ---------- HOME FEED SKELETON ---------- */
  @keyframes skel-pulse{ 0%,100%{ opacity:.55; } 50%{ opacity:1; } }
  .host-home-page .skel{ background:var(--line-soft); border-radius:6px; animation:skel-pulse 1.3s ease-in-out infinite; }

  .host-home-page .skel-card{
    background:transparent;
    border:0;
    border-bottom:1px solid var(--line);
    border-radius:0;
    padding:1rem 1.25rem .85rem;
    margin:0;
  }
  .host-home-page .skel-card-head{ display:flex; align-items:center; gap:.7rem; margin-bottom:.55rem; }
  .host-home-page .skel-avatar{ width:38px; height:38px; border-radius:50%; flex-shrink:0; }
  .host-home-page .skel-card-head-body{ flex:1; min-width:0; }
  .host-home-page .skel-menu{ width:24px; height:24px; flex:0 0 24px; border-radius:50%; }
  .host-home-page .skel-name{ width:130px; height:12px; margin-bottom:.4rem; }
  .host-home-page .skel-loc{ width:190px; height:9px; }
  .host-home-page .skel-line{ height:9px; margin-bottom:.4rem; }
  .host-home-page .skel-line.short{ width:55%; margin-bottom:.75rem; }
  .host-home-page .skel-media{ width:auto; max-width:460px; height:auto; aspect-ratio:4 / 3; border-radius:16px; margin:0 0 .75rem 56px; }
  .host-home-page .skel-line{ margin-left:56px; }
  .host-home-page .skel-actions{ display:flex; gap:.5rem; }
  .host-home-page .skel-pill{ width:58px; height:24px; border-radius:999px; }

  .host-home-page .home-widget-loader{
    min-height:180px; width:100%; display:grid; place-items:center;
    box-sizing:border-box; color:var(--muted); font-size:.82rem; text-align:center;
  }
  .host-home-page .home-widget-message{ width:100%; display:grid; place-items:center; box-sizing:border-box; padding:1rem; color:var(--muted); font-size:.82rem; text-align:center; }
  /* The shared VaRoom spinner (styles/spinner.css), as on the media cards. */
  .host-home-page .home-widget-spinner{
    width:28px; height:28px; flex:none; background:var(--varoom-spinner) center / contain no-repeat;
    animation:varoom-spinner-turn .8s steps(8) infinite;
  }
  @media (prefers-reduced-motion:reduce){
    .host-home-page .home-widget-spinner{ animation-duration:2.4s; }
    .host-home-page .tab,
  .host-home-page .action-btn,
  .host-home-page .search-wrap{ transition:none; }
    .host-home-page .tab:active,
  .host-home-page .action-btn:active{ transform:none; }
  }
  .host-home-page .home-widget-content{ display:flex; flex-direction:column; gap:.9rem; }
  .host-home-page .home-widget-content[data-loading="true"]{ min-height:90px; }
  .host-home-page .home-widget-content[data-loading="true"] .home-widget-loader{ min-height:90px; }
  .host-home-page .property-news-list{ min-height:180px; }

  .host-home-page .card{
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
  html[data-theme="dark"] .host-home-page .card{ color:var(--ink); }
  .host-home-page .card-head{ position:relative; z-index:10; display:flex; align-items:center; gap:.65rem; margin-bottom:.45rem; }
  .host-home-page .card-avatar{ width:38px; height:38px; border-radius:50%; background:var(--red-deep); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem; flex-shrink:0; overflow:hidden; }
  .host-home-page .card-avatar img{ width:100%; height:100%; object-fit:cover; }
  .host-home-page .card-host-name{ font-weight:700; font-size:.95rem; display:flex; align-items:center; gap:.35rem; color:var(--ink); text-decoration:none; }
  .host-home-page .verified-tick{ color:var(--red); font-size:.85rem; }
  .host-home-page .card-location{ font-size:.82rem; color:var(--muted); }
  .host-home-page .card-map-link{ color:var(--red); font-weight:600; }
  .host-home-page .card-map-link:hover{ text-decoration:underline; }
  .host-home-page .card-time{ margin-left:auto; font-size:.78rem; color:var(--muted); }
  .host-home-page .card-menu-wrap{ position:relative; z-index:11; margin-left:.4rem; }
  .host-home-page .card-menu-btn{
    width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    color:var(--muted); background:none; border:none; cursor:pointer; flex-shrink:0;
  }
  .host-home-page .card-menu-btn:hover{ background:var(--control-hover); color:var(--ink); }

  .host-home-page .card-menu-dropdown{
    display:none; position:absolute; top:32px; right:0; z-index:100;
    background:var(--white); border:1px solid var(--line); border-radius:12px;
    box-shadow:0 12px 30px -10px rgba(26,18,16,.3); min-width:170px; padding:.4rem;
  }
  .host-home-page .card-menu-dropdown.open{ display:block; }
  .host-home-page .card-menu-dropdown.open.is-portaled{
    position:fixed; top:0; right:auto; z-index:1000;
    max-height:calc(100vh - 16px); max-width:calc(100vw - 16px);
    overflow-y:auto; overscroll-behavior:contain;
  }
  .host-home-page .card-video .varoom-video-player{ z-index:1; }
  .host-home-page .card-menu-item{
    display:block; width:100%; text-align:left; padding:.6rem .8rem; border-radius:8px;
    font-size:.85rem; font-weight:500; color:var(--ink); background:none; border:none; cursor:pointer;
  }
  .host-home-page .card-menu-item:hover{ background:rgba(196,30,58,.08); }
  .host-home-page .card-menu-item.destructive{ border-top:1px solid var(--line-soft); margin-top:.35rem; padding-top:.8rem; color:#C41E3A; }
  html[data-theme="dark"] .host-home-page .card-menu-item.destructive{ color:#ff7186; }
  .host-home-page .card-menu-section{ padding:.45rem .8rem .2rem; color:var(--ink); opacity:.75; font-size:.68rem; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
  .host-home-page .modal-overlay{ display:none; position:fixed; inset:0; z-index:300; background:rgba(26,18,16,.5); align-items:center; justify-content:center; padding:1rem; }
  .host-home-page .modal-overlay.open{ display:flex; }
  .host-home-page .modal-card{ background:var(--white); color:var(--ink); border-radius:18px; padding:1.5rem; max-width:460px; width:100%; }
  .host-home-page .modal-card h2{ margin-bottom:1rem; }
  .host-home-page .modal-field{ margin-bottom:.8rem; }
  .host-home-page .modal-field label{ display:block; font-size:.78rem; font-weight:700; margin-bottom:.3rem; }
  .host-home-page .modal-field input,
  .host-home-page .modal-field textarea,
  .host-home-page .modal-field select{ width:100%; padding:.65rem; border:1px solid var(--line); border-radius:8px; background:var(--paper); color:var(--ink); font:inherit; }
  .host-home-page .modal-field textarea{ min-height:80px; resize:vertical; }
  .host-home-page .modal-actions{ display:flex; gap:.6rem; margin-top:1rem; }
  .host-home-page .modal-actions button{ flex:1; padding:.7rem; border-radius:999px; font-weight:600; }
  .host-home-page .modal-cancel{ border:1px solid var(--line); color:var(--ink); }
  .host-home-page .modal-save{ background:var(--red); color:#fff; }
  .host-home-page .niche-prompt-card{ max-width:430px; }
  .host-home-page .niche-prompt-card p{ color:var(--muted); font-size:.9rem; line-height:1.5; margin:-.4rem 0 1.1rem; }
  .host-home-page .niche-prompt-options{ display:grid; grid-template-columns:1fr 1fr; gap:.6rem; }
  .host-home-page .niche-prompt-option{ padding:.75rem .8rem; border:1px solid var(--line); border-radius:10px; color:var(--ink); background:var(--paper); font:inherit; font-weight:600; text-align:left; cursor:pointer; }
  .host-home-page .niche-prompt-option:hover,
  .host-home-page .niche-prompt-option:focus-visible{ border-color:var(--red); color:var(--red-deep); }
  .host-home-page .niche-prompt-option:disabled{ opacity:.6; cursor:wait; }
  .host-home-page .niche-prompt-msg{ min-height:1.2em; color:var(--red); font-size:.82rem; margin:.8rem 0 0; }
  .host-home-page .listing-status-banner{ color:var(--red-deep); font-size:.8rem; font-weight:700; margin:.2rem 0 .6rem; text-transform:capitalize; }

  .host-home-page .report-modal-overlay{
    display:none; position:fixed; inset:0; z-index:250;
    background:rgba(26,18,16,.5); align-items:center; justify-content:center; padding:1.2rem;
  }
  .host-home-page .report-modal-overlay.open{ display:flex; }
  .host-home-page .report-modal{
    background:var(--white); border-radius:18px; padding:1.6rem 1.7rem; max-width:420px; width:100%;
  }
  .host-home-page .report-modal h3{ font-family:var(--font-display); font-weight:600; font-size:1.2rem; margin-bottom:.4rem; }
  .host-home-page .report-modal p{ font-size:.85rem; color:var(--muted); margin-bottom:1.1rem; line-height:1.5; }
  .host-home-page .report-modal .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1rem; }
  .host-home-page .report-modal label{ font-size:.86rem; font-weight:600; }
  .host-home-page .report-modal select,
  .host-home-page .report-modal textarea{
    font-family:inherit; font-size:.92rem; padding:.7rem .85rem; border:1px solid var(--line);
    border-radius:10px; background:var(--paper); color:var(--ink); width:100%;
  }
  .host-home-page .report-modal textarea{ min-height:80px; resize:vertical; }
  .host-home-page .report-modal-actions{ display:flex; gap:.7rem; margin-top:1.2rem; }
  .host-home-page .report-modal-actions button{ flex:1; padding:.8rem 1rem; border-radius:100px; font-weight:600; font-size:.9rem; }
  .host-home-page .report-cancel-btn{ background:transparent; border:1.5px solid var(--line); color:var(--ink); }
  .host-home-page .report-submit-btn{ background:var(--red); color:#fff; }
  .host-home-page .report-submit-btn:hover{ background:var(--red-deep); }
  .host-home-page .report-modal-msg{ font-size:.83rem; margin-top:.7rem; text-align:center; }
  .host-home-page .report-modal-msg.error{ color:var(--red); }
  .host-home-page .report-modal-msg.success{ color:#2e7d32; }

  .host-home-page .card-caption,
  .host-home-page .card-desc{ font-size:.94rem; line-height:1.45; margin:0 0 .65rem; color:var(--ink); overflow-wrap:anywhere; }
  html[data-theme="dark"] .host-home-page .card-caption,
  html[data-theme="dark"] .host-home-page .card-desc{ color:var(--ink); }

  .host-home-page .card-photos{
    display:grid; grid-template-columns:1fr 1fr; gap:.45rem;
    border-radius:16px; border:1px solid var(--line); overflow:hidden; margin-bottom:.65rem;
  }
  .host-home-page .card-photos img{ width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; display:block; }
  .host-home-page .card-photos.single{ grid-template-columns:1fr; }
  .host-home-page .card-photos.single img{ height:clamp(240px, 36vw, 440px); }
  .host-home-page .media-carousel{
    position:relative; overflow:hidden; border-radius:16px; border:1px solid var(--line); margin-bottom:.65rem; background:#000;
    touch-action:pan-y; user-select:none; -webkit-user-select:none;
  }
  .host-home-page .media-carousel.single-media{ border-radius:16px; }
  .host-home-page .media-slide-track{
    display:flex; width:100%; transition:transform .28s ease;
    will-change:transform;
  }
  .host-home-page .media-slide{ flex:0 0 100%; width:100%; }
  .host-home-page .media-slide img{ display:block; width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; }
  .host-home-page .media-carousel.single-media .media-slide img{ height:clamp(240px, 36vw, 440px); }
  .host-home-page .media-index-pill{
    position:absolute; top:.7rem; right:.7rem; z-index:2;
    border-radius:999px; padding:.28rem .6rem; background:rgba(26,18,16,.68);
    color:#fff; font-size:.72rem; font-weight:700; line-height:1;
    backdrop-filter:blur(6px);
  }
  .host-home-page .media-dots{
    position:absolute; z-index:3; left:50%; bottom:.65rem; transform:translateX(-50%);
    display:flex; justify-content:center; align-items:center; gap:.38rem;
    padding:.3rem .5rem; min-height:16px; border-radius:999px;
    background:rgba(26,18,16,.42); backdrop-filter:blur(5px);
  }
  .host-home-page .media-dot{
    width:6px; height:6px; border-radius:50%; background:var(--line);
    transition:all .2s ease; display:inline-block;
  }
  .host-home-page .media-dot.active{ background:var(--red); transform:scale(1.2); }
  .host-home-page .media-carousel-arrow{
    position:absolute; z-index:3; top:50%; transform:translateY(-50%);
    width:34px; height:34px; display:none; place-items:center; border-radius:50%;
    background:rgba(26,18,16,.58); color:#fff; font-size:1.7rem; line-height:1;
    transition:background .18s ease, transform .18s ease;
  }
  .host-home-page .media-carousel-arrow:hover{ background:rgba(26,18,16,.78); transform:translateY(-50%) scale(1.06); }
  .host-home-page .media-carousel-arrow.prev{ left:.65rem; }
  .host-home-page .media-carousel-arrow.next{ right:.65rem; }
  @media (hover:hover) and (pointer:fine){ .host-home-page .media-carousel:not(.single-media) .media-carousel-arrow{ display:grid; } }
  .host-home-page .card-video{ position:relative; border-radius:16px; border:1px solid var(--line); overflow:hidden; margin-bottom:.65rem; background:#000; }
  .host-home-page .card-video video{ display:block; width:100%; height:clamp(200px, 30vw, 360px); object-fit:cover; background:#000; }
  .host-home-page .card-video.single video{ height:clamp(240px, 36vw, 440px); }
  .host-home-page .host-video-upload{ margin:0 0 .75rem; }
  .host-home-page .host-video-upload-btn{
    display:inline-flex; align-items:center; gap:.5rem; padding:.5rem .8rem; border-radius:999px;
    background:#FBE4E7; color:var(--red-deep); font-size:.76rem; font-weight:700; cursor:pointer;
  }
  .host-home-page .host-video-upload input{ display:none; }
  .host-home-page .photo-placeholder{ grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px; background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%); display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.85); font-size:.85rem; font-weight:600; }
  .host-home-page .card-media-empty{ grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px; background:var(--line-soft); border:1px solid var(--line); }
  .host-home-page .card-media-loading,
  .host-home-page .card-media-unavailable{
    grid-column:1 / -1; height:clamp(200px, 30vw, 360px); border-radius:16px;
    background:var(--media-stage-fill); border:1px solid var(--line); color:var(--muted);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem;
    font-size:.82rem; font-weight:600;
  }
  .host-home-page .card-media-loading{ background:var(--va-light); }
  @keyframes discover-media-spin{ to{ transform:rotate(360deg); } }

  /* Discover media follows the source's own proportions. */
  .host-home-page #feed-list.discover-media-feed .card{ --discover-content-inset:56px; }
  .host-home-page #feed-list.discover-media-feed .card-caption{ margin-left:var(--discover-content-inset); }
  .host-home-page #feed-list.discover-media-feed .media-carousel,
  .host-home-page #feed-list.discover-media-feed .card-video{
    width:var(--discover-media-width, calc(100% - var(--discover-content-inset))); max-width:calc(100% - var(--discover-content-inset)); height:var(--discover-media-height, auto); margin-left:var(--discover-content-inset); margin-right:auto;
    position:relative; overflow:hidden; border:0; border-radius:16px; background:transparent;
  }
  .host-home-page #feed-list.discover-media-feed .media-carousel::after,
  .host-home-page #feed-list.discover-media-feed .card-video::after{ content:''; position:absolute; inset:0; z-index:4; border:1px solid var(--line); border-radius:inherit; pointer-events:none; }
  .host-home-page #feed-list.discover-media-feed .media-slide::before,
  .host-home-page #feed-list.discover-media-feed .card-video::before{ content:''; position:absolute; inset:-28px; z-index:0; background-image:var(--discover-ambient-image); background-position:center; background-size:cover; filter:blur(24px) saturate(1.12); pointer-events:none; }
  .host-home-page #feed-list.discover-media-feed .media-slide-track{ height:100%; }
  .host-home-page #feed-list.discover-media-feed .media-slide{ height:100%; display:flex; align-items:center; justify-content:center; position:relative; background:transparent; }
  .host-home-page #feed-list.discover-media-feed .media-slide img{ max-width:100%; height:auto; object-fit:initial; }
  .host-home-page .media-image-skeleton{ position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; background:var(--va-light); }
  .host-home-page .card-media-loading::before,
  .host-home-page .media-image-skeleton::after,
  .host-home-page .media-loading-indicator::after{
    content:''; width:36px; height:36px; flex:none; border:0; border-radius:0;
    background:var(--varoom-spinner) center / contain no-repeat;
    animation:discover-media-spin .8s steps(8) infinite;
  }
  .host-home-page .media-loading-indicator{ position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; background:var(--va-light); }
  html[data-theme="dark"] .host-home-page .card-media-loading,
  html[data-theme="dark"] .host-home-page .media-image-skeleton,
  html[data-theme="dark"] .host-home-page .media-loading-indicator{ background:#000; }
  .host-home-page .card-video.is-loaded .media-loading-indicator,
  .host-home-page .card-video.is-failed .media-loading-indicator{ display:none; }
  .host-home-page .card-video.is-autoplay-blocked .media-loading-indicator{ display:none; pointer-events:none; }
  .host-home-page #feed-list.discover-media-feed .card-video{ height:auto; background:transparent; }
  .host-home-page #feed-list.discover-media-feed .card-video video,
  .host-home-page #feed-list.discover-media-feed .card-video .varoom-video-player,
  .host-home-page #feed-list.discover-media-feed .card-video .varoom-video-player > video{
    display:block; width:100%; height:auto; object-fit:contain; background:transparent;
  }
  .host-home-page #feed-list.discover-media-feed .card-video .varoom-video-player{ height:100%; display:flex; align-items:center; justify-content:center; }
  .host-home-page #feed-list.discover-media-feed .media-slide img{ position:relative; z-index:1; margin:0; }
  .host-home-page #feed-list.discover-media-feed .card-video > video{ position:relative; z-index:1; }
  .host-home-page #feed-list.discover-media-feed .card-media-empty{
    height:auto; min-height:0; padding:1.4rem; border-radius:16px; background:transparent; border:1px solid var(--line);
  }
  .host-home-page #feed-list.discover-media-feed .card-media-loading{
    height:auto; aspect-ratio:4 / 3; min-height:0; padding:0; margin-left:var(--discover-content-inset); width:min(414px, calc(100% - var(--discover-content-inset))); max-width:calc(100% - var(--discover-content-inset));
    display:flex; align-items:center; justify-content:center; background:var(--va-light); color:transparent;
  }
  html[data-theme="dark"] .host-home-page #feed-list.discover-media-feed .card-media-loading{ background:#000; }
  .host-home-page #feed-list.discover-media-feed .card-media-unavailable{
    height:auto; min-height:0; padding:1.4rem; margin-left:var(--discover-content-inset); width:calc(100% - var(--discover-content-inset)); background:transparent;
  }

  .host-home-page .badge-row{ display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.9rem; }

  .host-home-page .badge{ display:flex; align-items:center; gap:.3rem; font-size:.76rem; font-weight:600; padding:.3rem .65rem; border-radius:100px; }
  .host-home-page .badge-verified{ background:#EAF4EE; color:#1E6B3C; }
  .host-home-page .badge-host{ background:#E9F0FB; color:#1A4E8F; }
  .host-home-page .badge-soon{ background:var(--line-soft); color:var(--muted); font-weight:500; }

  .host-home-page .action-row{ display:flex; align-items:center; gap:1.25rem; padding-top:.5rem; border-top:none; }

  .host-home-page .action-btn{
    display:flex; align-items:center; gap:.35rem;
    font-size:.82rem; font-weight:500; color:var(--muted);
    padding:.35rem .55rem; border-radius:9999px;
    transition:color .2s var(--home-ease), background-color .2s var(--home-ease), transform .15s var(--home-ease);
  }
  .host-home-page .action-btn:not(.disabled):hover{ background:var(--home-fill); }
  .host-home-page .action-btn:not(.disabled):active{ transform:scale(.96); }
  .host-home-page .bookmark-btn{ margin-left:0; color:var(--muted); }
  .host-home-page .bookmark-btn:hover{ color:var(--red); }
  .host-home-page .bookmark-btn.saved{ color:var(--red); }
  .host-home-page .like-btn{ margin-left:auto; color:var(--ink); flex-shrink:0; white-space:nowrap; }
  .host-home-page .like-btn:hover{ color:var(--ink); }
  .host-home-page .like-btn .like-count{ font-variant-numeric:tabular-nums; }

  /* ---------- MOBILE ---------- */


  @media (max-width:860px){
    .host-home-page .app-shell{ grid-template-columns:1fr; }


    .host-home-page .dash-header{ padding:1.4rem 0 .65rem; }
    .host-home-page .main-col{ height:auto; overflow-y:visible; overflow-x:hidden; grid-template-rows:auto auto; }
    .host-home-page .dash-body{ padding:0 1rem; gap:1.2rem; }
    .host-home-page .col-divider{ display:none; }
    .host-home-page .dash-main{ overflow-y:visible; height:auto; padding:0; }
    .host-home-page .host-rail{ padding:0 0 6rem; overflow-y:visible; height:auto; }
    .host-home-page .feed-area{ padding:.75rem .7rem 1.4rem; }
    .host-home-page .card{ border:none; border-radius:0; border-bottom:1px solid var(--line); margin:0 -.7rem; padding:1rem .7rem .85rem; }
    .host-home-page .action-row{ padding-right:1rem; }
    .host-home-page .skel-card{ border:none; border-radius:0; border-bottom:1px solid var(--line); margin:0 -.7rem; padding:1rem .7rem .85rem; }
    .host-home-page .card-photos{ gap:.3rem; }
    .host-home-page .card-photos img{ height:clamp(220px, 52vw, 460px); }
    .host-home-page .card-photos.single img{ height:clamp(250px, 60vw, 520px); }
    .host-home-page .media-carousel{ margin-bottom:.55rem; }
    .host-home-page .media-slide img{ height:clamp(220px, 52vw, 460px); }
    .host-home-page .media-carousel.single-media .media-slide img{ height:clamp(250px, 60vw, 520px); }
    /* Restore natural aspect ratio for discover-media-feed on mobile —
       the fixed clamp height above must not override discover's own sizing. */
    .host-home-page #feed-list.discover-media-feed .media-slide img{ height:auto; object-fit:initial; }
    .host-home-page #feed-list.discover-media-feed .card-video video,
  .host-home-page #feed-list.discover-media-feed .card-video .varoom-video-player,
  .host-home-page #feed-list.discover-media-feed .card-video .varoom-video-player > video{ height:auto; object-fit:contain; }
    .host-home-page #feed-list.discover-media-feed .media-carousel,
  .host-home-page #feed-list.discover-media-feed .card-video{
      width:var(--discover-media-width, calc(100% - 2 * var(--discover-content-inset)));
      max-width:calc(100% - 2 * var(--discover-content-inset));
    }
    .host-home-page #feed-list.discover-media-feed .card-media-loading{ width:min(414px, calc(100% - 2 * var(--discover-content-inset))); max-width:calc(100% - 2 * var(--discover-content-inset)); }
    .host-home-page #feed-list.discover-media-feed .media-slide{ display:flex; align-items:center; }
    .host-home-page #feed-list.discover-media-feed .media-slide img{ margin:auto; }
    .host-home-page .media-index-pill{ top:.55rem; right:.55rem; font-size:.66rem; }
    .host-home-page .media-dots{ bottom:.5rem; }

    .host-home-page .app-shell{ height:auto; overflow-y:visible; overflow-x:hidden; }

    .host-home-page .topbar-avatar-btn{ flex-shrink:0; display:flex; }
    .host-home-page .topbar-avatar-btn:hover .avatar-circle{ outline:2px solid rgba(196,30,58,.25); outline-offset:2px; }
    .host-home-page .topbar{
      position:sticky; top:0; z-index:100;
      background:var(--glass-bg);
      backdrop-filter:blur(18px) saturate(140%); -webkit-backdrop-filter:blur(18px) saturate(140%);
    }

    .host-home-page #notif-panel-card{ display:none !important; }


    /* Category filters: one scrollable row, never wrap */
    .host-home-page .dash-header{ margin-bottom:1.4rem; }
    .host-home-page .tabs{
      flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch;
      scrollbar-width:none; margin:0 .7rem; max-width:calc(100% - 1.4rem);
    }
    .host-home-page .tabs::-webkit-scrollbar{ display:none; }
    .host-home-page .tab{ flex-shrink:0; white-space:nowrap; }

    .host-home-page .bottom-notification-icon{ position:relative; display:flex; }
  }

  /*
   * Host Home's interface is deliberately neutral at every viewport. Red is
   * reserved for inline navigation/actions (for example, "View on Map" and
   * "View all") rather than being used as control chrome or decoration.
   * These overrides follow the shared dark-mode sheet so they apply equally
   * to the desktop layout, tablet layout, sidebar drawer, and mobile bar.
   */
  .host-home-page{
    --control-bg:#EFF3F4;
    --control-active:#E9E7E2;
    --control-hover:#EFEDE8;
    --control-strong:#0F1419;
    --control-strong-text:#FFFFFF;
    --neutral-icon:#536471;
  }
  html[data-theme="dark"] .host-home-page{
    --control-bg:#202327;
    --control-active:#2f3336;
    --control-hover:rgba(239, 243, 244, 0.1);
    --control-strong:#EFF3F4;
    --control-strong-text:#0F1419;
    --neutral-icon:#71767b;
  }

  .host-home-page :focus-visible{ outline-color:var(--neutral-icon); }

  .host-home-page .property-news-kicker,
  .host-home-page .listing-status-banner,
  .host-home-page .property-news-error,
  .host-home-page .verified-tick{ color:var(--ink); }
  .host-home-page .property-news-status,
  .host-home-page .host-video-upload-btn{
    background:var(--control-active);
    color:var(--ink);
    border-color:var(--line);
  }


  .host-home-page .search-wrap,
  html[data-theme="dark"] .host-home-page .search-wrap{
    background:var(--home-fill) !important;
    border:1px solid transparent !important;
    outline:none !important;
    box-shadow:none !important;
  }
  .host-home-page .search-wrap input,
  html[data-theme="dark"] .host-home-page .search-wrap input{
    background:transparent !important;
    background-color:transparent !important;
    border:none !important;
    outline:none !important;
    box-shadow:none !important;
    color:var(--ink) !important;
  }
  .host-home-page .search-wrap:focus-within,
  html[data-theme="dark"] .host-home-page .search-wrap:focus-within{
    background:var(--home-raised) !important;
    border-color:var(--line) !important;
    outline:none !important;
    box-shadow:0 0 0 4px var(--home-fill) !important;
  }

  .host-home-page .list-btn-primary,
  html[data-theme="dark"] .host-home-page .list-btn-primary,
  .host-home-page .topbar-list-btn,
  html[data-theme="dark"] .host-home-page .topbar-list-btn,
  .host-home-page .modal-save,
  .host-home-page .report-submit-btn,
  html[data-theme="dark"] .host-home-page .report-submit-btn{
    background:var(--control-strong) !important;
    border-color:var(--control-strong) !important;
    color:var(--control-strong-text) !important;
  }
  .host-home-page .topbar-list-btn:hover,
  html[data-theme="dark"] .host-home-page .topbar-list-btn:hover,
  .host-home-page .list-btn-primary:hover,
  .host-home-page .report-submit-btn:hover{ background:var(--control-hover) !important; color:var(--ink) !important; border-color:var(--line) !important; }

  .host-home-page .notif-panel-badge,
  .host-home-page .avatar-circle,
  .host-home-page .card-avatar{
    background:var(--nav-badge-bg, var(--control-active)) !important;
    color:var(--nav-badge-color, var(--ink)) !important;
  }
  .host-home-page .notif-panel-bell,
  .host-home-page .property-news-empty-icon-wrap,
  .host-home-page .empty-state-card .empty-icon{
    background:var(--control-active) !important;
    color:var(--neutral-icon) !important;
  }
  .host-home-page .photo-placeholder{ background:linear-gradient(135deg, var(--control-active), var(--control-bg)) !important; color:var(--ink) !important; }
  .host-home-page .property-news-source-link{ text-decoration-color:var(--line); }
  .host-home-page .property-news-source-link:hover{ color:var(--ink); text-decoration-color:currentColor; }
  .host-home-page .media-dot.active,
  html[data-theme="dark"] .host-home-page .media-dot.active{ background:var(--neutral-icon) !important; }
  .host-home-page .card-menu-item:hover{ background:var(--control-hover); }
  .host-home-page .card-menu-item.destructive,
  html[data-theme="dark"] .host-home-page .card-menu-item.destructive,
  .host-home-page .report-modal-msg.error{ color:var(--ink); }
  .host-home-page .bookmark-btn:hover,
  .host-home-page .bookmark-btn.saved{ color:var(--ink); }
  .host-home-page .topbar-avatar-btn:hover .avatar-circle{ outline-color:var(--neutral-icon); }

  /* Textual, inline actions retain the product accent. */
  .host-home-page .stats-head a,
  .host-home-page .card-map-link,
  .host-home-page .property-news-view-all{ color:var(--red); }
  .host-home-page .stats-head a:hover,
  .host-home-page .card-map-link:hover,
  .host-home-page .property-news-view-all:hover{ color:var(--red-deep); }

  /* ---------- RIGHT RAIL FOOTER (Social & Legal) ---------- */
  .host-home-page .rail-footer{
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
  .host-home-page .rail-footer::after{
    display:none !important;
  }
  .host-home-page .rail-social-row{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:18px;
    flex-wrap:nowrap;
    width:100%;
  }
  .host-home-page .rail-social-link{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    color:var(--muted);
    transition:color .18s ease, transform .18s ease;
    text-decoration:none;
    line-height:1;
  }
  .host-home-page .rail-social-link:hover{
    color:var(--ink);
    transform:translateY(-1px);
  }
  .host-home-page .rail-social-link:focus-visible{
    outline:2px solid var(--red);
    outline-offset:2px;
    border-radius:4px;
  }
  .host-home-page .rail-social-link svg{
    width:20px;
    height:20px;
    display:block;
    flex-shrink:0;
  }
  .host-home-page .rail-legal-links{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:0.4rem;
    flex-wrap:nowrap;
    width:100%;
    font-size:0.625rem;
    line-height:1.4;
  }
  .host-home-page .rail-legal-link{
    color:var(--muted);
    text-decoration:none;
    white-space:nowrap;
    transition:color .15s ease;
  }
  .host-home-page .rail-legal-link:hover{
    color:var(--ink);
    text-decoration:underline;
  }
  .host-home-page .rail-legal-link:focus-visible{
    outline:2px solid var(--red);
    outline-offset:2px;
    border-radius:2px;
  }
  .host-home-page .rail-legal-divider{
    color:var(--line);
    font-size:0.5625rem;
    opacity:0.85;
    user-select:none;
  }
`;
