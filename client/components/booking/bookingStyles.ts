// Styles for /booking, ported unchanged from legacy-pages/booking.html (this
// style exists only while the page is mounted). The legacy header and
// breadcrumb rules stay harmless: that markup was hidden at every width and
// is not rendered.

export const BOOKING_STYLES = `
  :root{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f; --line:#E4E1DA; --line-strong:#E4E1DA;
    --green:#2E9B54; --green-deep:#1E6B3A; --green-tint:rgba(46,155,84,.14); --green-tint-strong:rgba(46,155,84,.24);
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    --skel-base:rgba(128,110,100,.12); --skel-shine:rgba(128,110,100,.22);
  }
  [data-theme="dark"]{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b; --nav-active-bg:rgba(255,255,255,.14);
    --line:rgba(255,255,255,.16); --line-strong:rgba(255,255,255,.3);
    --green-tint:rgba(46,155,84,.18); --green-tint-strong:rgba(46,155,84,.3);
    --skel-base:rgba(255,255,255,.06); --skel-shine:rgba(255,255,255,.13);
  }
  *{ margin:0; padding:0; box-sizing:border-box; }
  html{ height:100%; }
  body{ font-family:var(--font-body); background:var(--paper); color:var(--ink); height:100%; overflow:hidden; transition:background .2s ease, color .2s ease; }
  a{ color:inherit; text-decoration:none; }
  button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }
  svg{ flex-shrink:0; }

  .page-shell{ display:flex; flex-direction:column; height:100vh; overflow:hidden; }

  /* ---------- Top nav ---------- */
  header{
    display:flex; align-items:center; gap:1.5rem; padding:.7rem 2rem;
    border-bottom:1px solid var(--line); flex-wrap:wrap; flex-shrink:0;
  }
  .logo{ font-family:var(--font-brand); font-weight:700; font-size:1.4rem; letter-spacing:-.01em; flex-shrink:0; }
  .logo .va{ color:var(--red); }
  .logo .room{ color:var(--ink); }

  .search-wrap{ position:relative; flex:1; min-width:200px; max-width:420px; }
  .search-input{
    width:100%; font-family:inherit; font-size:.85rem; padding:.5rem 1rem .5rem 2.3rem;
    border:1px solid var(--line-strong); border-radius:100px; background:var(--paper); color:var(--ink);
  }
  .search-input:focus{ outline:none; border-color:var(--red); }
  .search-icon{ position:absolute; left:.85rem; top:50%; transform:translateY(-50%); color:var(--muted); pointer-events:none; }
  .search-results{
    display:none; position:absolute; top:calc(100% + .5rem); left:0; right:0; z-index:40;
    background:var(--white); border:1px solid var(--line-strong); border-radius:14px; overflow:hidden;
    box-shadow:0 12px 30px rgba(0,0,0,.28);
  }
  .search-results.show{ display:block; }
  .search-result-item{ display:block; padding:.7rem 1rem; font-size:.85rem; border-bottom:1px solid var(--line); }
  .search-result-item:last-child{ border-bottom:none; }
  .search-result-item:hover{ background:var(--paper); }
  .search-result-item .r-title{ font-weight:700; }
  .search-result-item .r-loc{ color:var(--muted); font-size:.78rem; }
  .search-empty{ padding:.9rem 1rem; font-size:.83rem; color:var(--muted); }

  .nav-links{ display:none; gap:1.5rem; font-size:.86rem; font-weight:600; color:var(--muted); }
  .nav-links a:hover{ color:var(--red); }

  .nav-icons{ display:flex; align-items:center; gap:1.1rem; margin-left:auto; }
  .icon-btn{ display:flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:50%; color:var(--muted); }
  .icon-btn:hover{ color:var(--red); background:var(--green-tint); }

  .avatar-wrap{ position:relative; }
  .avatar-btn{ display:flex; align-items:center; gap:.5rem; padding:.25rem .6rem .25rem .25rem; border-radius:100px; border:1px solid var(--line-strong); }
  .avatar-btn:hover{ border-color:var(--red); }
  .avatar-circle{ width:26px; height:26px; border-radius:50%; background:var(--red); color:#fff; display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:700; overflow:hidden; }
  .avatar-circle img{ width:100%; height:100%; object-fit:cover; }
  .avatar-name{ font-size:.82rem; font-weight:600; }
  .avatar-menu{
    display:none; position:absolute; right:0; top:calc(100% + .5rem); min-width:190px; z-index:40;
    background:var(--white); border:1px solid var(--line-strong); border-radius:14px; overflow:hidden;
    box-shadow:0 12px 30px rgba(0,0,0,.28); padding:.4rem;
  }
  .avatar-menu.show{ display:block; }
  .avatar-menu a, .avatar-menu button{ display:flex; align-items:center; gap:.6rem; width:100%; text-align:left; padding:.6rem .7rem; border-radius:8px; font-size:.85rem; font-weight:600; }
  .avatar-menu a:hover, .avatar-menu button:hover{ background:var(--paper); color:var(--red); }

  @media (min-width:960px){ .nav-links{ display:flex; } }

  /* ---------- Breadcrumb ---------- */
  .breadcrumb{ font-size:.78rem; color:var(--muted); padding:.5rem 2rem; width:100%; flex-shrink:0; display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; }
  @media (min-width:960px){ .breadcrumb{ padding:.5rem 3rem; } }
  .breadcrumb a:hover{ color:var(--red); }
  .breadcrumb .current{ color:var(--ink); font-weight:600; }

  .main-shell{ flex:1; min-height:0; }
  .page-error{ text-align:center; padding:3rem 1rem; color:var(--muted); font-size:.95rem; }

  .content-grid{ height:100%; display:flex; flex-direction:column; overflow-y:auto; max-width:560px; margin:0 auto; padding:0 6vw 3rem; }

  @media (min-width:960px){
    .content-grid{
      display:grid; grid-template-columns:minmax(0,1fr) minmax(374px,418px); gap:28px;
      align-items:stretch; max-width:1280px; margin:0 auto; padding:16px 28px 0; height:100%; overflow:hidden;
    }
    .col-main{ height:100%; min-height:0; overflow-y:auto; padding:0 6px 40px 0; scrollbar-width:thin; }
    .col-side{ height:100%; min-height:0; overflow-y:auto; padding:0 6px 40px 0; scrollbar-width:thin; }
  }

  /* ---------- Gallery carousel (Instagram-style: swipe/scroll/arrows) ---------- */
  .gallery-carousel{
    position:relative; width:100%; height:150px; border-radius:16px; overflow:hidden; margin-bottom:.7rem;
    background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%); touch-action:pan-y;
  }
  @media (min-width:960px){ .gallery-carousel{ aspect-ratio:16 / 9; height:auto; } }
  .gallery-slide-track{ display:flex; width:100%; height:100%; transition:transform .3s ease; will-change:transform; }
  .gallery-slide{ flex:0 0 100%; width:100%; height:100%; }
  .gallery-slide-background{ display:none; }
  .gallery-slide img,.gallery-slide video{ width:100%; height:100%; object-fit:cover; display:block; -webkit-user-drag:none; user-select:none; }
  .gallery-index-pill{
    position:absolute; top:.65rem; left:.65rem; z-index:3; background:rgba(0,0,0,.55); color:#fff;
    font-size:.68rem; font-weight:700; padding:.25rem .55rem; border-radius:100px;
  }
  .gallery-nav{
    position:absolute; top:50%; transform:translateY(-50%); width:32px; height:32px; border-radius:50%;
    background:rgba(0,0,0,.45); color:#fff; display:flex; align-items:center; justify-content:center; z-index:3;
  }
  .gallery-nav:hover{ background:rgba(0,0,0,.68); }
  .gallery-nav.prev{ left:.55rem; }
  .gallery-nav.next{ right:.55rem; }
  .gallery-nav svg{ width:15px; height:15px; }
  .gallery-dots{ position:absolute; bottom:.55rem; left:50%; transform:translateX(-50%); display:flex; gap:.32rem; z-index:3; }
  .gallery-dot{ width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,.5); transition:all .2s ease; cursor:pointer; }
  .gallery-dot.active{ background:#fff; width:14px; border-radius:4px; }
  .view-all-btn{
    position:absolute; bottom:.6rem; left:.6rem; z-index:3; background:rgba(0,0,0,.6); color:#fff;
    font-size:.72rem; font-weight:700; padding:.4rem .7rem; border-radius:9px; display:flex; align-items:center; gap:.4rem;
  }
  .view-all-btn:hover{ background:rgba(0,0,0,.8); }

  .lightbox{ display:none; position:fixed; inset:0; z-index:100; background:rgba(10,7,6,.92); padding:2.5rem; overflow-y:auto; }
  .lightbox.show{ display:block; }
  .lightbox-close{ position:fixed; top:1.5rem; right:1.5rem; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,.12); color:#fff; display:flex; align-items:center; justify-content:center; }
  .lightbox-close:hover{ background:rgba(255,255,255,.24); }
  .lightbox-grid{ max-width:960px; margin:2.5rem auto 0; display:grid; grid-template-columns:repeat(auto-fill, minmax(260px,1fr)); gap:1rem; }
  .lightbox-grid img{ width:100%; border-radius:12px; display:block; }

  /* ---------- Title block ---------- */
  .title-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:.25rem; }
  .listing-title{ font-family:var(--font-display); font-weight:700; font-size:1.25rem; line-height:1.2; }
  .title-actions{ display:flex; gap:.2rem; flex-shrink:0; }
  .action-btn{ display:flex; align-items:center; gap:.35rem; font-size:.8rem; font-weight:600; color:var(--ink); padding:.3rem .4rem; border-radius:8px; }
  .action-btn:hover{ color:var(--red); }
  .action-btn.saved svg{ fill:var(--red); stroke:var(--red); }
  .action-btn svg{ width:15px; height:15px; }

  .rating-row{ display:flex; align-items:center; gap:.45rem; font-size:.8rem; font-weight:600; margin-bottom:.3rem; flex-wrap:wrap; }
  .rating-row .icon-star{ color:var(--red); width:13px; height:13px; }
  .rating-row .superhost-tag{ font-size:.66rem; font-weight:700; padding:.15rem .55rem; border-radius:100px; background:var(--red); color:#fff; }
  .placeholder-tag{ font-size:.6rem; font-weight:700; text-transform:uppercase; letter-spacing:.03em; color:var(--muted); border:1px dashed var(--line-strong); padding:.08rem .35rem; border-radius:6px; }

  .listing-loc{ font-size:.83rem; color:var(--muted); margin-bottom:.4rem; }
  .listing-loc a{ text-decoration:underline; }
  .listing-loc a:hover{ color:var(--red); }

  .badge-row{ display:flex; gap:.4rem; margin-bottom:.5rem; flex-wrap:wrap; }
  .mini-badge{ display:inline-flex; align-items:center; gap:.25rem; font-size:.68rem; font-weight:700; padding:.22rem .55rem; border-radius:100px; background:var(--green-tint); color:var(--green-deep); }
  .mini-badge svg{ width:11px; height:11px; }

  .info-chip-row{ display:flex; gap:.5rem; margin-bottom:.5rem; flex-wrap:wrap; }
  .info-chip{ font-size:.76rem; font-weight:600; padding:.32rem .65rem; border-radius:9px; background:var(--white); border:1px solid var(--line-strong); }

  .divider{ border:none; border-top:1px solid var(--line); margin:.6rem 0; }

  /* ---------- Host card + About (side by side) ---------- */
  .host-about-row{ display:block; }
  @media (min-width:640px){ .host-about-row{ display:grid; grid-template-columns:200px 1fr; gap:1.3rem; align-items:start; } }

  .host-card{ display:flex; flex-direction:column; gap:.7rem; margin-bottom:.7rem; }
  @media (min-width:640px){ .host-card{ margin-bottom:0; } }
  .host-avatar{
    width:38px; height:38px; border-radius:50%; background:var(--red); color:#fff;
    display:flex; align-items:center; justify-content:center; font-family:var(--font-display); font-weight:700; font-size:.9rem; flex-shrink:0; overflow:hidden;
  }
  .host-avatar img{ width:100%; height:100%; object-fit:cover; }
  .host-name{ font-weight:700; font-size:.85rem; display:flex; align-items:center; gap:.35rem; flex-wrap:wrap; }
  .host-name{ color:inherit; text-decoration:none; }
  .host-name .icon-verified{ width:13px; height:13px; color:var(--red); }
  .contact-controls{ display:flex; align-items:center; justify-content:flex-end; gap:.6rem; flex-shrink:0; }
  .contact-control{
    display:inline-flex; align-items:center; justify-content:center; flex:0 0 44px;
    width:44px; height:44px; padding:0; border:1px solid var(--line-strong);
    border-radius:50%; color:var(--ink); background:transparent; cursor:pointer;
  }
  .contact-control img{ display:block; width:27px; height:27px; object-fit:contain; }
  .contact-control svg{ display:block; width:20px; height:20px; }
  .contact-control[aria-disabled="true"]{ cursor:default; }
  .contact-control:not([aria-disabled="true"]):hover{ background:var(--ink); color:var(--white); }

  .about-block .about-title, .section-title{ font-family:var(--font-display); font-weight:600; font-size:.92rem; margin-bottom:.3rem; }
  .about-text{ font-size:.8rem; line-height:1.5; color:var(--muted); }
  .about-paragraph{
    margin:0 0 .65rem 0;
    white-space:pre-wrap;
    word-break:break-word;
    overflow-wrap:break-word;
    line-height:1.5;
  }
  .about-paragraph:last-child{ margin-bottom:0; }
  .about-toggle-btn{
    display:inline;
    background:none;
    border:none;
    padding:0;
    margin:0 0 0 .35rem;
    font-family:inherit;
    font-size:inherit;
    font-weight:600;
    color:var(--ink);
    text-decoration:underline;
    text-underline-offset:2px;
    cursor:pointer;
    white-space:nowrap;
    vertical-align:baseline;
  }
  .about-toggle-btn:hover{ color:var(--red); }
  .about-toggle-btn:focus-visible{ outline:2px solid var(--red); outline-offset:2px; border-radius:2px; }

  /* ---------- Amenities (placeholder) ---------- */
  .amenity-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:.4rem .7rem; }
  @media (min-width:640px){ .amenity-grid{ grid-template-columns:repeat(3,1fr); } }
  @media (min-width:1180px){ .amenity-grid{ grid-template-columns:repeat(4,1fr); } }
  .amenity-item{ display:flex; align-items:center; gap:.45rem; font-size:.76rem; }
  .amenity-item svg{ width:14px; height:14px; color:var(--red); }

  /* ---------- Office & shop details ---------- */
  .commercial-section{ margin-top:1.05rem; }
  .commercial-section + .commercial-section{ border-top:1px solid var(--line); padding-top:1rem; }
  .commercial-section-title{ font-family:var(--font-display); font-size:.98rem; font-weight:600; margin:0 0 .55rem; }
  .commercial-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem .8rem; }
  .commercial-item{ min-width:0; }
  .commercial-item dt{ color:var(--muted); font-size:.69rem; font-weight:600; line-height:1.25; }
  .commercial-item dd{ margin:.14rem 0 0; font-size:.8rem; line-height:1.35; overflow-wrap:anywhere; }
  .commercial-list{ margin:0; padding-left:1.1rem; color:var(--muted); font-size:.8rem; line-height:1.55; }
  .commercial-list li + li{ margin-top:.2rem; }
  .commercial-note{ margin:.5rem 0 0; color:var(--muted); font-size:.76rem; line-height:1.45; }
  .commercial-disclosure{ margin:.55rem 0 0; padding:.55rem .65rem; border-radius:9px; background:var(--green-tint); color:var(--green-deep); font-size:.76rem; line-height:1.4; }
  .commercial-document-list{ display:grid; gap:.45rem; }
  .commercial-document-link{ display:flex; align-items:center; gap:.5rem; padding:.5rem .6rem; border:1px solid var(--line); border-radius:9px; background:var(--paper); font-size:.78rem; font-weight:600; overflow-wrap:anywhere; }
  .commercial-document-link:hover{ border-color:var(--red); color:var(--red); }
  @media (min-width:640px){ .commercial-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }

  /* ---------- Reviews ---------- */
  .reviews-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.4rem; flex-wrap:wrap; gap:.5rem; }
  .reviews-header .section-title{ margin-bottom:0; display:flex; align-items:center; gap:.35rem; }
  .reviews-header .icon-star{ width:13px; height:13px; color:var(--red); }
  .see-all-link{ font-size:.78rem; font-weight:700; color:var(--red); }
  .review-strip{ display:grid; grid-template-columns:repeat(auto-fit, minmax(200px,1fr)); gap:.6rem; }
  .review-card{ background:var(--white); border:1px solid var(--line-strong); border-radius:12px; padding:.6rem .7rem; }
  .review-top{ display:flex; align-items:center; gap:.45rem; margin-bottom:.3rem; }
  .review-avatar{ width:24px; height:24px; border-radius:50%; background:var(--paper); border:1px solid var(--line-strong); display:flex; align-items:center; justify-content:center; font-size:.62rem; font-weight:700; }
  .review-name{ font-size:.78rem; font-weight:700; }
  .review-time{ font-size:.65rem; color:var(--muted); }
  .review-stars{ display:flex; gap:.12rem; color:var(--red); margin-bottom:.25rem; }
  .review-stars svg{ width:11px; height:11px; }
  .review-text{ font-size:.74rem; line-height:1.3; color:var(--muted); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .reviews-state{ grid-column:1 / -1; color:var(--muted); font-size:.8rem; padding:.8rem 0; }
  .review-avatar img{ width:100%; height:100%; object-fit:cover; border-radius:50%; }

  /* ---------- Sidebar booking widget ---------- */
  .booking-widget{ background:var(--white); border:1px solid var(--line-strong); border-radius:16px; padding:1rem 1.2rem; }
  .property-booking-widget{ padding:1rem; }
  .property-purpose-selector{ display:flex; gap:.25rem; padding:.2rem; margin-bottom:.85rem; border:1px solid var(--line); border-radius:12px; }
  .property-purpose-option{ display:flex; flex:1; align-items:center; justify-content:center; gap:.4rem; min-width:0; padding:.55rem .35rem; border-radius:9px; font-size:.76rem; font-weight:600; color:var(--muted); text-align:center; }
  .property-purpose-option.active{ background:var(--nav-active-bg); color:var(--ink); }
  .property-purpose-option svg{ width:16px; height:16px; }
  .property-price-section{ padding:.2rem 0 .8rem; }
  .property-price-section + .property-price-section{ border-top:1px solid var(--line); padding-top:.75rem; }
  .property-price-label{ display:flex; align-items:center; gap:.5rem; margin-bottom:.25rem; font-size:.8rem; color:var(--muted); }
  .property-price-label svg,.property-policy-title svg{ width:18px; height:18px; }
  .property-price-value{ font-size:1.18rem; font-weight:700; line-height:1.35; }
  .property-price-missing,.property-policy-empty{ color:var(--muted); font-size:.78rem; }
  .property-units{ display:grid; grid-template-columns:1fr 1fr; margin:.15rem 0 .75rem; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .property-unit-item{ display:flex; align-items:flex-start; gap:.55rem; padding:.65rem .25rem; min-width:0; }
  .property-unit-item + .property-unit-item{ border-left:1px solid var(--line); padding-left:.7rem; }
  .property-unit-item svg{ width:18px; height:18px; flex-shrink:0; margin-top:.1rem; }
  .property-unit-item strong,.property-unit-item span{ display:block; font-size:.76rem; line-height:1.4; }
  .property-unit-item span{ color:var(--muted); font-size:.7rem; }
  .property-booking-widget .picker-title{ margin-top:.45rem; }
  .booking-widget .property-policy{ border-top:1px solid var(--line); margin-top:.55rem; padding-top:.65rem; }
  .property-policy-title{ display:flex; align-items:center; gap:.5rem; margin-bottom:.45rem; font-size:.88rem; font-weight:700; }
  .property-policy-link{ display:flex; align-items:center; gap:.7rem; width:100%; min-width:0; padding:.55rem .65rem; border:1px solid var(--line); border-radius:12px; background:var(--paper); color:inherit; text-align:left; text-decoration:none; }
  .property-policy-link:hover{ border-color:var(--red); }
  .property-policy-icon{ width:24px; height:28px; color:var(--green); }
  .property-policy-name{ min-width:0; overflow-wrap:anywhere; font-size:.76rem; font-weight:600; }
  .property-policy-action{ display:block; margin-top:.12rem; color:var(--muted); font-size:.68rem; font-weight:400; }
  .property-policy-details{ display:grid; gap:.5rem; margin:0 0 .55rem; }
  .property-policy-row{ min-width:0; }
  .property-policy-row dt{ color:var(--muted); font-size:.7rem; font-weight:600; }
  .property-policy-row dd{ margin:.12rem 0 0; font-size:.78rem; line-height:1.45; overflow-wrap:anywhere; white-space:pre-wrap; }
  .property-policy-download{ display:inline-block; margin:.35rem 0 0 .15rem; color:var(--ink); font-size:.75rem; font-weight:600; text-decoration:underline; }
  .property-purchase-btn{ width:100%; margin-top:.55rem; padding:.68rem 1rem; border:1px solid var(--line-strong); border-radius:100px; color:var(--ink); font-size:.82rem; font-weight:700; }
  .property-purchase-btn:hover{ border-color:var(--red); color:var(--red); }
  .property-purchase-btn.property-purchase-primary{ border-color:var(--red); background:var(--red); color:#fff; }
  .property-purchase-btn.property-purchase-primary:hover{ border-color:var(--red-deep); background:var(--red-deep); color:#fff; }
  .widget-price-row{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:.6rem; }
  .widget-price{ font-family:var(--font-display); font-weight:700; font-size:1.15rem; }
  .widget-price span{ font-family:var(--font-body); font-weight:500; font-size:.78rem; color:var(--muted); }
  .widget-rating{ display:flex; align-items:center; gap:.3rem; font-size:.78rem; font-weight:600; }
  .widget-rating svg{ width:12px; height:12px; color:var(--red); }

  .picker-title{ font-family:var(--font-display); font-weight:600; font-size:.92rem; margin-bottom:.2rem; }
  .picker-sub{ font-size:.73rem; color:var(--muted); margin-bottom:.55rem; line-height:1.35; }

  .field{ display:flex; flex-direction:column; gap:.3rem; margin-bottom:.55rem; }
  label{ font-size:.78rem; font-weight:600; }
  input, select{
    font-family:inherit; font-size:.85rem; padding:.5rem .7rem;
    border:1px solid var(--line-strong); border-radius:9px;
    background:var(--paper); color:var(--ink); width:100%;
  }
  input:focus, select:focus{ outline:none; border-color:var(--red); }

  .cal-header{ display:flex; align-items:center; justify-content:space-between; margin:.15rem 0 .4rem; }
  .cal-title{ font-weight:700; font-size:.82rem; }
  .cal-nav{ display:flex; gap:.3rem; }
  .cal-nav button{ width:23px; height:23px; border-radius:7px; background:var(--paper); border:1px solid var(--line-strong); display:flex; align-items:center; justify-content:center; }
  .cal-nav button:hover{ border-color:var(--red); color:var(--red); }
  .cal-nav svg{ width:12px; height:12px; }

  .cal-grid{ display:grid; grid-template-columns:repeat(7, 1fr); gap:.2rem; margin-bottom:.35rem; }
  .cal-dow{ font-size:.56rem; font-weight:700; color:var(--muted); text-align:center; padding:.1rem 0; }
  .cal-day{
    aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;
    border-radius:6px; font-size:.68rem; font-weight:500; background:transparent; color:var(--muted);
    border:1.5px solid transparent;
  }
  .cal-day.closed{ opacity:.35; cursor:not-allowed; }
  .cal-day.open{ cursor:pointer; background:var(--green-tint); color:var(--ink); font-weight:600; }
  .cal-day.open:hover{ border-color:var(--green); background:var(--green-tint-strong); }
  .cal-day.in-range{ background:rgba(196,30,58,.14); color:var(--ink); }
  .cal-day.range-end{ background:var(--red); color:#fff; }
  .cal-day.empty{ visibility:hidden; }

  .cal-legend{ display:flex; flex-wrap:wrap; gap:.7rem; font-size:.66rem; color:var(--muted); margin-bottom:.45rem; }
  .cal-legend .dot{ display:inline-block; width:6px; height:6px; border-radius:50%; margin-right:.28rem; vertical-align:middle; }
  .cal-legend .dot.dot-open{ background:var(--green); }
  .cal-legend .dot.dot-selected{ background:var(--red); }

  .range-summary{ font-size:.75rem; font-weight:600; margin-bottom:.45rem; }

  .details-box{ border-top:1px solid var(--line); padding-top:.55rem; margin-top:.15rem; font-size:.8rem; }
  .details-row{ display:flex; justify-content:space-between; padding:.2rem 0; }
  .details-row.total{ border-top:1px solid var(--line); margin-top:.2rem; padding-top:.45rem; font-weight:700; }
  .details-label{ color:var(--muted); }

  .confirm-btn{
    background:var(--red); color:#fff; padding:.7rem 1.4rem; border-radius:100px;
    font-weight:600; font-size:.9rem; width:100%; margin-top:.6rem; transition:background .2s ease;
  }
  .confirm-btn:hover{ background:var(--red-deep); }
  .confirm-btn:disabled{ background:#c9c0bd; cursor:not-allowed; }

  .form-note{ font-size:.72rem; color:var(--muted); text-align:center; margin-top:.4rem; }

  .success-msg{ display:none; border-radius:12px; padding:.8rem 1rem; margin-top:.6rem; font-size:.85rem; text-align:center; }
  .success-msg.show{ display:block; border:1px solid var(--green-tint-strong); background:var(--green-tint); color:var(--green-deep); }
  .success-msg.error{ background:rgba(196,30,58,.1); border-color:rgba(196,30,58,.35); color:var(--red-deep); }

  /* ---------- Skeleton loading ---------- */
  .skel{ position:relative; overflow:hidden; background:var(--skel-base); border-radius:8px; }
  .skel::after{
    content:''; position:absolute; inset:0;
    background:linear-gradient(100deg, transparent 30%, var(--skel-shine) 50%, transparent 70%);
    animation:skel-sweep 1.4s ease-in-out infinite;
  }
  @media (prefers-reduced-motion:reduce){
    .skel::after{ animation:none; }
    .skel{ animation:skel-pulse 1.8s ease-in-out infinite; }
  }
  @keyframes skel-sweep{ 0%{ transform:translateX(-100%); } 100%{ transform:translateX(100%); } }
  @keyframes skel-pulse{ 0%,100%{ opacity:1; } 50%{ opacity:.55; } }

  .skel-gallery{ height:150px; border-radius:16px; margin-bottom:.7rem; }
  @media (min-width:960px){ .skel-gallery{ aspect-ratio:16 / 9; height:auto; margin-bottom:1.15rem; } }
  .skel-shell{ display:block; padding:.75rem 6vw; overflow-y:auto; height:100%; scrollbar-width:none; }
  .skel-shell::-webkit-scrollbar{ display:none; width:0; height:0; }
  @media (min-width:960px){
    .skel-shell{
      display:grid; grid-template-columns:minmax(0,1fr) minmax(374px,418px); gap:28px;
      padding:16px 28px 0; max-width:1280px; margin:0 auto; height:100%; overflow:hidden; box-sizing:border-box;
    }
  }
  .skel-line{ height:.65rem; border-radius:5px; margin-bottom:.45rem; }
  .skel-line.w-60{ width:60%; } .skel-line.w-40{ width:40%; } .skel-line.w-90{ width:90%; } .skel-line.w-100{ width:100%; }
  .skel-line.tall{ height:1.2rem; }
  .skel-avatar{ width:38px; height:38px; border-radius:50%; }
  .skel-card{ background:var(--white); border:1px solid var(--line-strong); border-radius:16px; padding:1rem 1.2rem; }
  .skel-cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:.2rem; margin:.6rem 0; }
  .skel-cal-cell{ aspect-ratio:1/1; border-radius:6px; }
  .skel-button{ height:2.6rem; border-radius:100px; margin-top:.8rem; }

  /* ---------- Narrow / mobile fallback: normal document scroll ---------- */
  @media (max-width:959px){
    html, body{ height:auto; overflow:visible; }
    .page-shell{ height:auto; overflow:visible; }
    .main-shell{ height:auto; }
    .content-grid{ height:auto; overflow:visible; padding-top:1rem; }
    .skel-shell{ height:auto; overflow:visible; }
  }

  /* ---------- Dedicated desktop booking workspace ---------- */
  .client-sidebar{ display:none; }
  .client-sidebar[aria-hidden="true"]{ visibility:hidden; }
  .content-grid{ max-width:1240px; padding:1.5rem 5vw 4rem; gap:3.5rem; }
  .col-main{ min-width:0; }
  .col-side{ min-width:0; }
  .gallery-carousel{ aspect-ratio:16 / 9; height:auto; border-radius:20px; margin-bottom:1.75rem; }
  .gallery-index-pill,.view-all-btn{ background:rgba(26,18,16,.72); backdrop-filter:blur(8px); }
  .gallery-report-btn{
    position:absolute; top:.65rem; left:.65rem; z-index:3; width:34px; height:34px;
    border-radius:50%; background:rgba(26,18,16,.72); color:#fff; display:flex;
    align-items:center; justify-content:center; backdrop-filter:blur(8px);
  }
  .gallery-report-btn:hover{ background:rgba(26,18,16,.9); }
  .gallery-report-btn svg{ width:16px; height:16px; }
  .gallery-like-btn{
    position:absolute; top:.65rem; right:.65rem; z-index:4; width:38px; height:38px;
    border-radius:50%; background:rgba(26,18,16,.72); color:#fff; display:flex;
    align-items:center; justify-content:center; backdrop-filter:blur(8px); cursor:pointer;
  }
  .gallery-like-btn svg{ width:18px; height:18px; }
  .gallery-like-count{
    display:none;
    position:absolute; right:calc(100% + .4rem); top:50%; transform:translateY(-50%);
    color:#fff; font-size:.75rem; font-weight:700; line-height:1;
    text-shadow:0 1px 3px rgba(0,0,0,.8); white-space:nowrap;
  }
  .gallery-like-btn:disabled{ cursor:default; }
  .gallery-close-btn{ display:none; }
  .gallery-index-pill{ left:3.35rem; }
  .title-row{ margin-bottom:.65rem; }
  .listing-title{ font-size:clamp(1.7rem, 3vw, 2.6rem); letter-spacing:-.03em; }
  .title-actions{ gap:.5rem; }
  .action-btn{ padding:.5rem .7rem; border:1px solid var(--line); border-radius:100px; }
  .rating-row{ margin-bottom:.7rem; }
  .rating-row .superhost-tag{ background:var(--green-tint); color:var(--green-deep); }
  .listing-loc{ margin-bottom:1rem; }
  .info-chip{ border-radius:100px; background:transparent; }
  .divider{ margin:1.8rem 0; }
  .host-about-row{ display:grid; grid-template-columns:minmax(170px,.35fr) minmax(0,1fr); gap:2.5rem; }
  .host-card{ padding-top:.15rem; }
  .about-block .about-title,.section-title{ font-size:1.05rem; }
  .about-text{ font-size:.92rem; line-height:1.7; color:var(--muted); }
  .amenity-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem 1.5rem; }
  .amenity-item{ gap:.6rem; font-size:.82rem; color:var(--muted); }
  .amenity-item svg{ color:var(--ink); width:17px; height:17px; }
  .reviews-header{ margin-bottom:.8rem; }
  .review-strip{ gap:1rem; }
  .review-card{ border-color:var(--line); border-radius:14px; padding:1rem; }
  .booking-widget{
    border-color:var(--line); border-radius:18px; padding:1.5rem;
    box-shadow:0 12px 36px #E4E1DA; position:sticky; top:1rem;
  }
  .widget-price{ font-size:1.45rem; }
  .widget-price span{ font-size:.78rem; }
  .picker-title{ font-family:var(--font-display); font-size:1.2rem; margin-top:1.35rem; }
  .picker-sub{ line-height:1.5; }
  .cal-container{ margin-top:1rem; }
  .cal-header{ padding-bottom:.7rem; }
  .cal-title{ font-size:.95rem; }
  .cal-grid{ gap:.25rem; }
  .cal-day{ border-radius:50%; font-size:.75rem; }
  .cal-day.open{ background:transparent; }
  .cal-day.open:hover{ background:var(--green-tint); border-color:transparent; }
  .cal-day.in-range{ background:rgba(196,30,58,.1); border-radius:0; }
  .cal-day.range-end{ background:var(--red); color:#fff; border-radius:50%; }
  .confirm-btn{ background:var(--red); color:#fff; margin-top:1rem; }
  .confirm-btn:hover{ background:var(--red-deep); }
  .confirm-btn:disabled{ background:#c9c0bd; color:#5e514c; }
  [data-theme="dark"] .confirm-btn{ background:#f5efec; color:#24211E; }
  [data-theme="dark"] .confirm-btn:hover{ background:#fff; }
  [data-theme="dark"] .confirm-btn:disabled{ background:#6b625e; color:#e9e1dd; }
  .form-note{ line-height:1.45; }
  @media (min-width:960px){
    .page-shell{ display:block; height:100vh; overflow:hidden; }
    .legacy-header,.breadcrumb{ display:none !important; }
    .client-sidebar{
      position:fixed; inset:0 auto 0 0; z-index:20; display:flex; width:54px;
      flex-direction:column; align-items:center; gap:1rem; overflow-y:auto;
      padding:.9rem 0; border-right:1px solid var(--line); background:var(--white);
      scrollbar-width:thin;
    }
    .client-nav-link{
      width:34px; height:34px; display:flex; align-items:center; justify-content:center;
      border-radius:10px; color:var(--muted); transition:background .15s ease,color .15s ease;
    }
    .client-nav-link:hover,.client-nav-link:focus-visible{ color:var(--ink); background:var(--nav-active-bg); }
    .client-nav-link.active{ color:var(--ink); background:var(--nav-active-bg); }
    .client-nav-link svg{ width:18px; height:18px; }
    .main-shell{ height:100vh; min-height:100vh; margin-left:54px; overflow:hidden; }
    #booking-page{ height:100%; overflow:hidden; }
    .content-grid{
      display:grid; grid-template-columns:minmax(0,1fr) minmax(374px,418px);
      align-items:stretch;
      max-width:1280px; height:100%; max-height:100%; margin:0 auto; padding:16px 28px 0; gap:28px;
      overflow:hidden; box-sizing:border-box;
    }
    .col-main{
      height:100%; min-height:0;
      overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;
      padding:0 6px 40px 0;
      scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent;
    }
    .col-main::-webkit-scrollbar{ width:6px; }
    .col-main::-webkit-scrollbar-track{ background:transparent; }
    .col-main::-webkit-scrollbar-thumb{ background:var(--line-strong); border-radius:99px; }

    .col-side{
      height:100%; min-height:0;
      overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;
      padding:0 6px 40px 0;
      scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent;
    }
    .col-side::-webkit-scrollbar{ width:6px; }
    .col-side::-webkit-scrollbar-track{ background:transparent; }
    .col-side::-webkit-scrollbar-thumb{ background:var(--line-strong); border-radius:99px; }

    /* --- Gallery: fixed 16:9 container, edge-to-edge cover framing --- */
    .gallery-carousel{
      width:100%;
      aspect-ratio:16 / 9;
      height:auto;
      margin-bottom:1.15rem;
      border-radius:14px;
      background:transparent;
      overflow:hidden;
    }
    .gallery-slide{
      position:relative;
      display:flex;
      align-items:center;
      justify-content:center;
      width:100%;
      height:100%;
      background:transparent;
    }
    .gallery-slide img, .gallery-slide video{
      width:100%;
      height:100%;
      object-fit:cover;
      object-position:center;
      display:block;
    }
    .gallery-slide > .gallery-slide-background{
      display:block;
      position:absolute;
      inset:0;
      z-index:0;
      object-fit:cover;
      filter:blur(18px);
      transform:scale(1.08);
      opacity:.72;
      pointer-events:none;
    }
    .gallery-slide > img:not(.gallery-slide-background){
      position:relative;
      z-index:1;
      width:100%;
      height:100%;
      object-fit:contain;
      object-position:center;
    }
    .gallery-index-pill,.gallery-report-btn,.gallery-like-btn{ box-shadow:0 2px 10px rgba(0,0,0,.18); }
    .gallery-report-btn,.gallery-like-btn{ width:32px; height:32px; }

    /* --- Gallery nav arrows: visible, properly sized, interactive --- */
    .gallery-nav{
      width:32px; height:32px; background:rgba(255,255,255,.92); color:var(--ink);
      border:1px solid var(--line); border-radius:50%; z-index:10; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
    }
    .gallery-nav:hover{ background:#fff; color:var(--red); }
    [data-theme="dark"] .gallery-nav{ background:rgba(255,255,255,.92); color:#24211E; border-color:rgba(255,255,255,.25); }
    [data-theme="dark"] .gallery-nav:hover{ background:#fff; color:var(--red); }
    .gallery-nav svg{ width:14px; height:14px; pointer-events:none; }

    /* --- Title: larger, bolder — matches Design 2 --- */
    .title-row{ margin-bottom:.5rem; }
    .listing-title{ font-size:clamp(1.35rem,2.2vw,1.75rem); line-height:1.2; font-weight:700; letter-spacing:-.02em; }
    .title-actions .action-btn{ width:32px; height:32px; padding:0; justify-content:center; border-radius:50%; border:1px solid var(--line); }
    .title-actions .action-btn span{ display:none; }

    /* --- Metadata row: rating, location inline; phone on its own separate row --- */
    .rating-row,.listing-loc,.badge-row,.info-chip-row{
      display:inline-flex; align-items:center; vertical-align:middle; margin:0 .55rem .35rem 0;
    }
    /* Phone gets its own block row so it appears beneath the inline metadata */
    .host-phone{
      display:flex; align-items:center; gap:.35rem;
      font-size:.8rem; color:var(--muted); margin-bottom:.5rem; margin-right:0;
    }
    .host-phone a{ color:var(--ink); font-weight:600; }
    .host-phone a:hover{ color:var(--red); }

    .listing-loc{ gap:.28rem; font-size:.78rem; }
    .listing-loc .map-link-inline{
      display:inline; margin-left:.2rem; padding-left:.5rem; border-left:1px solid var(--line-strong);
      color:var(--red); font-weight:700; line-height:1;
    }
    .rating-row{ font-size:.78rem; gap:.35rem; }

    /* --- Info chips: proper pill border (Design 2 shows bordered badges) --- */
    .badge-row,.info-chip-row{ gap:.4rem; margin-bottom:.55rem; }
    .info-chip{
      font-size:.74rem; font-weight:600; padding:.28rem .7rem; border-radius:100px;
      background:var(--white); border:1.5px solid var(--line-strong); color:var(--ink);
    }
    .mini-badge{ padding:.22rem .55rem; font-size:.68rem; }

    /* --- Dividers & section spacing --- */
    .divider{ margin:.8rem 0; }
    .host-about-row{ grid-template-columns:1fr; gap:.6rem; }
    .host-card{ flex-direction:row; align-items:center; justify-content:space-between; gap:.75rem; }
    .about-block .about-title,.section-title{ font-size:.92rem; margin-bottom:.25rem; font-weight:700; }
    .about-text{ font-size:.8rem; line-height:1.5; color:var(--muted); }
    .amenity-grid{ grid-template-columns:repeat(4,minmax(0,1fr)); gap:.5rem .8rem; }
    .amenity-item{ font-size:.74rem; gap:.4rem; color:var(--muted); }
    .amenity-item svg{ width:15px; height:15px; color:var(--ink); }
    .reviews-header{ margin-bottom:.35rem; }
    .reviews-state{ padding:.3rem 0; font-size:.75rem; }

    /* --- Booking widget (consistent framework for stay & table booking) --- */
    .booking-widget{
      position:relative; width:100%; box-sizing:border-box;
      padding:1.25rem; border-radius:16px;
      border:1px solid var(--line-strong); background:var(--white);
      box-shadow:0 8px 32px rgba(36,33,30,.09);
    }
    [data-theme="dark"] .booking-widget{
      box-shadow:0 8px 32px rgba(0,0,0,.35);
    }
    .booking-widget > :first-child{ margin-top:0 !important; }

    /* Price row */
    .widget-price{ font-size:1.25rem; font-weight:700; }
    .widget-price-row{ margin-bottom:.45rem; }

    /* "Pick your dates" heading — bold, Design 2 style */
    .picker-title{ font-size:1rem; font-weight:700; margin-top:.75rem; margin-bottom:.15rem; font-family:var(--font-display); }
    .picker-sub{ margin-bottom:.4rem; font-size:.72rem; line-height:1.35; }

    /* Calendar */
    .cal-header{ padding-bottom:.25rem; margin:.15rem 0 .25rem; }
    .cal-title{ font-size:.85rem; font-weight:700; }
    .cal-grid{ gap:.12rem; margin-bottom:.25rem; }
    .cal-dow{ font-size:.54rem; padding:0; }
    .cal-day{ height:clamp(28px,3.8vh,34px); aspect-ratio:auto; font-size:.68rem; line-height:1; }
    .cal-legend{ margin-bottom:.3rem; font-size:.64rem; gap:.55rem; }
    .range-summary{ margin-bottom:.3rem; font-size:.72rem; }

    /* Guests field — bold label, Design 2 style */
    .field{ gap:.25rem; margin-bottom:.4rem; }
    label{ font-size:.78rem; font-weight:700; color:var(--ink); }
    input,select{ min-height:36px; padding:.45rem .65rem; font-size:.78rem; border-radius:9px; }
    .details-box{ padding-top:.45rem; font-size:.74rem; }

    /* Book Now — always red, prominent, full-width pill — Design 2 signature element */
    .confirm-btn{
      min-height:42px; margin-top:.65rem; padding:.7rem 1.2rem; font-size:.88rem; font-weight:700;
      background:var(--red); color:#fff; border-radius:100px; width:100%; letter-spacing:.01em;
    }
    .confirm-btn:hover{ background:var(--red-deep); }
    .confirm-btn:disabled{ background:#c9c0bd; color:#5e514c; cursor:not-allowed; }
    [data-theme="dark"] .confirm-btn{ background:var(--red); color:#fff; }
    [data-theme="dark"] .confirm-btn:hover{ background:var(--red-deep); }
    [data-theme="dark"] .confirm-btn:disabled{ background:#6b625e; color:#e9e1dd; }

    .form-note{ margin-top:.35rem; font-size:.67rem; line-height:1.35; }
  }
  @media (max-width:959px){
    body{ padding-bottom:0; }
    header, .breadcrumb{ display:none !important; }
    .content-grid{ padding:0 0 2rem; max-width:none; gap:0; }
    .skel-shell{ padding:0; }
    .skel-gallery{ height:clamp(300px, 56svh, 430px); border-radius:0 0 28px 28px; }
    .gallery-carousel{
      height:clamp(300px, 56svh, 430px); border-radius:0 0 28px 28px; margin:0; width:100%;
    }
    #col-main > :not(.gallery-carousel){ margin-left:5vw; margin-right:5vw; }
    #col-main > .divider{ margin:1.25rem 5vw; }
    .listing-title{ font-size:1.35rem; letter-spacing:-.02em; }
    .title-row{ margin-top:1rem; margin-bottom:.35rem; }
    .title-actions{ display:none; }
    .rating-row{ margin-bottom:.35rem; }
    .listing-loc{ display:flex; align-items:center; gap:.35rem; margin-bottom:.45rem; }
    .listing-loc .map-link-inline{ display:none; }
    .location-section{ display:none; }
    .gallery-report-btn, .gallery-index-pill, .gallery-nav, .view-all-btn{ display:none; }
    .gallery-close-btn{
      position:absolute; top:.75rem; left:.75rem; z-index:4; width:40px; height:40px;
      border-radius:50%; background:rgba(26,18,16,.62); color:#fff; display:flex;
      align-items:center; justify-content:center; backdrop-filter:blur(8px);
    }
    .gallery-close-btn svg{ width:20px; height:20px; }
    .gallery-like-btn{ top:.75rem; right:.75rem; width:40px; height:40px; }
    .host-about-row{ display:block; }
    .about-block{ margin-top:1.5rem; }
    .amenity-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); }
    .col-side{ display:block; margin:0 5vw; }
    .col-side .booking-widget{ position:static; margin-top:1.25rem; padding:1rem; box-shadow:none; }
  }

  /* ---------- Booking CTA sending animation ---------- */
  .confirm-btn { position:relative; overflow:hidden; }
  .cta-progress {
    position:absolute; top:0; left:0; bottom:0; width:100%;
    background:var(--green); border-radius:inherit;
    transform:scaleX(0); transform-origin:left center;
    pointer-events:none; z-index:0;
  }
  .cta-airplane {
    position:absolute; top:50%; left:6px;
    transform:translateY(-50%);
    z-index:1; pointer-events:none;
    opacity:0; display:flex; align-items:center;
  }
  .confirm-btn.cta-sending .cta-airplane { opacity:1; }
  .cta-airplane svg { width:18px; height:18px; transform:rotate(-45deg); }
  .cta-label { position:relative; z-index:1; }
  .confirm-btn.cta-sending { cursor:wait; }
  .confirm-btn.cta-sending:disabled { background:var(--red); color:#fff; cursor:wait; }
  .confirm-btn.cta-sent { cursor:default; pointer-events:none; }
  .confirm-btn.cta-sent:disabled { background:var(--red); color:#fff; cursor:default; }
  [data-theme="dark"] .confirm-btn.cta-sending:disabled,
  [data-theme="dark"] .confirm-btn.cta-sent:disabled { background:var(--red); color:#fff; }
  @media (prefers-reduced-motion:reduce) {
    .cta-progress, .cta-airplane { transition:none !important; }
  }
`;
