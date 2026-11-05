// Styles for /profile, ported from legacy-pages/profile.html and scoped
// under .profile-page. Dropped: the legacy sidebar and bottom bar (the shell
// renders its own) and the legacy listing menu (HostListingMenu styles its
// own). Class names are kept so the shell's legacy-page rules apply unchanged.

export const PROFILE_STYLES = `
  .profile-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f; --card-border:#E4E1DA;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    --shell-bg:rgba(255,255,255,0.96); --sidebar-bg:#ffffff; --main-bg:#F7F6F3; --rail-bg:#FFFFFF; --card-bg:#ffffff;
  }
  html[data-theme="dark"] .profile-page{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; --card-border:rgba(255,255,255,.12); --nav-active-bg:rgba(255,255,255,.14);
    --shell-bg:#000000; --sidebar-bg:#000000; --main-bg:#000000; --rail-bg:#000000; --card-bg:#000000;
  }
  .profile-page, .profile-page *{ margin:0; padding:0; box-sizing:border-box; }
  .profile-page a{ color:inherit; text-decoration:none; }
  .profile-page button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  .profile-page :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }
  .profile-page img{ display:block; max-width:100%; }
  .profile-page{
    font-family:var(--font-body); color:var(--ink);
    background:var(--paper);
    transition:background .2s ease, color .2s ease;
  }

  /* ============================================================
     APP SHELL — thin wrapper, layout lives in .profile-desktop-shell
  ============================================================ *//* ── Loading layout mirrors the real profile while data is fetched ── */

  @keyframes skel-shimmer{
    0%{ background-position:150% 0; }
    100%{ background-position:-150% 0; }
  }
  .profile-page .skel{
    background:linear-gradient(90deg, var(--card-border) 25%, var(--card-bg) 50%, var(--card-border) 75%);
    background-size:200% 100%;
    animation:skel-shimmer 1.4s ease-in-out infinite;
    border-radius:8px;
  }
  .profile-page .skel-circle{ border-radius:50%; flex-shrink:0; }
  .profile-page .skel-pill{ border-radius:999px; }
  .profile-page .skeleton-shell{
    position:fixed; inset:0; z-index:20;
    display:grid; grid-template-columns:280px minmax(0,1fr);
    height:100vh; overflow:hidden; background:var(--paper);
  }
  .profile-page .skeleton-main{
    position:relative; height:100vh; overflow-y:auto; overflow-x:hidden; scrollbar-width:none;
    background:var(--main-bg); padding:0 20px 90px;
  }
  .profile-page .skeleton-main::-webkit-scrollbar{display:none}
  .profile-page .skel-topbar{ position:absolute; z-index:1; top:16px; left:20px; right:20px; height:40px; display:flex; justify-content:flex-end; align-items:center; gap:12px; }
  .profile-page .skel-topbar .skel-circle{ width:36px; height:36px; }
  .profile-page .skel-topbar .skel-pill{ width:134px; height:38px; }
  .profile-page .skeleton-banner{
    height:330px; position:relative; overflow:hidden; margin:0 -20px 24px;
    background:linear-gradient(110deg,var(--card-border) 20%,var(--card-bg) 48%,var(--card-border) 76%);
    background-size:200% 100%; animation:skel-shimmer 1.6s ease-in-out infinite;
  }
  .profile-page .skeleton-banner-content{
    position:absolute; inset:auto 28px 24px; display:flex; align-items:flex-end; gap:18px;
  }
  .profile-page .skeleton-avatar{ width:96px; height:96px; border:4px solid var(--paper); }
  .profile-page .skeleton-identity{ display:flex; flex:1; min-width:0; flex-direction:column; gap:10px; padding-bottom:4px; }
  .profile-page .skeleton-identity .skel:nth-child(1){ width:min(260px,55%); height:22px; }
  .profile-page .skeleton-identity .skel:nth-child(2){ width:min(170px,40%); height:14px; }
  .profile-page .skeleton-identity .skel:nth-child(3){ width:min(310px,75%); height:12px; }
  .profile-page .skeleton-header-actions{ display:flex; gap:10px; padding-bottom:4px; }
  .profile-page .skeleton-header-actions .skel{ width:116px; height:38px; }
  .profile-page .skeleton-host-content, .profile-page .skeleton-client-content{ padding:0 4px; }
  .profile-page .skeleton-section-heading{ display:flex; align-items:center; justify-content:space-between; gap:16px; margin:0 0 14px; }
  .profile-page .skeleton-section-heading .skel:first-child{ width:190px; height:22px; }
  .profile-page .skeleton-section-heading .skel:last-child{ width:118px; height:14px; }
  .profile-page .skeleton-tabs{ display:flex; gap:10px; overflow:hidden; padding:0 0 20px; }
  .profile-page .skeleton-tabs .skel{ flex:0 0 108px; height:36px; border-radius:999px; }
  .profile-page .skeleton-listings-grid{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
  .profile-page .skeleton-listing-card{ min-width:0; overflow:hidden; border:1px solid var(--card-border); border-radius:14px; background:var(--card-bg); }
  .profile-page .skeleton-listing-image{ width:100%; aspect-ratio:4/3; border-radius:0; }
  .profile-page .skeleton-listing-body{ display:flex; flex-direction:column; gap:10px; padding:14px; }
  .profile-page .skeleton-listing-body .skel:nth-child(1){ width:80%; height:16px; }
  .profile-page .skeleton-listing-body .skel:nth-child(2){ width:55%; height:12px; }
  .profile-page .skeleton-listing-footer{ display:flex; justify-content:space-between; gap:10px; margin-top:4px; }
  .profile-page .skeleton-listing-footer .skel{ width:42%; height:14px; }
  .profile-page .skeleton-booking-list{ display:grid; gap:12px; }
  .profile-page .skeleton-booking{ min-height:126px; display:grid; grid-template-columns:160px minmax(0,1fr) 110px; gap:16px; align-items:center; padding:12px; border:1px solid var(--card-border); border-radius:14px; background:var(--card-bg); }
  .profile-page .skeleton-booking-image{ width:100%; height:100px; }
  .profile-page .skeleton-booking-lines{ display:flex; flex-direction:column; gap:10px; }
  .profile-page .skeleton-booking-lines .skel:nth-child(1){ width:35%; height:12px; }
  .profile-page .skeleton-booking-lines .skel:nth-child(2){ width:65%; height:18px; }
  .profile-page .skeleton-booking-lines .skel:nth-child(3){ width:78%; height:12px; }
  .profile-page .skeleton-booking-price{ display:flex; flex-direction:column; gap:8px; align-items:flex-end; }
  .profile-page .skeleton-booking-price .skel:first-child{ width:75%; height:16px; }
  .profile-page .skeleton-booking-price .skel:last-child{ width:100%; height:34px; }
  .profile-page .skeleton-trips-grid{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:12px; }
  .profile-page .skeleton-trip{ display:flex; flex-direction:column; gap:10px; padding:12px; border:1px solid var(--card-border); border-radius:14px; background:var(--card-bg); }
  .profile-page .skeleton-trip-image{ width:100%; aspect-ratio:4/3; }
  .profile-page .skeleton-trip .skel:nth-child(2){ width:78%; height:16px; }
  .profile-page .skeleton-trip .skel:nth-child(3){ width:55%; height:12px; }
  .profile-page .skeleton-client-content{ display:none; }
  html[data-account-role="client"] .profile-page .skeleton-host-content{ display:none; }
  html[data-account-role="client"] .profile-page .skeleton-client-content{ display:block; }
  @media (max-width:1200px){.profile-page .skeleton-listings-grid{grid-template-columns:repeat(3,minmax(0,1fr));} }
  @media (max-width:1100px){
    .profile-page .skeleton-shell{ grid-template-columns:220px minmax(0,1fr); }
    html[data-account-role="host"] .profile-page .skeleton-shell{ grid-template-columns:280px minmax(0,1fr); }
    .profile-page .skeleton-listings-grid{grid-template-columns:repeat(3,minmax(0,1fr));}
  }
  @media (max-width:1050px){.profile-page .skeleton-listings-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
  @media (max-width:930px){
    .profile-page .skeleton-shell{ grid-template-columns:minmax(0,1fr); }
    .profile-page .skeleton-main{ padding:0 16px 90px; }
    .profile-page .skel-topbar{ top:12px; left:16px; right:16px; }
    .profile-page .skeleton-banner{ height:290px; margin:0 -16px 20px; }
    .profile-page .skeleton-banner-content{ inset:auto 18px 18px; flex-wrap:wrap; gap:12px; }
    .profile-page .skeleton-avatar{ width:78px; height:78px; }
    .profile-page .skeleton-header-actions{ margin-left:auto; }
    .profile-page .skeleton-header-actions .skel{ width:104px; }
    .profile-page .skeleton-trips-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); }
  }
  @media (max-width:600px){
    .profile-page .skeleton-banner{ height:280px; }
    .profile-page .skeleton-banner-content{ inset:auto 14px 16px; gap:10px; }
    .profile-page .skeleton-avatar{ width:66px; height:66px; border-width:3px; }
    .profile-page .skeleton-identity{ flex-basis:calc(100% - 80px); gap:8px; }
    .profile-page .skeleton-identity .skel:nth-child(1){ height:18px; }
    .profile-page .skeleton-identity .skel:nth-child(3){ width:90%; }
    .profile-page .skeleton-header-actions{ width:100%; margin:0; padding:0 0 0 76px; }
    .profile-page .skeleton-header-actions .skel{ flex:1; max-width:116px; height:36px; }
    .profile-page .skeleton-listings-grid{ grid-template-columns:1fr 1fr; gap:10px; }
    .profile-page .skeleton-listing-body{ gap:8px; padding:10px; }
    .profile-page .skeleton-booking{ grid-template-columns:88px minmax(0,1fr); gap:10px; padding:10px; }
    .profile-page .skeleton-booking-image{ height:84px; }
    .profile-page .skeleton-booking-price{ display:none; }
    .profile-page .skeleton-trips-grid{ gap:10px; }
  }
  @media (max-width:380px){.profile-page .skeleton-listings-grid{grid-template-columns:1fr;} }
  @media (prefers-reduced-motion:reduce){.profile-page .skel, .profile-page .skeleton-banner{animation:none;} }
  .profile-page .profile-desktop-shell{
    display:grid; grid-template-columns: 280px minmax(0, 1fr); gap:0;
    width:100%; max-width:none; margin:0; height:100vh;
    background:var(--shell-bg); border:none;
    border-radius:0; box-shadow:none;
    overflow:hidden;
  }
  
  /* Each column scrolls independently; scrollbar hidden but still scrollable */
  
  .profile-page .profile-main{
    height:100vh; overflow-y:auto; overflow-x:hidden;
    scrollbar-width:none; -ms-overflow-style:none;
  }
  .profile-page .profile-main::-webkit-scrollbar{
    display:none;
  }
  
  /* ── LEFT SIDEBAR ── */
  
  /* ── CENTER COLUMN ── */
  
  .profile-page .profile-main{ position:relative; background:var(--main-bg); padding:0 20px 30px; }
  html[data-theme="dark"] .profile-page .profile-main{--main-bg:#0c0b0b;--card-bg:#141212;--card-border:rgba(255,255,255,.11)}
  .profile-page .profile-topbar{ position:absolute; z-index:4; top:16px; left:20px; right:20px; display:flex; align-items:center; justify-content:space-between; padding:0 4px; pointer-events:none; }
  .profile-page .profile-topbar .topbar-actions{ pointer-events:auto; }
  .profile-page .topbar-spacer{ flex:1; }
  .profile-page .topbar-actions{ display:flex; align-items:center; gap:12px; }
  .profile-page .topbar-icon{ width:36px; height:36px; border-radius:50%; background:var(--card-bg); border:1px solid var(--card-border); color:var(--ink); display:flex; align-items:center; justify-content:center; }
  .profile-page .topbar-icon svg{ width:16px; height:16px; }
  .profile-page .topbar-user{ display:flex; align-items:center; gap:8px; background:var(--card-bg); border:1px solid var(--card-border); border-radius:999px; padding:4px 10px 4px 6px; color:var(--ink); font-weight:600; }
  .profile-page .topbar-user-avatar{ width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg, #181412, #3b312e); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; overflow:hidden; }
  .profile-page .topbar-user svg{ width:14px; height:14px; }
  .profile-page .topbar-user-wrap{ position:relative; }
  .profile-page .account-dropdown{
    display:none; position:absolute; top:calc(100% + 8px); right:0; z-index:250;
    min-width:250px; background:var(--card-bg); border:1px solid var(--card-border);
    border-radius:14px; padding:.4rem; box-shadow:0 16px 40px rgba(26,18,16,.18);
  }
  .profile-page .account-dropdown.open{ display:block; }
  .profile-page .account-row{ display:flex; align-items:center; gap:10px; width:100%; padding:.55rem .6rem; border:1px solid transparent; border-radius:10px; text-align:left; color:var(--ink); }
  .profile-page .account-row:not(.active):hover{ background:rgba(92,88,79,.08); cursor:pointer; }
  .profile-page .account-row.active{ border-color:var(--red); background:transparent; }
  .profile-page .account-row.switching{ opacity:.6; }
  .profile-page .account-row-avatar{ width:32px; height:32px; border-radius:50%; overflow:hidden; flex-shrink:0; background:linear-gradient(135deg,#1d1b1a,#5a4e4b); color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; }
  .profile-page .account-row-avatar img{ width:100%; height:100%; object-fit:cover; }
  .profile-page .account-row-info{ min-width:0; flex:1; }
  .profile-page .account-row-name{ display:block; font-size:0.8125rem; font-weight:800; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .profile-page .account-row-meta{ display:block; margin-top:2px; font-size:0.625rem; color:var(--muted); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .profile-page .account-row-check{ color:#2d7a4d; flex-shrink:0; font-weight:700; }
  .profile-page .account-dropdown-divider{ height:1px; background:var(--card-border); margin:.35rem 0; }
  .profile-page .account-add-btn{ display:flex; align-items:center; gap:10px; width:100%; padding:.6rem; border:1px solid transparent; border-radius:10px; color:var(--ink); font-weight:800; font-size:0.8125rem; }
  .profile-page .account-add-btn:hover{ background:rgba(196,30,58,.08); cursor:pointer; }
  .profile-page .account-add-btn.disabled{ color:var(--muted); cursor:not-allowed; opacity:.8; }
  .profile-page .account-add-btn.disabled svg{ opacity:.65; }
  .profile-page .profile-header{ margin:0; border:0; }
  .profile-page .profile-banner{
    height:330px;position:relative;isolation:isolate;margin:0 -20px;border-radius:0;
    background-color:#30251e;background-size:cover;background-position:center 48%;overflow:hidden;
  }
  .profile-page .profile-banner::before{
    content:'';position:absolute;z-index:-1;inset:0;pointer-events:none;
    background:linear-gradient(180deg,rgba(255,255,255,0) 8%,rgba(255,255,255,.2) 48%,rgba(255,255,255,.94) 100%);
  }
  .profile-page .profile-banner-actions{position:absolute;z-index:2;left:20px;top:16px;display:flex;gap:8px}
  .profile-page .profile-banner-actions button{
    display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid rgba(255,255,255,.38);
    border-radius:999px;background:rgba(10,10,10,.62);color:#fff;font:600 0.75rem var(--font-body);
    cursor:pointer;backdrop-filter:blur(10px);
  }
  .profile-page .profile-banner-actions button:hover{background:rgba(10,10,10,.82)}
  .profile-page .profile-banner-actions .banner-camera-btn{
    width:38px;height:38px;justify-content:center;padding:0;border-radius:50%;
  }
  .profile-page .profile-banner-actions .banner-camera-btn svg{width:17px;height:17px}
  .profile-page .profile-banner-actions .banner-file-input{
    position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
    clip:rect(0,0,0,0);white-space:nowrap;border:0;
  }
  .profile-page .profile-banner-options{
    position:absolute;top:46px;left:0;z-index:5;display:grid;gap:4px;min-width:152px;
    padding:5px;border:1px solid var(--card-border);border-radius:12px;
    background:var(--card-bg);box-shadow:0 12px 32px rgba(0,0,0,.28);
  }
  .profile-page .profile-banner-actions .banner-option{
    justify-content:flex-start;width:100%;padding:9px 10px;border:0;border-radius:8px;
    background:transparent;color:var(--ink);font:600 0.8125rem var(--font-body);backdrop-filter:none;
  }
  .profile-page .profile-banner-actions .banner-option:hover{background:var(--nav-active-bg)}
  .profile-page .profile-banner-actions .banner-option-danger{color:#c41e3a}
  .profile-page .profile-banner-options[hidden]{display:none}
  .profile-page .profile-header-body{
    position:absolute;z-index:1;left:30px;right:30px;bottom:22px;
    display:flex;align-items:center;gap:20px;padding:0;
  }
  .profile-page .profile-header-actions{ margin-left:auto; align-self:center; flex-shrink:0; }
  .profile-page .profile-personal{ display:flex; align-items:center; gap:18px; min-width:0; flex:1; }
  .profile-page .profile-avatar-wrap{ position:relative; flex-shrink:0; }
  .profile-page .profile-avatar{
    width:92px; height:92px; border-radius:50%; background:linear-gradient(135deg, #1d1b1a, #5a4e4b); color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:2rem; font-weight:700; overflow:hidden;
    border:3px solid rgba(255,255,255,.94); box-shadow:0 6px 18px rgba(0,0,0,.28);
  }
  .profile-page .profile-avatar img{ width:100%; height:100%; object-fit:cover; display:block; }
  .profile-page .avatar-upload-btn{
    position:absolute; right:-2px; bottom:0; width:30px; height:30px; border-radius:50%; background:#171615; color:#fff;
    display:flex; align-items:center; justify-content:center; border:2px solid #fff; cursor:pointer;
  }
  .profile-page .avatar-upload-btn input{ display:none; }
  .profile-page .avatar-upload-btn svg{ width:13px; height:13px; }
  .profile-page .profile-details{ min-width:0; }
  .profile-page .profile-details{ color:#24211e; text-shadow:0 1px 3px rgba(255,255,255,.3); }
  .profile-page .profile-details h1{ margin:0; font-size:clamp(21px,2vw,27px); font-weight:700; line-height:1.2; color:#171615; }
  .profile-page .profile-handle{ color:#514b47; font-size:0.875rem; margin-top:4px; }
  .profile-page .profile-line{ display:none; }
  .profile-page .profile-meta-row{ display:flex; flex-wrap:wrap; gap:14px; margin-top:11px; }
  .profile-page .meta-item{ display:flex; align-items:center; gap:6px; color:#514b47; font-size:0.75rem; }
  .profile-page .meta-item svg{ width:14px; height:14px; color:#c41e3a; }
  .profile-page .content-section{ padding-top:18px; }
  .profile-page .section-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .profile-page .section-header h2{ font-size:1rem; font-weight:700; color:var(--ink); }
  .profile-page .section-header a{ color:#c41e3a; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
  .profile-page .booking-list{ display:flex; flex-direction:column; gap:12px; }
  .profile-page .booking-item{
    display:grid; grid-template-columns: 160px 1fr auto; align-items:center; gap:14px; background:var(--card-bg); border:1px solid var(--card-border);
    border-radius:14px; padding:10px; overflow:hidden;
  }
  .profile-page .booking-thumb{ width:160px; height:104px; border-radius:12px; background-size:cover; background-position:center; }
  .profile-page .booking-main{ min-width:0; }
  .profile-page .booking-tag{ display:inline-block; margin-bottom:6px; padding:4px 8px; border-radius:999px; background:#fce9ec; color:#8f1229; font-size:0.625rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; }
  .profile-page .booking-title{ font-size:1.0625rem; font-weight:700; color:var(--ink); margin-bottom:4px; }
  .profile-page .booking-meta{ display:flex; align-items:center; gap:10px; color:var(--muted); font-size:0.75rem; flex-wrap:wrap; }
  .profile-page .booking-details{ display:flex; align-items:center; gap:8px; }
  .profile-page .booking-price-box{ min-width:120px; text-align:right; }
  .profile-page .booking-price-box .price-total{ font-size:0.875rem; font-weight:700; color:var(--ink); }
  .profile-page .booking-price-box .price-nights{ font-size:0.6875rem; color:var(--muted); }
  .profile-page .booking-button{ margin-top:8px; border:1px solid var(--card-border); border-radius:8px; background:var(--card-bg); color:var(--ink); font-weight:600; padding:8px 12px; }
  .profile-page .trip-grid{ display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; }
  .profile-page .trip-card{ background:var(--card-bg); border:1px solid var(--card-border); border-radius:14px; padding:8px 8px 12px; }
  .profile-page .trip-image{ height:110px; border-radius:10px; background-size:cover; background-position:center; }
  .profile-page .trip-card h3{ margin:10px 4px 4px; font-size:0.875rem; font-weight:700; }
  .profile-page .trip-meta{ display:flex; align-items:center; justify-content:space-between; padding:0 4px; font-size:0.6875rem; color:var(--muted); }
  .profile-page .trip-status{ display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:999px; background:#e7f7ed; color:#2d7a4d; font-weight:700; }
  .profile-page .trip-status::before{ content:'✓'; font-size:0.625rem; }
  .profile-page .profile-actions{ display:flex; gap:.7rem; flex-wrap:wrap; }
  .profile-page .hidden-actions{ display:none; }
  .profile-page .btn-outline{
    display:inline-flex; align-items:center; gap:.4rem;
    font-size:.85rem; font-weight:600; padding:.6rem 1.2rem;
    border-radius:100px; border:1.5px solid var(--card-border);
    color:var(--ink); background:var(--card-bg);
    transition:border-color .2s ease, background .2s ease;
  }
  .profile-page .btn-outline:hover{ border-color:var(--red); color:var(--red); }
  .profile-page .btn-outline svg{ width:14px; height:14px; }
  .profile-page .btn-solid{
    display:inline-flex; align-items:center; gap:.4rem;
    font-size:.85rem; font-weight:600; padding:.6rem 1.2rem;
    border-radius:100px; background:var(--red); color:var(--white);
    transition:background .2s ease;
  }
  .profile-page .btn-solid:hover{ background:var(--red-deep); }
  .profile-page .btn-solid svg{ width:14px; height:14px; }
  .profile-page .profile-header-actions .profile-actions .btn-outline{background:rgba(255,255,255,.76);color:#171615;border-color:rgba(23,22,21,.28)}
  .profile-page .profile-header-actions .profile-actions .btn-outline:hover{background:#fff;border-color:var(--red);color:var(--red)}
  .profile-page .profile-header-actions #owner-actions .btn-outline:last-child, .profile-page .profile-header-actions #visitor-actions .btn-outline{background:var(--red);border-color:var(--red);color:#fff}
  .profile-page .profile-header-actions #owner-actions .btn-outline:last-child:hover, .profile-page .profile-header-actions #visitor-actions .btn-outline:hover{background:var(--red-deep);color:#fff}
  
  /* ============================================================
     LISTINGS (host listings shown when viewing another user's profile)
  ============================================================ */
  
  .profile-page .listings-grid{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:1rem; margin:0 0 3rem; }
  .profile-page .listing-card{
    background:var(--card-bg); border:1px solid var(--card-border);
    border-radius:16px; overflow:hidden;min-width:0;
    position:relative;
    transition:transform .18s ease,border-color .18s ease;
    cursor:pointer;
  }
  .profile-page .listing-card:hover{ transform:translateY(-2px);border-color:rgba(196,30,58,.55); }
  .profile-page .listing-card:focus-visible{outline:3px solid var(--red);outline-offset:3px}
  .profile-page .listing-thumb{ position:relative; aspect-ratio:4/3; background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%); overflow:hidden; }
  .profile-page .listing-thumb img, .profile-page .listing-thumb video{ width:100%; height:100%; object-fit:cover;display:block; }
  .profile-page .listing-cat-pill{
    position:absolute; top:.7rem; left:.7rem;
    font-size:.66rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    background:rgba(255,255,255,.95); color:#24211E;
    padding:.3rem .7rem; border-radius:100px;
    box-shadow:0 2px 8px rgba(26,18,16,.25);
  }
  .profile-page .listing-card-body{ padding:.9rem 1rem 1rem; }
  .profile-page .listing-card-title{ font-family:var(--font-display); font-weight:650; font-size:.96rem; margin-bottom:.28rem; line-height:1.3; }
  .profile-page .listing-card-loc{ font-size:.8rem; color:var(--muted); margin-bottom:.65rem; }
  .profile-page .listing-card-footer{ display:flex; align-items:center; justify-content:space-between;gap:8px; }
  .profile-page .listing-card-price{ font-size:.86rem; font-weight:700; }
  .profile-page .listing-card-status{ font-size:.68rem; font-weight:700; letter-spacing:.045em; text-transform:uppercase; color:var(--red);white-space:nowrap; }
  .profile-page .listing-card-status.available{ color:#238653; }
  .profile-page .listing-card-status.booked{ color:var(--muted); }
  .profile-page .listing-card-status.unavailable, .profile-page .listing-card-status.paused{ color:#b45309; }
  .profile-page .listing-card-menu{ position:absolute; top:.65rem; right:.65rem; z-index:20; }
  .profile-page .listing-card-menu .card-menu-btn{ background:var(--card-bg);color:var(--ink);border:1px solid var(--card-border);box-shadow:0 2px 8px rgba(0,0,0,.16); }
  .profile-page .listing-card-menu .card-menu-btn svg{ width:16px; height:16px; }
  .profile-page .card-menu-wrap{ position:relative; }
  .profile-page .card-menu-btn{ width:30px; height:30px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--card-bg); color:var(--ink); font-size:1.2rem; }
  .profile-page .listings-empty{ grid-column:1/-1; text-align:center; padding:3rem 1.5rem; color:var(--muted); font-size:.92rem; line-height:1.6; }
  .profile-page .listings-empty-icon{
    width:48px; height:48px; border-radius:50%;
    background:rgba(196,30,58,.08); color:var(--red-deep);
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 1rem;
  }
  .profile-page .profile-category-row{display:flex;align-items:center;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;white-space:nowrap;border-bottom:1px solid var(--card-border);margin:0 0 18px}
  .profile-page .profile-category-row::-webkit-scrollbar{display:none}
  .profile-page .profile-category-row button{flex:0 0 auto;padding:12px 10px 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--muted);font:600 0.8125rem inherit;cursor:pointer}
  .profile-page .profile-category-row button[aria-selected="true"]{border-bottom-color:var(--red);color:var(--ink)}
  .profile-page .profile-category-row .category-manage{margin-left:auto;color:var(--red)}
  .profile-page .profile-category-manager{display:none;position:fixed;inset:0;z-index:1200;overflow:hidden;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.68);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#f7f7f7}
  .profile-page .profile-category-manager.open{display:flex}
  .profile-page .profile-category-manager-card{width:min(570px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:hidden;margin:0;background:#050505;color:#f7f7f7;border:0;border-radius:0;padding:0 24px 24px;box-shadow:none}
  .profile-page .profile-category-manager-card.selection-mode{width:min(650px,calc(100vw - 48px));height:min(880px,calc(100dvh - 48px));max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;padding:14px 22px 12px}
  .profile-page .category-create-view{max-width:442px;margin:0 auto;text-align:center}
  .profile-page .category-stack{height:230px;position:relative;width:300px;max-width:100%;margin:0 auto 3px}
  .profile-page .category-stack img{position:absolute;top:0;left:50%;width:130px;height:180px;object-fit:cover;border-radius:11px;box-shadow:0 12px 28px #0009}
  .profile-page .category-stack img:nth-child(1){transform:translateX(-110%) rotate(-10deg);top:-5px}
  .profile-page .category-stack img:nth-child(2){transform:translateX(-50%) rotate(0deg);top:2px}
  .profile-page .category-stack img:nth-child(3){transform:translateX(10%) rotate(10deg);top:28px}
  .profile-page .category-create-view h2{margin:0;font-size:1.75rem;line-height:1.2;font-weight:700}
  .profile-page .category-create-view>p{margin:7px 0 24px;color:#aaa;font-size:0.875rem}
  .profile-page .category-create-form{text-align:left}
  .profile-page .category-create-form label{display:block;margin-bottom:5px;font-size:1rem;font-weight:600}
  .profile-page .category-create-form .category-field-label{display:block;margin-bottom:8px;color:#888;font-size:0.6875rem}
  .profile-page .category-create-form input[type=text], .profile-page .category-search{width:100%;min-width:0;padding:11px 13px;border:1px solid #303030;border-radius:11px;background:#101010;color:#fff;font:inherit;outline:none}
  .profile-page .category-create-form input:focus, .profile-page .category-search:focus{border-color:#888}
  .profile-page .category-primary{width:100%;height:42px;margin-top:8px;padding:10px 18px;border:0;border-radius:999px;background:#fff;color:#080808;font:inherit;font-size:0.8125rem;font-weight:700;cursor:pointer}
  .profile-page .category-primary:disabled, .profile-page .category-add:disabled{opacity:.55;cursor:wait}
  .profile-page .profile-category-entry{display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid #242424}
  .profile-page .profile-category-entry strong{flex:1;min-width:0}
  .profile-page .category-selection-view{display:none;max-width:none;width:100%;min-height:0;margin:0 auto}
  .profile-page .category-selection-view.active{display:flex;flex:1;flex-direction:column;min-height:0}
  .profile-page .category-selection-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin:2px 0 12px}
  .profile-page .category-selection-brand{color:#aaa;font-size:0.75rem}
  .profile-page .category-selection-head h2{margin:5px 0;font-size:1.5rem}
  .profile-page .category-selection-head p{margin:0;color:#aaa;font-size:0.8125rem}
  .profile-page .category-selected-count{flex:0 0 auto;padding:9px 12px;border:1px solid #292929;border-radius:999px;background:#111;font-size:0.75rem}
  .profile-page .category-search{height:34px;border-radius:999px;margin-bottom:10px;padding:7px 12px;font-size:0.75rem}
  .profile-page .category-listing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:max-content;align-content:start;gap:14px;min-height:0;flex:1;overflow-y:auto;overflow-x:hidden;padding:0 4px 12px 0;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#444 #111}
  .profile-page .category-listing-grid::-webkit-scrollbar{width:6px}
  .profile-page .category-listing-grid::-webkit-scrollbar-track{background:#111;border-radius:8px}
  .profile-page .category-listing-grid::-webkit-scrollbar-thumb{background:#444;border-radius:8px}
  .profile-page .category-listing-card{display:block;min-width:0;overflow:hidden;border:1px solid #292929;border-radius:12px;background:#080808}
  .profile-page .category-listing-card img{display:block;width:100%;height:clamp(150px,26vh,250px);object-fit:cover;background:#171717}
  .profile-page .category-listing-card:last-child:nth-child(odd){grid-column:1/-1;justify-self:center;width:calc((100% - 14px)/2)}
  .profile-page .category-listing-copy{padding:8px 9px 10px}
  .profile-page .category-listing-title-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
  .profile-page .category-listing-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.8125rem;font-weight:600}
  .profile-page .category-listing-location{margin-top:4px;color:#929292;font-size:0.625rem}
  .profile-page .category-listing-price-row{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-top:5px}
  .profile-page .category-listing-price{font-weight:700;font-size:0.875rem}
  .profile-page .category-listing-period{color:#999;font-size:0.5625rem}
  .profile-page .category-toggle{flex:0 0 auto;padding:4px 7px;border:1px solid #292929;border-radius:999px;background:#111;color:#f7f7f7;font:inherit;font-size:0.5625rem;font-weight:600;cursor:pointer}
  .profile-page .category-toggle.selected{border-color:#fff;background:#fff;color:#090909}
  .profile-page .category-selection-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px;padding:12px 0 2px;background:#080808;border-top:1px solid #222}
  .profile-page .category-available-count{color:#999;font-size:0.6875rem}
  .profile-page .category-add{padding:10px 17px;border:0;border-radius:999px;background:#fff;color:#080808;font:inherit;font-size:0.75rem;font-weight:700;cursor:pointer}
  .profile-page .category-manager-error{color:#ff9eaa;font-size:0.8125rem}
  .profile-page .category-context-menu{position:fixed;z-index:1300;display:none;min-width:142px;padding:5px;background:#121212;border:1px solid #303030;border-radius:10px;box-shadow:0 14px 38px #0009}
  .profile-page .category-context-menu.open{display:block}
  .profile-page .category-context-menu button{display:block;width:100%;padding:9px 11px;border:0;border-radius:7px;background:transparent;color:#f7f7f7;text-align:left;font:600 0.8125rem inherit;cursor:pointer}
  .profile-page .category-context-menu button:hover, .profile-page .category-context-menu button:focus-visible{background:#262626;outline:0}
  .profile-page .category-context-menu .category-context-delete{color:#ff9eaa}
  .profile-page .category-name-editor{display:none;position:fixed;inset:0;z-index:1400;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.65)}
  .profile-page .category-name-editor.open{display:flex}
  .profile-page .category-name-editor-card{width:min(380px,100%);padding:20px;border:1px solid #303030;border-radius:14px;background:#101010;color:#f7f7f7;box-shadow:0 18px 50px #000a}
  .profile-page .category-name-editor-card h2{margin:0 0 14px;font-size:1.125rem}.profile-page .category-name-editor-card input{width:100%;padding:10px 12px;border:1px solid #444;border-radius:9px;background:#080808;color:#fff;font:inherit}.profile-page .category-name-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.profile-page .category-name-editor-actions button{padding:8px 12px;border:1px solid #444;border-radius:999px;background:transparent;color:#fff;font:600 0.75rem inherit;cursor:pointer}.profile-page .category-name-editor-actions .category-name-save{border-color:#fff;background:#fff;color:#080808}
  @media(max-width:600px){.profile-page .profile-category-manager{padding:12px}.profile-page .profile-category-manager-card, .profile-page .profile-category-manager-card.selection-mode{width:calc(100vw - 24px);max-height:calc(100dvh - 24px);height:auto;padding:12px 14px 18px;border-radius:0}.profile-page .profile-category-manager-card.selection-mode{height:calc(100dvh - 24px);padding:12px 10px 10px}.profile-page .category-create-view{margin-top:0}.profile-page .category-stack{height:190px;width:280px}.profile-page .category-stack img{width:112px;height:148px}.profile-page .category-create-view h2{font-size:1.4375rem}.profile-page .category-create-view>p{font-size:0.8125rem;margin-bottom:19px}.profile-page .category-selection-head{align-items:flex-start;gap:8px;margin:2px 0 9px}.profile-page .category-selection-head h2{font-size:1.125rem}.profile-page .category-selection-head p{max-width:290px;line-height:1.35;font-size:0.6875rem}.profile-page .category-selected-count{padding:6px 8px;font-size:0.625rem}.profile-page .category-search{height:34px;margin-bottom:8px;font-size:0.75rem}.profile-page .category-listing-grid{gap:9px}.profile-page .category-listing-card img{height:clamp(112px,38vw,155px)}.profile-page .category-listing-copy{padding:6px}.profile-page .category-listing-title{font-size:0.6875rem}.profile-page .category-toggle{padding:4px 6px;font-size:0.5625rem}.profile-page .category-listing-price{font-size:0.75rem}.profile-page .category-listing-location{font-size:0.5625rem}.profile-page .category-listing-card:last-child:nth-child(odd){width:calc((100% - 9px)/2)}}
  .profile-page .profile-review-section{display:none;padding:18px 0}
  .profile-page .profile-review-card{padding:14px 0;border-bottom:1px solid var(--card-border)}
  html[data-theme="dark"] .profile-page .profile-banner::before{
    background:linear-gradient(180deg,rgba(0,0,0,.04) 8%,rgba(0,0,0,.28) 48%,rgba(0,0,0,.9) 100%);
  }
  html[data-theme="dark"] .profile-page .profile-details{color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.6)}
  html[data-theme="dark"] .profile-page .profile-details h1{color:#fff}
  html[data-theme="dark"] .profile-page .profile-handle, html[data-theme="dark"] .profile-page .meta-item{color:rgba(255,255,255,.82)}
  html[data-theme="dark"] .profile-page .profile-header-actions .profile-actions .btn-outline{
    background:rgba(12,12,12,.58);color:#fff;border-color:rgba(255,255,255,.5);
  }
  html[data-theme="dark"] .profile-page .profile-header-actions .profile-actions .btn-outline:hover{background:rgba(12,12,12,.82);color:#fff}
  html[data-theme="dark"] .profile-page .profile-header-actions #owner-actions .btn-outline:last-child, html[data-theme="dark"] .profile-page .profile-header-actions #visitor-actions .btn-outline{background:var(--red);border-color:var(--red);color:#fff}
  
  /* ============================================================
     EDIT MODAL
  ============================================================ */
  
  .profile-page .modal-overlay{
    display:none; position:fixed; inset:0; z-index:300;
    background:rgba(26,18,16,.5);
    align-items:center; justify-content:center; padding:1.5rem;
  }
  .profile-page .modal-overlay.open{ display:flex; }
  .profile-page .modal-card{
    background:var(--paper); border-radius:20px; max-width:460px; width:100%;
    padding:2rem 1.8rem;
    box-shadow:0 40px 80px -30px rgba(26,18,16,.5);
  }
  .profile-page .modal-card h2{ font-family:var(--font-display); font-weight:600; font-size:1.3rem; margin-bottom:1.4rem; }
  .profile-page .modal-field{ margin-bottom:1rem; }
  .profile-page .modal-field label{ display:block; font-size:.78rem; font-weight:700; margin-bottom:.4rem; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); }
  .profile-page .modal-field input, .profile-page .modal-field textarea{
    width:100%; padding:.7rem .9rem;
    border:1px solid var(--card-border); border-radius:10px;
    background:var(--paper); color:var(--ink);
    font-family:inherit; font-size:.9rem;
  }
  .profile-page .modal-field input:focus, .profile-page .modal-field textarea:focus{ outline:none; border-color:var(--red); }
  .profile-page .modal-field textarea{ resize:vertical; min-height:80px; line-height:1.5; }
  .profile-page .modal-actions{ display:flex; gap:.8rem; margin-top:1.4rem; }
  .profile-page .modal-actions button{ flex:1; padding:.8rem; border-radius:100px; font-weight:600; font-size:.9rem; }
  .profile-page .modal-cancel{ background:transparent; border:1.5px solid var(--card-border); color:var(--ink); }
  .profile-page .modal-cancel:hover{ border-color:var(--muted); }
  .profile-page .modal-save{ background:var(--red); color:#fff; }
  .profile-page .modal-save:hover{ background:var(--red-deep); }
  .profile-page .modal-save:disabled{ opacity:.6; cursor:not-allowed; }
  .profile-page .modal-msg{ font-size:.82rem; margin-top:.8rem; text-align:center; color:var(--red); }
  
  /* ============================================================
     SHARE PANEL
  ============================================================ */
  
  .profile-page .share-panel{
    display:none; background:var(--card-bg); border:1px solid var(--card-border);
    border-radius:16px; padding:1.3rem 1.5rem; margin:1.5rem 0 0;
  }
  .profile-page .share-panel.show{ display:block; }
  .profile-page .share-panel-title{ font-weight:700; font-size:.95rem; color:var(--red); margin-bottom:1rem; padding-bottom:.8rem; border-bottom:1px solid var(--card-border); }
  .profile-page .share-row{ display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; }
  .profile-page .share-row-label{ font-size:.85rem; font-weight:600; }
  .profile-page .copy-btn{
    display:inline-flex; align-items:center; gap:.4rem;
    font-size:.8rem; font-weight:600; padding:.5rem 1rem;
    border-radius:100px; border:1.5px solid var(--red); color:var(--red);
  }
  .profile-page .copy-btn:hover{ background:var(--red); color:#fff; }
  .profile-page .share-icons{ display:flex; gap:.8rem; }
  .profile-page .share-icon{
    width:42px; height:42px; border-radius:50%; border:1.5px solid var(--red); color:var(--red);
    display:flex; align-items:center; justify-content:center;
  }
  .profile-page .share-icon:hover{ background:var(--red); color:#fff; }
  .profile-page .share-icon svg{ width:17px; height:17px; }
  
  /* ============================================================
     TOAST
  ============================================================ */
  
  .profile-page .toast{
    position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(20px);
    background:#24211E; color:#fff; padding:.8rem 1.4rem; border-radius:100px;
    font-size:.88rem; font-weight:600; z-index:400; opacity:0; pointer-events:none;
    transition:opacity .25s ease, transform .25s ease;
  }
  .profile-page .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  
  /* ============================================================
     MOBILE BOTTOM BAR (only nav for narrow viewports)
  ============================================================ */
  @media (max-width:860px){
    
  }
  
  /* ============================================================
     RESPONSIVE — profile-desktop-shell breakpoints
  ============================================================ */
  
  @media (max-width: 1100px){
    .profile-page .profile-desktop-shell{ grid-template-columns: 220px minmax(0, 1fr); }
    .profile-page .listings-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media (max-width: 1200px){
    .profile-page .listings-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  }
  @media (max-width: 1050px){
    .profile-page .listings-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media (max-width: 930px){
    .profile-page{ height:auto; overflow:auto; }
    .profile-page .profile-desktop-shell{ display:block; max-width:none; height:auto; border-radius:0; border:none; box-shadow:none; }
    .profile-page .profile-main{ border-right:none; height:auto; overflow:visible; padding:0 16px 30px; }
    .profile-page .profile-topbar{ top:12px; left:16px; right:16px; }
    .profile-page .profile-header-body{
      left:18px;right:18px;bottom:18px;display:grid;
      grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:0;
    }
    .profile-page .profile-banner{height:290px;margin:0 -16px;border-radius:0}
    .profile-page .profile-personal{grid-column:1/-1;gap:14px}
    .profile-page .profile-header-actions{grid-column:1/-1;justify-self:end;margin:0}
    .profile-page .profile-avatar{width:78px;height:78px;font-size:1.6875rem}
    .profile-page .profile-meta-row{gap:8px 12px;margin-top:8px}
    .profile-page .profile-category-row{margin-top:0}
    .profile-page .trip-grid{ grid-template-columns:1fr; }
    .profile-page .booking-item{ grid-template-columns:1fr; }
    .profile-page .booking-thumb{ width:100%; }
    .profile-page .booking-price-box{ text-align:left; }
    .profile-page .listings-grid{ grid-template-columns:1fr 1fr; gap:.8rem; }

  }
  @media (max-width:500px){
    .profile-page .profile-banner{height:280px}
    .profile-page .profile-header-body{left:14px;right:14px;bottom:16px;gap:10px}
    .profile-page .profile-personal{gap:11px}
    .profile-page .profile-avatar{width:66px;height:66px;font-size:1.4375rem}
    .profile-page .profile-details h1{font-size:1.25rem}
    .profile-page .profile-handle{font-size:0.8125rem}
    .profile-page .profile-meta-row{gap:6px 10px}
    .profile-page .meta-item{font-size:0.6875rem}
    .profile-page .profile-header-actions .profile-actions{gap:8px}
    .profile-page .profile-header-actions .btn-outline, .profile-page .profile-header-actions .btn-solid{padding:.55rem .9rem;font-size:.8rem}
    .profile-page .profile-banner-actions{left:12px;top:12px}
    .profile-page .profile-banner-actions button{padding:8px 10px}
    .profile-page .listings-grid{ grid-template-columns:1fr; }
  }
  
  /* The host shell owns its sidebar and scroll area; keep profile loading/content inside it. */
  
  .host-layout-active .host-page-content #loading-state{
    position:absolute; inset:0; z-index:1; grid-template-columns:minmax(0,1fr);
    width:100%; height:100%; min-height:100vh;
  }
  .host-layout-active .host-page-content #loading-state > .skeleton-main{
    width:100%; height:100%; min-height:100vh; overflow:visible;
  }
  .host-layout-active .host-page-content #profile-content .profile-desktop-shell{
    display:block; width:100%; height:auto; min-height:100vh; overflow:visible;
  }
  .host-layout-active .host-page-content #profile-content .profile-main{
    width:100%; height:auto; min-height:100vh; overflow:visible;
  }
  
  /* The client shell owns its sidebar and scroll area; keep profile loading/content inside it. */
  
  .client-layout-active .client-page-content #loading-state{
    position:absolute; inset:0; z-index:1; grid-template-columns:minmax(0,1fr);
    width:100%; height:100%; min-height:100vh;
  }
  .client-layout-active .client-page-content #loading-state > .skeleton-main{
    width:100%; height:100%; min-height:100vh; overflow:visible;
  }
  .client-layout-active .client-page-content #profile-content .profile-desktop-shell{
    display:block; width:100%; height:auto; min-height:100vh; overflow:visible;
  }
  .client-layout-active .client-page-content #profile-content .profile-main{
    width:100%; height:auto; min-height:100vh; overflow:visible;
  }
`;
