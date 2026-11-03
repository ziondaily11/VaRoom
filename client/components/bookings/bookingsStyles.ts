// Styles for the Bookings pages, ported from legacy-pages/bookings.html (both
// style blocks), scoped under .bookings-page. The legacy sidebar rules are
// dropped (the app shell renders its own sidebar); class names are kept so the
// shell's legacy-page rules (shellStyles.ts) apply unchanged.

export const BOOKINGS_STYLES = `
  .bookings-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    --glass-bg:rgba(255,255,255,.55);
    --glass-border:rgba(255,255,255,.6);
    --glass-shadow:0 24px 55px #E4E1DA;
    --line:#E4E1DA;
    --line-soft:#E4E1DA;
  }
  html[data-theme="dark"] .bookings-page{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; --nav-active-bg:rgba(255,255,255,.14);
    --glass-bg:rgba(28,20,18,.55);
    --glass-border:rgba(255,255,255,.09);
    --glass-shadow:0 24px 55px rgba(0,0,0,.5);
    --line:rgba(255,255,255,.12);
    --line-soft:rgba(255,255,255,.07);
  }
  .bookings-page, .bookings-page *{ margin:0; padding:0; box-sizing:border-box; }
  .bookings-page{
    font-family:var(--font-body); color:var(--ink); height:100vh; overflow:hidden;
    transition:background .2s ease, color .2s ease;
    background:var(--paper);
  }
  .bookings-page a{ color:inherit; text-decoration:none; }
  .bookings-page button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  .bookings-page :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }
  .bookings-page ul{ list-style:none; }
  .bookings-page .app-shell{
    display:grid;
    grid-template-columns: 280px minmax(0, 1fr);
    height:100vh;
    overflow:hidden;
  }

  /* ---------- TOAST ---------- */
  .bookings-page .toast{
    position:fixed; bottom:1.5rem; left:50%; transform:translateX(-50%) translateY(20px);
    background:var(--ink); color:var(--white); padding:.8rem 1.4rem; border-radius:100px;
    font-size:.88rem; font-weight:600; z-index:300; opacity:0; pointer-events:none;
    transition:opacity .25s ease, transform .25s ease;
  }
  .bookings-page .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  
  /* ---------- MAIN COLUMN ---------- */
  
  .bookings-page .main-col{ display:flex; flex-direction:column; height:100vh; overflow:hidden; min-width:0; }
  .bookings-page .topbar{ display:flex; align-items:center; gap:1rem; padding:0 2rem; min-height:0; background:transparent; }
  .bookings-page .topbar-avatar-btn{ display:none; }
  .bookings-page .mobile-page-title{ display:none; }
  .bookings-page .avatar-circle{
    width:38px; height:38px; border-radius:50%; background:var(--red); color:var(--white);
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem;
  }
  .bookings-page .back-link{ display:none; }
  .bookings-page .content-row{
    display:grid; grid-template-columns: minmax(560px, 1fr) minmax(480px, 500px);
    align-items:start; min-width:0; flex:1 1 auto; min-height:0; overflow:hidden; gap:0; width:100%; max-width:100%;
  }
  .bookings-page .feed-area{
    width:100%; max-width:900px; min-width:560px; padding:.6rem 2rem 4rem;
    height:100%; overflow-y:auto; scrollbar-width:none; margin:0 auto;
    border-right:1px solid var(--line); box-sizing:border-box;
  }
  .bookings-page .feed-area::-webkit-scrollbar{ display:none; }
  .bookings-page .right-rail{
    width:100%; max-width:500px; padding:.6rem 1rem 1rem;
    display:flex; flex-direction:column; gap:1.3rem; height:100%; overflow-y:auto;
    scrollbar-width:none; justify-self:end; border-left:1px solid var(--line); box-sizing:border-box;
  }
  .bookings-page .right-rail::-webkit-scrollbar{ display:none; }
  .bookings-page .right-rail.booking-details-open{ overflow-y:auto; gap:.25rem; }
  .bookings-page #client-right-rail{ display:flex; flex:1 1 auto; flex-direction:column; gap:1.3rem; min-height:0; }
  .bookings-page .booking-detail-panel{ --green:#1E6B3C; --green-deep:#153E24; display:flex; flex:1 1 auto; flex-direction:column; min-height:0; }
  .bookings-page .booking-detail-rail-head{ display:flex; align-items:center; flex:0 0 auto; min-height:2.5rem; margin-bottom:.45rem; }
  .bookings-page .booking-detail-back{ display:inline-flex; align-items:center; gap:.45rem; color:var(--muted); font-size:.84rem; font-weight:600; }
  .bookings-page .booking-detail-back:hover{ color:var(--red); }
  .bookings-page .booking-detail-back svg{ width:17px; height:17px; }
  .bookings-page .booking-detail-content{ min-height:0; }
  .bookings-page .booking-approved-hero{
    text-align:center; color:#F5EFEC; padding:1rem 1.2rem 1.25rem;
    background:radial-gradient(ellipse at top, #2A1F1C 0%, #150F0D 70%);
    border-radius:18px 18px 0 0;
  }
  .bookings-page .booking-approved-check{
    width:42px; height:42px; margin:0 auto .55rem; border-radius:50%;
    border:2px solid var(--green); display:flex; align-items:center; justify-content:center;
    color:var(--green);
  }
  .bookings-page .booking-approved-check svg{ width:21px; height:21px; }
  .bookings-page .booking-approved-hero h2{ font-size:1.38rem; line-height:1.2; margin-bottom:.3rem; }
  .bookings-page .booking-approved-hero h2 span{ color:var(--green); }
  .bookings-page .booking-approved-hero p{ color:#C9BDB8; font-size:.8rem; line-height:1.4; }
  .bookings-page .booking-detail-card{
    background:var(--white); border:1px solid var(--line); border-top:0;
    border-radius:0 0 18px 18px; padding:1rem 1.1rem;
    box-shadow:0 12px 28px rgba(26,18,16,.09);
  }
  .bookings-page .booking-detail-greeting{ font-size:1rem; font-weight:700; margin-bottom:.2rem; }
  .bookings-page .booking-detail-intro{ color:var(--muted); font-size:.76rem; line-height:1.4; margin-bottom:.8rem; }
  .bookings-page .booking-detail-property{
    display:flex; align-items:stretch; gap:.8rem; padding:.65rem;
    border-radius:12px; background:var(--paper); margin-bottom:.9rem; min-width:0;
  }
  .bookings-page .booking-detail-photo{ width:116px; height:98px; flex:0 0 116px; overflow:hidden; border-radius:9px; background:#E4E1DA; }
  .bookings-page .booking-detail-photo img{ display:block; width:100%; height:100%; object-fit:cover; }
  .bookings-page .booking-detail-property-info{ display:flex; flex:1; flex-direction:column; min-width:0; }
  .bookings-page .booking-detail-property-title{ font-size:.96rem; line-height:1.25; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bookings-page .booking-detail-location{ display:flex; align-items:baseline; flex-wrap:wrap; gap:.1rem .3rem; color:var(--muted); font-size:.72rem; line-height:1.35; margin-top:.18rem; }
  .bookings-page .booking-detail-map{ color:var(--red); font-weight:600; white-space:nowrap; }
  .bookings-page .booking-detail-host{ display:flex; align-items:center; gap:.45rem; margin-top:auto; padding-top:.45rem; min-width:0; }
  .bookings-page .booking-detail-host-avatar{ width:27px; height:27px; flex:0 0 27px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; background:var(--ink); color:var(--white); font-size:.68rem; font-weight:700; }
  .bookings-page .booking-detail-host-avatar img{ width:100%; height:100%; object-fit:cover; }
  .bookings-page .booking-detail-host-label{ color:var(--muted); font-size:.65rem; line-height:1.1; }
  .bookings-page .booking-detail-host-name{ font-size:.76rem; font-weight:700; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bookings-page .booking-detail-section-title{ display:flex; align-items:center; gap:.45rem; font-size:.9rem; font-weight:700; margin-bottom:.35rem; }
  .bookings-page .booking-detail-section-title svg{ width:16px; height:16px; color:var(--green); flex:0 0 16px; }
  .bookings-page .booking-detail-rows{ display:grid; grid-template-columns:1fr 1fr; column-gap:1rem; margin-bottom:.7rem; }
  .bookings-page .booking-detail-row{ display:flex; align-items:center; justify-content:space-between; gap:.45rem; min-width:0; padding:.35rem 0; border-bottom:1px solid var(--line-soft); font-size:.74rem; }
  .bookings-page .booking-detail-row-label{ display:flex; align-items:center; gap:.35rem; min-width:0; color:var(--muted); }
  .bookings-page .booking-detail-row-label svg{ width:13px; height:13px; color:var(--green); flex:0 0 13px; }
  .bookings-page .booking-detail-row-value{ font-weight:600; text-align:right; white-space:nowrap; }
  .bookings-page .booking-detail-row.total{ grid-column:1 / -1; border-bottom:0; }
  .bookings-page .booking-detail-row.total .booking-detail-row-value{ color:var(--green); font-size:.9rem; font-weight:700; }
  .bookings-page .booking-detail-protection{ display:flex; align-items:flex-start; gap:.55rem; padding:.65rem .75rem; border-radius:11px; background:rgba(30,107,60,.07); margin:.6rem 0; }
  .bookings-page .booking-detail-protection svg{ width:17px; height:17px; flex:0 0 17px; color:var(--green); }
  .bookings-page .booking-detail-protection-title{ font-size:.75rem; font-weight:700; margin-bottom:.1rem; }
  .bookings-page .booking-detail-protection-text{ font-size:.69rem; color:var(--muted); line-height:1.35; }
  .bookings-page .booking-detail-actions{ display:flex; gap:.65rem; margin:.7rem 0; }
  .bookings-page .booking-detail-actions .bk-btn{ flex:1; padding:.62rem .75rem; font-size:.78rem; }
  .bookings-page .booking-detail-actions .bk-btn-outline{ border-color:var(--red); color:var(--red); }
  .bookings-page .booking-detail-pay{ display:inline-flex; align-items:center; justify-content:center; background:var(--green); color:#fff; border-radius:100px; font-size:.8rem; font-weight:700; }
  .bookings-page .booking-detail-pay:hover{ background:var(--green-deep); }
  .bookings-page .booking-detail-help{ display:flex; align-items:center; gap:.6rem; padding:.65rem .75rem; background:var(--paper); border-radius:11px; }
  .bookings-page .booking-detail-help-icon{ width:30px; height:30px; flex:0 0 30px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:var(--ink); color:var(--white); font-weight:700; }
  .bookings-page .booking-detail-help-text{ flex:1; min-width:0; }
  .bookings-page .booking-detail-help-title{ font-size:.76rem; font-weight:700; }
  .bookings-page .booking-detail-help-sub{ font-size:.67rem; line-height:1.35; color:var(--muted); }
  .bookings-page .booking-detail-help-btn{ flex:0 0 auto; padding:.45rem .65rem; border:1px solid var(--line); border-radius:100px; background:var(--white); font-size:.68rem; font-weight:700; white-space:nowrap; }
  .bookings-page .booking-detail-help-btn:hover{ border-color:var(--red); color:var(--red); }
  .bookings-page .booking-detail-status{ padding:1.4rem; border:1px solid var(--line); border-radius:16px; background:var(--white); }
  .bookings-page .booking-detail-status h2{ font-size:1rem; margin-bottom:.35rem; }
  .bookings-page .booking-detail-status p{ color:var(--muted); font-size:.8rem; line-height:1.45; }
  .bookings-page .desktop-pay-backdrop{ display:none; position:fixed; inset:0; z-index:450; align-items:center; justify-content:center; padding:1rem; background:rgba(21,15,13,.5); }
  .bookings-page .desktop-pay-backdrop.show{ display:flex; }
  .bookings-page .desktop-pay-dialog{ width:min(100%,440px); max-height:calc(100vh - 2rem); overflow:auto; padding:1.3rem; border:1px solid var(--line); border-radius:18px; background:var(--white); box-shadow:0 24px 60px rgba(26,18,16,.28); }
  .bookings-page .desktop-pay-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.8rem; }
  .bookings-page .desktop-pay-title{ font-size:1.05rem; font-weight:700; }
  .bookings-page .desktop-pay-close{ padding:.25rem; color:var(--muted); font-size:1.4rem; }
  .bookings-page .desktop-pay-summary{ color:var(--muted); font-size:.83rem; margin-bottom:1rem; }
  .bookings-page .desktop-pay-option{ display:flex; align-items:center; gap:.75rem; width:100%; margin-bottom:.6rem; padding:.75rem; border:1.5px solid var(--line); border-radius:12px; text-align:left; }
  .bookings-page .desktop-pay-option.selected{ border-color:var(--red); background:rgba(196,30,58,.05); }
  .bookings-page .desktop-pay-option-label{ font-size:.83rem; font-weight:700; }
  .bookings-page .desktop-pay-option-sub{ display:block; color:var(--muted); font-size:.7rem; font-weight:400; }
  .bookings-page .desktop-pay-continue{ width:100%; margin-top:.35rem; padding:.72rem; border-radius:100px; background:var(--green); color:#fff; font-weight:700; }
  .bookings-page .desktop-pay-cancel{ display:block; margin:.65rem auto 0; color:var(--muted); font-size:.8rem; font-weight:600; }
  .bookings-page .desktop-pay-processing, .bookings-page .desktop-pay-result{text-align:center;padding:1rem .3rem .2rem}
  .bookings-page .desktop-pay-spinner{width:42px;height:42px;margin:0 auto .9rem;border:3px solid rgba(196,30,58,.15);border-top-color:var(--red);border-radius:50%;animation:booking-payment-spin .8s linear infinite}
  .bookings-page .desktop-pay-processing h3, .bookings-page .desktop-pay-result h3{font-size:1rem;margin:.5rem 0}
  .bookings-page .desktop-pay-processing p, .bookings-page .desktop-pay-result p{font-size:.8rem;line-height:1.45;color:var(--muted);margin-bottom:1rem}
  @keyframes booking-payment-spin{to{transform:rotate(360deg)}}
  @media (prefers-reduced-motion:reduce){.bookings-page .desktop-pay-spinner{animation-duration:1.6s}}
  @media (min-width:861px) and (max-height:820px){
    .bookings-page .booking-approved-hero{ padding:.7rem 1rem .85rem; }
    .bookings-page .booking-approved-check{ width:36px; height:36px; margin-bottom:.4rem; }
    .bookings-page .booking-approved-check svg{ width:18px; height:18px; }
    .bookings-page .booking-detail-card{ padding:.75rem .9rem; }
    .bookings-page .booking-detail-intro{ margin-bottom:.55rem; }
    .bookings-page .booking-detail-property{ margin-bottom:.65rem; }
    .bookings-page .booking-detail-photo{ width:102px; height:84px; flex-basis:102px; }
    .bookings-page .booking-detail-rows{ margin-bottom:.45rem; }
    .bookings-page .booking-detail-protection{ margin:.4rem 0; padding:.5rem .65rem; }
    .bookings-page .booking-detail-actions{ margin:.5rem 0; }
    .bookings-page .booking-detail-help{ padding:.5rem .65rem; }
  }
  @media (max-width:1320px){
    .bookings-page .right-rail{ display:none; }
    .bookings-page .content-row{ grid-template-columns: minmax(0, 760px); }
    .bookings-page .feed-area{ margin:0 auto; min-width:0; border-right:none; }
  }
  @media (max-width:860px){
    .bookings-page{ height:auto; overflow:visible; }
    .bookings-page .app-shell{ grid-template-columns:1fr; height:auto; overflow:visible; }
    .bookings-page .main-col{ height:auto; overflow:visible; }
    .bookings-page .content-row{ flex:initial; min-height:0; overflow:visible; }
    .bookings-page .feed-area{ height:auto; overflow-y:visible; }
    .bookings-page .topbar{ padding:.8rem .9rem 0; min-height:46px; }
    .bookings-page .topbar-avatar-btn{ flex-shrink:0; display:flex; }
    .bookings-page .feed-area{ padding:.6rem .9rem 5.5rem; }
  }
  
  /* ---------- PAGE HEADER ---------- */
  
  .bookings-page .page-title{ font-family:var(--font-display); font-weight:600; font-size:clamp(1.7rem, 3vw, 2.1rem); }
  .bookings-page .page-subtitle{ font-size:.88rem; color:var(--muted); margin-top:.25rem; margin-bottom:1.4rem; }
  .bookings-page .tabs{ display:flex; gap:1.6rem; border-bottom:1px solid var(--line); margin-bottom:1.4rem; }
  .bookings-page .tab{
    padding:0 0 .8rem; font-size:.9rem; font-weight:600; color:var(--muted);
    border-bottom:2px solid transparent; margin-bottom:-1px;
  }
  .bookings-page .tab.active{ color:var(--red); border-bottom-color:var(--red); }
  .bookings-page .host-bookings-tabs{ display:flex; align-items:center; gap:2.8rem; }
  .bookings-page .host-bookings-tabs .tab{ display:inline-flex; align-items:center; gap:.38rem; }
  .bookings-page .tab-count{
    display:none; min-width:1.15rem; height:1.15rem; padding:0 .34rem;
    align-items:center; justify-content:center; border-radius:999px;
    background:#E8E8E8; color:#656565; font-size:.68rem; line-height:1;
    font-weight:700;
  }
  .bookings-page .tab-count.has-count{ display:inline-flex; }
  .bookings-page .host-bookings-tabs .tab.active .tab-count{ background:var(--nav-active-bg, #E9E7E2); color:var(--ink); }
  .bookings-page .state-msg{ color:var(--muted); font-size:.92rem; padding:2.2rem 0; text-align:center; }
  
  /* ---------- BOOKING CARD ---------- */
  
  .bookings-page .booking-card{
    display:flex; gap:1.1rem; background:var(--white); border:1px solid var(--line);
    border-radius:16px; padding:1rem; margin-bottom:1rem;
  }
  .bookings-page .bk-thumb{
    width:130px; height:130px; border-radius:12px; overflow:hidden; flex-shrink:0;
    background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%);
    display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,.85); font-size:.72rem; font-weight:600; text-align:center;
  }
  .bookings-page .bk-thumb img{ width:100%; height:100%; object-fit:cover; display:block; }
  .bookings-page .bk-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
  .bookings-page .bk-top-row{ display:flex; align-items:flex-start; gap:.6rem; }
  .bookings-page .bk-title{ font-weight:700; font-size:1rem; line-height:1.3; }
  .bookings-page .bk-loc{ font-size:.8rem; color:var(--muted); margin-top:.15rem; }
  .bookings-page .bk-status{ margin-left:auto; font-size:.68rem; font-weight:700; padding:.28rem .7rem; border-radius:100px; text-transform:uppercase; letter-spacing:.03em; white-space:nowrap; }
  .bookings-page .bk-status.approved{ background:#EAF4EE; color:#1E6B3C; }
  .bookings-page .bk-status.pending{ background:#FFF3CD; color:#8A6D00; }
  .bookings-page .bk-status.declined{ background:#FBE9E9; color:var(--red-deep); }
  .bookings-page .bk-status.expired{ background:rgba(128,110,100,.12); color:var(--muted); }
  .bookings-page .bk-meta{ display:flex; flex-wrap:wrap; gap:.3rem 1.1rem; font-size:.78rem; color:var(--muted); margin-top:.6rem; }
  .bookings-page .bk-meta b{ color:var(--ink); font-weight:600; }
  .bookings-page .bk-price{ font-size:.86rem; font-weight:700; color:var(--red-deep); margin-top:.45rem; }
  .bookings-page .bk-price span{ font-weight:500; color:var(--muted); font-size:.76rem; }
  .bookings-page .bk-bottom-row{ display:flex; align-items:center; gap:.6rem; margin-top:auto; padding-top:.8rem; }
  .bookings-page .bk-host{ display:flex; align-items:center; gap:.5rem; }
  .bookings-page .bk-host-avatar{
    width:26px; height:26px; border-radius:50%; overflow:hidden; background:var(--red-deep); color:#fff;
    display:flex; align-items:center; justify-content:center; font-size:.68rem; font-weight:700; flex-shrink:0;
  }
  .bookings-page .bk-host-avatar img{ width:100%; height:100%; object-fit:cover; }
  .bookings-page .bk-host-name{ font-size:.78rem; font-weight:600; }
  .bookings-page .bk-msg-link{ font-size:.78rem; font-weight:600; color:var(--red); }
  .bookings-page .bk-msg-link:hover{ text-decoration:underline; }
  .bookings-page .bk-actions{ margin-left:auto; display:flex; gap:.5rem; }
  .bookings-page .bk-btn{ padding:.5rem .9rem; border-radius:100px; font-weight:600; font-size:.78rem; white-space:nowrap; }
  .bookings-page .bk-btn-outline{ border:1.5px solid #E4E1DA; color:var(--ink); }
  .bookings-page .bk-btn-outline:hover{ border-color:var(--red); color:var(--red); }
  .bookings-page .bk-btn-solid{ background:var(--red); color:#fff; }
  .bookings-page .bk-btn-solid:hover{ background:var(--red-deep); }
  .bookings-page .bk-btn:disabled{ opacity:.5; cursor:not-allowed; }
  .bookings-page .host-booking-card{ min-height:128px; padding:.4rem; gap:.8rem; transition:border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  .bookings-page .host-booking-card:hover, .bookings-page .host-booking-card.selected{ border-color:var(--line); box-shadow:0 8px 22px rgba(36,33,30,.10); transform:translateY(-1px); }
  .bookings-page .host-booking-card .bk-thumb{ width:136px; height:118px; background:var(--paper); color:var(--muted); }
  .bookings-page .host-booking-card .bk-thumb-wrap{ position:relative; flex:0 0 136px; }
  .bookings-page .host-booking-card .bk-thumb-wrap .bk-thumb{ width:136px; }
  .bookings-page .host-booking-card .bk-thumb video{ width:100%; height:100%; object-fit:cover; display:block; background:#111; }
  .bookings-page .booking-video-badge{ position:absolute; left:.45rem; bottom:.45rem; display:inline-flex; align-items:center; gap:.25rem; padding:.2rem .38rem; border-radius:999px; background:rgba(0,0,0,.72); color:#fff; font-size:.62rem; font-weight:700; }
  .bookings-page .booking-video-badge svg{ width:11px; height:11px; }
  .bookings-page .host-booking-card .bk-title{ font-size:.9rem; }
  .bookings-page .host-booking-card .bk-meta{ flex-direction:column; align-items:flex-start; gap:.3rem; line-height:1.35; margin-top:.5rem; font-size:.72rem; }
  .bookings-page .host-booking-card .bk-meta span{ display:flex; align-items:center; gap:.38rem; }
  .bookings-page .host-booking-card .bk-price{ font-size:.9rem; margin-top:auto; white-space:nowrap; }
  .bookings-page .host-booking-card .bk-card-side{ min-width:145px; display:flex; flex-direction:column; justify-content:center; align-items:stretch; border-left:1px solid var(--line); padding:0 .7rem 0 .9rem; }
  .bookings-page .host-booking-card .bk-actions{ padding-top:.65rem; flex-direction:column; gap:.45rem; margin-left:0; }
  .bookings-page .host-booking-card .bk-actions .bk-btn{ width:100%; padding:.42rem .7rem; font-size:.7rem; }
  .bookings-page .host-booking-card .bk-btn-solid{ border:1.5px solid var(--red); }
  .bookings-page .host-booking-card .bk-btn-outline{ background:transparent; }
  .bookings-page .host-booking-card .bk-requested{ color:var(--muted); font-size:.68rem; margin-top:.3rem; }
  .bookings-page .booking-icon{ width:13px; height:13px; display:inline-flex; flex:0 0 13px; color:var(--muted); }
  .bookings-page .booking-icon svg{ width:100%; height:100%; }
  .bookings-page .host-booking-card .bk-guest{ display:flex; align-items:center; gap:.5rem; margin-top:.45rem; }
  .bookings-page .host-booking-card .bk-guest-avatar{ width:28px; height:28px; border-radius:50%; overflow:hidden; background:var(--paper); color:var(--muted); display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:700; flex-shrink:0; }
  .bookings-page .host-booking-card .bk-guest-avatar img{ width:100%; height:100%; object-fit:cover; }
  .bookings-page .host-month-nav{ display:flex; align-items:center; gap:.35rem; margin:0 0 1.2rem auto; width:max-content; }
  .bookings-page .host-month-label{ min-width:145px; text-align:center; font-weight:700; font-size:.86rem; }
  .bookings-page .host-month-btn{ width:30px; height:30px; border:1px solid var(--line); border-radius:50%; color:var(--ink); font-size:1.1rem; }
  .bookings-page .host-month-btn:hover{ border-color:var(--red); color:var(--red); }
  .bookings-page .host-month-current{ color:var(--muted); font-size:.74rem; margin-left:.35rem; }
  .bookings-page #host-bookings-view{ padding-top:1.15rem; }
  .bookings-page #host-bookings-view .page-title{ font-size:clamp(2rem, 3.4vw, 2.65rem); letter-spacing:-.035em; }
  .bookings-page #host-bookings-view .page-subtitle{ margin-top:.45rem; }
  .bookings-page #host-bookings-view .tabs{ margin-top:2rem; }
  .bookings-page .host-header-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:2rem; }
  .bookings-page .host-header-row .page-subtitle{ margin-bottom:0; }
  .bookings-page .host-detail .host-detail-image{ display:block; }
  .bookings-page .host-detail{ display:none; border:0; border-radius:0; background:transparent; box-shadow:none; padding:0; }
  .bookings-page .host-detail.show{ display:block; }
  .bookings-page .host-detail-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:1rem; }
  .bookings-page .host-detail-close{ color:var(--muted); font-size:1.4rem; line-height:1; padding:.15rem .3rem; }
  .bookings-page .host-detail-image{ width:100%; height:190px; object-fit:cover; border-radius:12px; background:var(--paper); margin-bottom:1rem; }
  .bookings-page .host-detail-video{ width:100%; height:190px; object-fit:cover; border-radius:12px; background:var(--paper); margin-bottom:1rem; }
  .bookings-page .host-detail h2{ font-size:1.15rem; line-height:1.3; }
  .bookings-page .host-detail p{ color:var(--muted); font-size:.82rem; line-height:1.5; margin-top:.2rem; }
  .bookings-page .host-detail-grid{ display:grid; grid-template-columns:1fr 1fr; gap:.8rem; margin:1.1rem 0; }
  .bookings-page .host-detail-stay{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:1rem 0; margin:1.1rem 0; }
  .bookings-page .host-detail-item{ border-top:1px solid var(--line); padding-top:.65rem; }
  .bookings-page .host-detail-stay .host-detail-item{ border-top:0; padding-top:0; }
  .bookings-page .host-detail-label-row{ display:flex; align-items:center; gap:.35rem; color:var(--muted); font-size:.68rem; }
  .bookings-page .host-detail-label-row .booking-icon{ width:14px; height:14px; }
  .bookings-page .host-detail-label{ color:var(--muted); font-size:.68rem; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .bookings-page .host-detail-value{ font-size:.86rem; font-weight:600; margin-top:.2rem; }
  .bookings-page .host-detail-actions{ display:flex; gap:.6rem; margin-top:1.2rem; }
  .bookings-page .host-detail-actions .bk-btn{ flex:1; }
  .bookings-page .right-rail.host-empty{ display:block; }
  .bookings-page .right-rail.host-empty{ border-left:0; padding-left:2rem; }
  .bookings-page .content-row.host-layout .feed-area{ border-right:0; }
  .bookings-page .bk-note{ font-size:.76rem; color:var(--red); margin-top:.4rem; }
  .bookings-page .reviewed-badge{ color:var(--green-deep, #1E6B3C); font-size:.78rem; font-weight:700; }
  .bookings-page .review-modal-backdrop{
    display:none; position:fixed; inset:0; z-index:400; align-items:center; justify-content:center;
    padding:1rem; background:rgba(26,18,16,.55);
  }
  .bookings-page .review-modal-backdrop.show{ display:flex; }
  .bookings-page .review-modal{
    width:min(100%, 480px); max-height:calc(100vh - 2rem); overflow:auto;
    background:var(--white); border:1px solid var(--line); border-radius:18px; padding:1.4rem;
    box-shadow:0 24px 60px rgba(26,18,16,.28);
  }
  .bookings-page .review-modal-head{ display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .bookings-page .review-modal-title{ font-size:1.1rem; font-weight:700; }
  .bookings-page .review-modal-close{ color:var(--muted); font-size:1.4rem; line-height:1; padding:.25rem; }
  .bookings-page .review-modal-subtitle{ color:var(--muted); font-size:.84rem; line-height:1.5; margin:.35rem 0 1.1rem; }
  .bookings-page .review-stars{ display:flex; gap:.35rem; margin-bottom:1rem; }
  .bookings-page .review-star{
    min-width:2.6rem; min-height:2.6rem; padding:.35rem; border-radius:10px;
    color:var(--muted); font-size:1.7rem; line-height:1;
  }
  .bookings-page .review-star.selected, .bookings-page .review-star:hover{ color:var(--red); }
  .bookings-page .review-label{ display:block; font-size:.78rem; font-weight:700; margin-bottom:.4rem; }
  .bookings-page .review-textarea{
    width:100%; min-height:130px; resize:vertical; padding:.8rem; border:1px solid var(--line);
    border-radius:10px; background:var(--paper); color:var(--ink); font:inherit; line-height:1.5;
  }
  .bookings-page .review-textarea:focus{ outline:2px solid var(--red); outline-offset:1px; }
  .bookings-page .review-error{ min-height:1.2rem; color:var(--red); font-size:.78rem; margin-top:.55rem; }
  .bookings-page .review-success{ color:var(--green-deep, #1E6B3C); font-size:.88rem; font-weight:600; margin-top:.7rem; }
  .bookings-page .review-submit{ width:100%; margin-top:.7rem; }
  @media (max-width:520px){
    .bookings-page .booking-card{ flex-direction:column; }
    .bookings-page .bk-thumb{ width:100%; height:150px; }
    .bookings-page .bk-bottom-row{ flex-wrap:wrap; }
    .bookings-page .bk-actions{ margin-left:0; width:100%; }
    .bookings-page .bk-btn{ flex:1; text-align:center; }
    .bookings-page .host-booking-card .bk-thumb{ width:100%; height:150px; }
    .bookings-page .host-booking-card .bk-thumb-wrap{ flex-basis:auto; width:100%; }
    .bookings-page .host-booking-card .bk-thumb-wrap .bk-thumb{ width:100%; height:150px; }
    .bookings-page .host-booking-card .bk-actions{ align-self:stretch; }
    .bookings-page .host-booking-card .bk-card-side{ border-left:0; border-top:1px solid var(--line); padding:.7rem 0 0; }
    .bookings-page #host-bookings-view{ padding-top:.4rem; }
    .bookings-page #host-bookings-view .tabs{ margin-top:1.35rem; }
    .bookings-page .host-bookings-tabs{ gap:1.35rem; overflow-x:auto; }
    .bookings-page .host-header-row{ display:block; }
    .bookings-page .host-month-nav{ margin:1rem 0 1.2rem; width:100%; justify-content:flex-start; }
  }
  @media (max-width:520px){
    body.review-modal-open{ overflow:hidden; }
    .bookings-page .topbar{
      min-height:56px; padding:.65rem 1rem; gap:.7rem; flex-wrap:nowrap;
      background:#111; color:#fff;
    }
    .bookings-page .topbar-avatar-btn{ width:30px; height:30px; padding:0; }
    .bookings-page .topbar-avatar-btn .avatar-circle{
      width:30px; height:30px; background:transparent; color:#fff;
    }
    .bookings-page .mobile-page-title{
      display:block; min-width:0; font-size:1.05rem; font-weight:700;
      letter-spacing:-.01em; white-space:nowrap;
    }
    .bookings-page .back-link{ display:none; }
    .bookings-page #client-bookings-view{ padding-top:.25rem; }
    .bookings-page #client-bookings-view > .page-title{ display:none; }
    .bookings-page #client-bookings-view > .page-subtitle{
      display:block; margin:.1rem 0 .8rem; font-size:.72rem; line-height:1.4;
    }
    .bookings-page #client-bookings-view .tabs{
      width:100%; gap:0; justify-content:space-between; margin:0 0 1rem;
    }
    .bookings-page #client-bookings-view .tab{
      flex:1 1 0; min-width:0; padding:.25rem .15rem .7rem;
      font-size:.78rem; text-align:center; white-space:nowrap;
      color:var(--muted);
    }
    .bookings-page #client-bookings-view .tab.active{ color:var(--ink); font-weight:700; }
    .bookings-page #client-bookings-view .booking-card{
      display:block; width:100%; padding:.75rem; margin-bottom:.85rem;
      border-radius:14px; overflow:visible;
    }
    .bookings-page #client-bookings-view .bk-thumb{
      width:100%; height:auto; aspect-ratio:16 / 9; border-radius:10px;
      font-size:.82rem;
    }
    .bookings-page #client-bookings-view .bk-main{ width:100%; padding-top:.9rem; }
    .bookings-page #client-bookings-view .bk-top-row{ gap:.5rem; }
    .bookings-page #client-bookings-view .bk-top-row > div{ min-width:0; flex:1; }
    .bookings-page #client-bookings-view .bk-title{
      font-size:1.02rem; line-height:1.3; overflow-wrap:anywhere;
    }
    .bookings-page #client-bookings-view .bk-loc{
      font-size:.84rem; line-height:1.35; overflow-wrap:anywhere;
    }
    .bookings-page #client-bookings-view .bk-status{
      flex:0 0 auto; max-width:42%; padding:.3rem .55rem; font-size:.64rem;
      white-space:normal; text-align:center;
    }
    .bookings-page #client-bookings-view .bk-meta{
      display:block; margin-top:.8rem; font-size:.86rem; line-height:1.45;
    }
    .bookings-page #client-bookings-view .bk-meta span{ display:block; overflow-wrap:anywhere; }
    .bookings-page #client-bookings-view .bk-price{ margin-top:.45rem; font-size:1rem; }
    .bookings-page #client-bookings-view .bk-price span{ font-size:.8rem; }
    .bookings-page #client-bookings-view .bk-bottom-row{
      display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center;
      gap:.7rem .8rem; margin-top:.95rem; padding-top:.85rem;
      border-top:1px solid var(--line-soft);
    }
    .bookings-page #client-bookings-view .bk-host{ min-width:0; }
    .bookings-page #client-bookings-view .bk-host-name{
      min-width:0; font-size:.86rem; overflow-wrap:anywhere;
    }
    .bookings-page #client-bookings-view .bk-host-avatar{ width:32px; height:32px; font-size:.76rem; }
    .bookings-page #client-bookings-view .bk-msg-link{
      width:34px; height:34px; min-height:34px; padding:0; display:inline-flex;
      align-items:center; justify-content:center; color:var(--red); flex-shrink:0;
    }
    .bookings-page #client-bookings-view .bk-msg-link svg{
      width:18px; height:18px; display:block;
    }
    .bookings-page #client-bookings-view .bk-actions{
      grid-column:1 / -1; width:100%; min-width:0; margin:0;
      display:flex; justify-content:flex-end; align-items:center;
      flex-wrap:wrap; gap:.55rem;
    }
    .bookings-page #client-bookings-view .bk-actions .bk-btn{
      flex:1 1 130px; min-width:0; min-height:40px; padding:.58rem .7rem;
      font-size:.8rem; text-align:center; white-space:normal;
    }
    .bookings-page #client-bookings-view .reviewed-badge{
      flex:1 1 130px; min-height:40px; display:flex; align-items:center;
      justify-content:center; font-size:.82rem;
    }
    .bookings-page #client-bookings-view .bk-note{ font-size:.8rem; line-height:1.4; }
    .bookings-page .review-modal-backdrop{
      align-items:flex-end; padding:.75rem; padding-bottom:max(.75rem, env(safe-area-inset-bottom));
    }
    .bookings-page .review-modal{
      width:100%; max-height:calc(100dvh - 1.5rem); border-radius:18px;
      padding:1.25rem 1rem 1rem;
    }
    .bookings-page .review-modal-title{ font-size:1.2rem; }
    .bookings-page .review-modal-subtitle{ font-size:.88rem; margin:.45rem 0 1rem; }
    .bookings-page .review-stars{ justify-content:center; gap:.45rem; margin:.1rem 0 1rem; }
    .bookings-page .review-star{ min-width:2.8rem; min-height:2.8rem; font-size:1.8rem; }
    .bookings-page .review-label{ font-size:.84rem; margin-bottom:.45rem; }
    .bookings-page .review-textarea{ min-height:150px; padding:.85rem; font-size:.95rem; }
    .bookings-page .review-submit{ min-height:44px; margin-top:.45rem; font-size:.86rem; }
  }
  @media (max-width:860px){
    .bookings-page .right-rail.host-empty{ display:none; }
    .bookings-page .right-rail.host-empty:has(.host-detail.show){ display:block; position:fixed; inset:0; z-index:180; max-width:none; padding:1rem; background:var(--paper); border:0; }
    .bookings-page .right-rail.host-empty:has(.host-detail.show) .host-detail{ max-height:100%; overflow:auto; }
  }
  
  /* ---------- RIGHT RAIL: stats + calendar ---------- */
  
  .bookings-page .rail-card{ background:var(--white); border:1px solid var(--line); border-radius:18px; padding:1.3rem; }
  .bookings-page .rail-card h2{ font-family:var(--font-display); font-weight:600; font-size:1.02rem; margin-bottom:1rem; }
  .bookings-page .stat-row{ display:flex; flex-direction:column; gap:.9rem; }
  .bookings-page .stat-item{ padding-bottom:.9rem; border-bottom:1px solid var(--line-soft); }
  .bookings-page .stat-item:last-child{ border-bottom:none; padding-bottom:0; }
  .bookings-page .stat-label{ font-size:.68rem; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); margin-bottom:.2rem; }
  .bookings-page .stat-value{ font-family:var(--font-display); font-weight:700; font-size:1.4rem; color:var(--red-deep); }
  .bookings-page .cal-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.8rem; }
  .bookings-page .cal-month{ font-weight:700; font-size:.85rem; }
  .bookings-page .cal-active-tag{ font-size:.68rem; font-weight:700; color:var(--red); }
  .bookings-page .cal-grid{ display:grid; grid-template-columns:repeat(7, 1fr); gap:.3rem; text-align:center; }
  .bookings-page .cal-dow{ font-size:.64rem; font-weight:700; color:var(--muted); padding-bottom:.3rem; }
  .bookings-page .cal-day{ font-size:.74rem; padding:.4rem 0; border-radius:8px; color:var(--ink); }
  .bookings-page .cal-day.muted{ color:var(--muted); opacity:.4; }
  .bookings-page .cal-day.booked{ background:var(--red); color:#fff; font-weight:700; }
  .bookings-page .booking-skeleton{
    pointer-events:none;
    background:var(--white);
  }
  .bookings-page .booking-skeleton .skeleton-block{
    position:relative; overflow:hidden; background:rgba(128,110,100,.12);
    border-radius:6px;
  }
  .bookings-page .booking-skeleton .skeleton-block::after{
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent);
    animation:skeleton-booking-shimmer 1.8s infinite;
  }
  .bookings-page .booking-skeleton .bk-thumb.skeleton-block{ border-radius:12px; }
  .bookings-page .booking-skeleton .bk-title.skeleton-block{ width:62%; height:1.05rem; }
  .bookings-page .booking-skeleton .bk-loc.skeleton-block{ width:48%; height:.85rem; margin-top:.35rem; }
  .bookings-page .booking-skeleton .bk-status.skeleton-block{ width:4.7rem; height:1.35rem; }
  .bookings-page .booking-skeleton .bk-meta .skeleton-block{ width:58%; height:.85rem; }
  .bookings-page .booking-skeleton .bk-price .skeleton-block{ width:6.5rem; height:1rem; }
  .bookings-page .booking-skeleton .bk-host-avatar.skeleton-block{ width:32px; height:32px; border-radius:50%; }
  .bookings-page .booking-skeleton .bk-host-name.skeleton-block{ width:5.5rem; height:.85rem; }
  .bookings-page .booking-skeleton .bk-msg-link.skeleton-block{ width:34px; height:34px; border-radius:50%; }
  .bookings-page .booking-skeleton .bk-actions .skeleton-block{ width:7rem; height:2.5rem; border-radius:100px; }
  .bookings-page .host-bookings-auth-skeleton{ padding-top:1.15rem; }
  .bookings-page .host-bookings-auth-skeleton .skeleton-block{
    position:relative; overflow:hidden; background:rgba(128,110,100,.12);
    border-radius:6px;
  }
  .bookings-page .host-bookings-auth-skeleton .skeleton-block::after{
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
    animation:skeleton-booking-shimmer 1.8s infinite;
  }
  .bookings-page .host-bookings-auth-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:2rem; }
  .bookings-page .host-bookings-auth-title{ width:10rem; height:2.3rem; }
  .bookings-page .host-bookings-auth-subtitle{ width:19rem; max-width:100%; height:.9rem; margin-top:.55rem; }
  .bookings-page .host-bookings-auth-month{ width:10rem; height:1.8rem; margin-top:.2rem; }
  .bookings-page .host-bookings-auth-tabs{ display:flex; gap:2.8rem; border-bottom:1px solid var(--line); margin:2rem 0 1.4rem; }
  .bookings-page .host-bookings-auth-tab{ width:4.5rem; height:1rem; margin-bottom:.8rem; }
  .bookings-page .host-booking-skeleton .skeleton-block{
    position:relative; overflow:hidden; background:rgba(128,110,100,.12);
    border-radius:6px;
  }
  .bookings-page .host-booking-skeleton .skeleton-block::after{
    content:''; position:absolute; inset:0;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.2), transparent);
    animation:skeleton-booking-shimmer 1.8s infinite;
  }
  .bookings-page .host-booking-skeleton .bk-thumb.skeleton-block{
    border-radius:12px; background:rgba(128,110,100,.12);
  }
  .bookings-page .host-booking-skeleton .bk-title.skeleton-block{ width:58%; height:.95rem; }
  .bookings-page .host-booking-skeleton .bk-guest-avatar.skeleton-block{ width:28px; height:28px; border-radius:50%; }
  .bookings-page .host-booking-skeleton .bk-guest-name.skeleton-block{ width:6.5rem; height:.8rem; }
  .bookings-page .host-booking-skeleton .bk-meta .skeleton-block{ width:12rem; max-width:100%; height:.75rem; }
  .bookings-page .host-booking-skeleton .bk-meta span:nth-child(2) .skeleton-block{ width:5.5rem; }
  .bookings-page .host-booking-skeleton .bk-meta span:nth-child(3) .skeleton-block{ width:8rem; }
  .bookings-page .host-booking-skeleton .bk-price.skeleton-block{ width:6rem; height:1rem; }
  .bookings-page .host-booking-skeleton .bk-requested.skeleton-block{ width:7rem; height:.7rem; margin-top:.35rem; }
  .bookings-page .host-booking-skeleton .bk-actions .skeleton-block{ width:100%; height:1.9rem; border-radius:100px; }
  .bookings-page .host-booking-results-enter{ opacity:0; transition:opacity .22s ease; }
  @media (prefers-reduced-motion:reduce){
    .bookings-page .host-booking-skeleton .skeleton-block::after{ animation:none; }
    .bookings-page .host-bookings-auth-skeleton .skeleton-block::after{ animation:none; }
    .bookings-page .host-booking-results-enter{ transition:none; }
  }
  @media (max-width:640px){
    .bookings-page .host-bookings-auth-head{ display:block; }
    .bookings-page .host-bookings-auth-month{ display:none; }
    .bookings-page .host-bookings-auth-tabs{ gap:1.2rem; }
    .bookings-page .host-booking-skeleton .bk-meta .skeleton-block{ width:75%; }
    .bookings-page .host-booking-skeleton .bk-meta span:nth-child(2) .skeleton-block{ width:40%; }
    .bookings-page .host-booking-skeleton .bk-meta span:nth-child(3) .skeleton-block{ width:60%; }
  }
  @keyframes skeleton-booking-shimmer{
    from{ transform:translateX(-100%); }
    to{ transform:translateX(100%); }
  }
  .bookings-page .booking-load-status{ min-height:1.5rem; color:var(--muted); font-size:.8rem; text-align:center; padding:.25rem 0 1rem; }
  @media (prefers-reduced-motion:reduce){
    .bookings-page .booking-skeleton .skeleton-block::after{ animation:none; }
  }
  @media (max-width:520px){
    .bookings-page .booking-skeleton .bk-thumb.skeleton-block{ width:100%; height:auto; aspect-ratio:16 / 9; }
    .bookings-page .booking-skeleton .bk-main{ padding-top:.9rem; }
    .bookings-page .booking-skeleton .bk-top-row > div{ width:100%; }
    .bookings-page .booking-skeleton .bk-title.skeleton-block{ width:62%; }
    .bookings-page .booking-skeleton .bk-loc.skeleton-block{ width:48%; }
    .bookings-page .booking-skeleton .bk-meta .skeleton-block{ width:64%; }
    .bookings-page .booking-skeleton .bk-bottom-row{ min-height:74px; }
  }

  /* ---- dark-theme overrides (second legacy style block) ---- */

  html[data-theme="dark"] .bookings-page #host-bookings-view .tab, html[data-theme="dark"] .bookings-page #host-bookings-view .tab.active{
    background: transparent !important;
    border: 0 !important;
    border-bottom: 2px solid transparent !important;
    color: var(--muted) !important;
  }
  html[data-theme="dark"] .bookings-page #host-bookings-view .tab.active{
    border-bottom-color: var(--red) !important;
    color: #fff !important;
  }
  html[data-theme="dark"] .bookings-page #host-bookings-view .host-booking-card{
    background: #0d0d0d !important;
    border: 1px solid var(--line) !important;
    border-radius: 16px !important;
  }
  html[data-theme="dark"] .bookings-page #host-bookings-view .host-booking-card:hover, html[data-theme="dark"] .bookings-page #host-bookings-view .host-booking-card.selected{
    border-color: rgba(255, 255, 255, .28) !important;
  }
  html[data-theme="dark"] .bookings-page #host-bookings-view .host-booking-card .bk-thumb, html[data-theme="dark"] .bookings-page #host-bookings-view .host-booking-card .bk-guest-avatar{
    background: #1a1a1a;
  }
  html[data-theme="dark"] .bookings-page #host-booking-detail{ background:transparent !important; border:0 !important; }
  html[data-theme="dark"] .bookings-page #client-bookings-view .tab, html[data-theme="dark"] .bookings-page #client-bookings-view .tab.active{
    background:transparent !important;
    border:0 !important;
    border-bottom:2px solid transparent !important;
    color:var(--muted) !important;
  }
  html[data-theme="dark"] .bookings-page #client-bookings-view .tab.active{
    border-bottom-color:var(--red) !important;
    color:#fff !important;
  }
  html[data-theme="dark"] .bookings-page #client-bookings-view .booking-card{
    background:#000 !important;
    border-color:var(--line) !important;
    color:var(--ink) !important;
  }

  /* Dark theme rules that lived in public/js/varoom-dark-theme.css. */
  html[data-theme="dark"] .bookings-page .booking-card{ background:transparent !important; border-color:var(--line) !important; }
  html[data-theme="dark"] .bookings-page .rail-card{
    background:transparent !important; border-width:0 0 1px !important; border-color:var(--line-soft) !important;
    border-radius:0 !important; box-shadow:none !important;
  }

  /* ---- Native additions ---- */

  /* Every laptop (861–1320px) keeps the right rail beside the list instead of
     hiding it, so booking details open there, not on a separate page. */
  @media (min-width:861px) and (max-width:1320px){
    .bookings-page .content-row{ grid-template-columns:minmax(0, 1fr) clamp(320px, 36vw, 460px); }
    .bookings-page .right-rail{ display:flex; padding:.6rem .85rem 1rem; }
    .bookings-page .feed-area{ min-width:0; max-width:none; padding:.6rem 1.25rem 4rem; }
    .bookings-page .right-rail.host-empty{ padding-left:1rem; border-left:1px solid var(--line); }
  }
  /* A narrow list column stacks the host cards and lets the tabs scroll. */
  @container bookings-feed (max-width:620px){
    .bookings-page .host-booking-card{ flex-direction:column; }
    .bookings-page .host-booking-card .bk-thumb, .bookings-page .host-booking-card .bk-thumb-wrap .bk-thumb{ width:100%; height:150px; }
    .bookings-page .host-booking-card .bk-thumb-wrap{ flex-basis:auto; width:100%; }
    .bookings-page .host-booking-card .bk-actions{ align-self:stretch; }
    .bookings-page .host-booking-card .bk-card-side{ border-left:0; border-top:1px solid var(--line); padding:.7rem 0 0; }
    .bookings-page .host-bookings-tabs{ gap:1.35rem; overflow-x:auto; scrollbar-width:none; }
    .bookings-page .host-header-row{ display:block; }
    .bookings-page .host-month-nav{ margin:1rem 0 1.2rem; width:100%; justify-content:flex-start; }
    .bookings-page .host-month-current{ white-space:nowrap; }
    .bookings-page .host-bookings-auth-head{ display:block; }
  }
  .bookings-page .feed-area{ container:bookings-feed / inline-size; }
  /* The message-host icon had a size only on phones (0px wide elsewhere). */
  .bookings-page .bk-msg-link{ width:34px; height:34px; min-height:34px; padding:0; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
  .bookings-page .bk-msg-link svg{ width:18px; height:18px; display:block; }
  .bookings-page .booking-detail-content{ container:booking-detail / inline-size; }

  /* A narrow list column keeps the legacy row card (thumbnail beside the
     details): the thumbnail shrinks and the buttons wrap under the host.
     Only phones (the max-width:520px rules above) stack the card. */
  @media (min-width:521px){
    @container bookings-feed (max-width:520px){
      .bookings-page #client-bookings-view .booking-card{ gap:.8rem; padding:.8rem; }
      .bookings-page #client-bookings-view .bk-thumb, .bookings-page .booking-skeleton .bk-thumb.skeleton-block{ width:96px; height:96px; }
      .bookings-page #client-bookings-view .bk-top-row > div{ min-width:0; flex:1; }
      .bookings-page #client-bookings-view .bk-title, .bookings-page #client-bookings-view .bk-loc{ overflow-wrap:anywhere; }
      .bookings-page #client-bookings-view .bk-status{ flex:0 0 auto; max-width:45%; white-space:normal; text-align:center; }
      .bookings-page #client-bookings-view .bk-bottom-row{ flex-wrap:wrap; }
      .bookings-page #client-bookings-view .bk-actions{ margin-left:0; width:100%; flex-wrap:wrap; }
      .bookings-page #client-bookings-view .bk-actions .bk-btn, .bookings-page #client-bookings-view .reviewed-badge{ flex:1 1 120px; text-align:center; }
      .bookings-page #client-bookings-view .reviewed-badge{ display:flex; align-items:center; justify-content:center; }
    }
  }

  /* A narrow detail (small laptop rail, phones) stacks the property and rows. */
  @container booking-detail (max-width:400px){
    .bookings-page .booking-detail-property{ flex-direction:column; }
    .bookings-page .booking-detail-photo{ width:100%; height:150px; flex-basis:auto; }
    .bookings-page .booking-detail-rows{ grid-template-columns:1fr; }
    .bookings-page .booking-detail-actions{ flex-wrap:wrap; }
    .bookings-page .booking-detail-help{ flex-wrap:wrap; }
  }

  /* Review of a completed stay, inside the detail (from booking-approved.html). */
  .bookings-page .review-section{ margin:.8rem 0; padding:.9rem; border:1px solid rgba(196,30,58,.2); border-radius:12px; background:rgba(196,30,58,.04); }
  .bookings-page .review-section h3{ font-size:.9rem; margin-bottom:.3rem; }
  .bookings-page .review-section p{ color:var(--muted); font-size:.74rem; line-height:1.45; }
  .bookings-page .detail-review-stars{ display:flex; gap:.25rem; margin:.6rem 0; }
  .bookings-page .detail-review-star{ min-width:2.2rem; min-height:2.2rem; color:var(--muted); font-size:1.5rem; padding:.25rem; }
  .bookings-page .detail-review-star.selected{ color:var(--red); }
  .bookings-page .detail-review-star:disabled{ cursor:default; }
  .bookings-page .detail-review-text{ width:100%; min-height:90px; resize:vertical; margin:.2rem 0 .5rem; padding:.7rem; border:1px solid var(--line); border-radius:9px; background:var(--white); color:var(--ink); font:inherit; font-size:.8rem; }
  .bookings-page .detail-review-error{ min-height:1.1rem; color:var(--red); font-size:.74rem; }
  .bookings-page .detail-reviewed{ color:var(--green); font-size:.82rem; font-weight:700; margin-top:.4rem; }
  .bookings-page .detail-review-submit{ width:100%; }

  /* Phones: the payment dialog is a bottom sheet (as on booking-approved.html). */
  @media (max-width:639px){
    .bookings-page .desktop-pay-backdrop{ align-items:flex-end; padding:0; }
    .bookings-page .desktop-pay-dialog{ width:100%; max-width:480px; border-radius:20px 20px 0 0; max-height:88vh; padding:1.4rem 1.3rem calc(1.6rem + env(safe-area-inset-bottom)); }
  }

  /* ---------- Booking details page (phones; /booking-approved) ---------- */
  .bookings-page.booking-approved-page{ height:auto; min-height:100vh; overflow:visible; }
  .booking-approved-page .ba-header{ display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.4rem; }
  .booking-approved-page .ba-logo{ font-family:var(--font-brand); font-weight:900; font-size:1.55rem; display:flex; align-items:baseline; }
  .booking-approved-page .ba-logo .va{ color:var(--red); }
  .booking-approved-page .ba-back{ font-size:.9rem; font-weight:500; color:var(--muted); }
  .booking-approved-page .ba-back:hover{ color:var(--red); }
  .booking-approved-page .ba-main{ max-width:560px; margin:0 auto; padding:0 1rem 6rem; }
  .booking-approved-page .ba-checking{ text-align:center; padding:5rem 0; color:var(--muted); }
  .booking-approved-page .booking-detail-panel{ display:block; }
  .booking-approved-page .ba-state-actions{ margin-top:1rem; }
`;
