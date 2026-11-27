// Styles for /booking, scoped to the page (.booking-page) and its sheet
// (.booking-layer.booking-page): nothing here reaches :root, html, body or
// another page. The look follows Settings and Bookings (soft paper, white
// rounded cards, system fonts). The page sits inside the app shell beside the
// shared sidebar (icon rail). From 960 px the listing and the booking widget
// scroll in two columns; below that the page scrolls as one, and a bar at the
// bottom keeps the price and a way to the widget in reach.
//
// Motion (animation.md): calendar months slide in from the side they come
// from (C4, 200 ms); the price summary opens with grid rows (C5, 250 ms); the
// Room / Table pill slides (§8.1); the sent tick draws in; the phone bar and
// the toast slide (§8.5); buttons press to .97. Reduced motion turns all of
// it off.

export const BOOKING_STYLES = `
  .booking-page{
    --red:#C41E3A; --red-deep:#8F1229; --paper:var(--va-light); --card:var(--va-light); --ink:#24211E; --muted:#6B665E;
    --line:rgba(26,18,16,.1); --line-strong:rgba(26,18,16,.18); --soft:#F1EFEA; --soft-2:#E9E7E2;
    --green:#2E9B54; --green-deep:#1E6B3A; --green-tint:rgba(46,155,84,.12); --green-tint-strong:rgba(46,155,84,.22);
    --red-tint:rgba(196,30,58,.1); --range:rgba(196,30,58,.1);
    --card-shadow:0 1px 2px rgba(26,18,16,.04), 0 6px 20px -14px rgba(26,18,16,.22);
    --widget-shadow:0 1px 2px rgba(26,18,16,.04), 0 18px 40px -24px rgba(26,18,16,.35);
    --skel-base:rgba(128,110,100,.12); --skel-shine:rgba(128,110,100,.22);
    --font-body:-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  }
  html[data-theme="dark"] .booking-page{
    --paper:#000000; --card:#141414; --ink:#F2F2F2; --muted:#9A9AA0;
    --line:rgba(255,255,255,.09); --line-strong:rgba(255,255,255,.18); --soft:#1D1D1F; --soft-2:#2A2A2C;
    --green:#5CC98A; --green-deep:#8AE0AC; --green-tint:rgba(92,201,138,.14); --green-tint-strong:rgba(92,201,138,.26);
    --red-tint:rgba(240,139,154,.16); --range:rgba(240,139,154,.16);
    --card-shadow:none; --widget-shadow:none;
    --skel-base:rgba(255,255,255,.06); --skel-shine:rgba(255,255,255,.13);
  }

  /* The app-wide dark theme (chats-assets theme, a copy of varoom-dark-theme.css) greys
     .section-title and forces .field labels and inputs with !important: keep this page's own. */
  html[data-theme="dark"] .booking-page .section-title{ color:var(--ink); }
  html[data-theme="dark"] .booking-page .field label{ color:var(--ink) !important; }
  html[data-theme="dark"] .booking-page .field input{ background:var(--card) !important; border-color:var(--line-strong) !important; color:var(--ink) !important; }

  /* ---------- Page frame ---------- */
  .booking-page, .booking-page *, .booking-page *::before, .booking-page *::after{ box-sizing:border-box; }
  .booking-page :where(h1, h2, h3, p, ul, dl, dd, figure){ margin:0; padding:0; }
  .booking-page :where(ul){ list-style:none; }
  .booking-page{ font-family:var(--font-body); color:var(--ink); background:var(--paper); -webkit-font-smoothing:antialiased; }
  .booking-page a{ color:inherit; text-decoration:none; }
  .booking-page button{ font:inherit; color:inherit; cursor:pointer; border:0; background:none; padding:0; }
  .booking-page button:disabled{ cursor:default; }
  .booking-page :focus-visible{ outline:2px solid var(--ink); outline-offset:2px; }
  .booking-page svg{ flex-shrink:0; }
  .booking-page .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

  .booking-page.page-shell{ display:flex; flex-direction:column; min-height:100vh; }
  .booking-page .main-shell{ flex:1; min-height:0; }
  .booking-page .page-error{ display:flex; flex-direction:column; align-items:center; gap:14px; text-align:center; padding:4rem 1rem; color:var(--muted); font-size:.95rem; }
  .booking-page .page-error-btn{ min-height:38px; padding:0 18px; border-radius:999px; background:var(--ink); color:var(--paper); font-size:.85rem; font-weight:600; }

  .booking-page .content-grid{ display:flex; flex-direction:column; max-width:640px; margin:0 auto; padding:0 0 calc(96px + env(safe-area-inset-bottom)); }
  .booking-page .col-main, .booking-page .col-side{ min-width:0; }
  .booking-page #col-main > :not(.gallery-carousel){ margin-left:20px; margin-right:20px; }
  .booking-page .col-side{ margin:20px 16px 0; scroll-margin-top:12px; }

  @media (min-width:960px){
    .booking-page.page-shell{ height:100vh; overflow:hidden; }
    .booking-page .main-shell{ height:100vh; overflow:hidden; }
    .booking-page #booking-page{ height:100%; overflow:hidden; }
    .booking-page .content-grid{
      display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,400px); gap:32px;
      max-width:1240px; height:100%; margin:0 auto; padding:20px 32px 0; overflow:hidden;
    }
    .booking-page .col-main, .booking-page .col-side{
      height:100%; min-height:0; overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain;
      padding:0 6px 48px 0; scrollbar-width:thin; scrollbar-color:var(--line-strong) transparent;
    }
    .booking-page #col-main > :not(.gallery-carousel){ margin-left:0; margin-right:0; }
    .booking-page .col-side{ margin:0; }
  }

  /* ---------- Gallery ---------- */
  .booking-page .gallery-carousel{
    position:relative; width:100%; height:clamp(300px, 56svh, 430px); overflow:hidden; touch-action:pan-y;
    border-radius:0 0 28px 28px; background:linear-gradient(135deg, var(--red) 0%, var(--red-deep) 100%);
  }
  .booking-page .gallery-slide-track{ display:flex; width:100%; height:100%; will-change:transform; }
  .booking-page .gallery-slide{ position:relative; flex:0 0 100%; width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  .booking-page .gallery-slide img, .booking-page .gallery-slide video{ width:100%; height:100%; object-fit:cover; display:block; -webkit-user-drag:none; user-select:none; }
  .booking-page .gallery-slide > .gallery-slide-background{ display:none; }
  .booking-page .gallery-index-pill{
    position:absolute; top:14px; left:14px; z-index:3; padding:5px 10px; border-radius:999px;
    background:rgba(20,16,14,.6); color:#fff; font-size:.72rem; font-weight:600; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
  }
  .booking-page .gallery-nav{
    position:absolute; top:50%; z-index:3; width:34px; height:34px; margin-top:-17px; border-radius:50%;
    display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.92); color:#24211E;
    box-shadow:0 2px 10px rgba(0,0,0,.18); opacity:0; transition:opacity var(--motion-quick,200ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .gallery-carousel:hover .gallery-nav, .booking-page .gallery-nav:focus-visible{ opacity:1; }
  .booking-page .gallery-nav:active{ transform:scale(var(--press-scale,.97)); }
  .booking-page .gallery-nav.prev{ left:14px; }
  .booking-page .gallery-nav.next{ right:14px; }
  .booking-page .gallery-nav svg{ width:15px; height:15px; pointer-events:none; }
  .booking-page .gallery-dots{ position:absolute; bottom:14px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:3; }
  .booking-page .gallery-dot{ width:6px; height:6px; border-radius:999px; background:rgba(255,255,255,.55); cursor:pointer; transition:width var(--motion-quick,200ms) var(--ease-out,ease), background var(--motion-quick,200ms) var(--ease-out,ease); }
  .booking-page .gallery-dot.active{ width:16px; background:#fff; }
  .booking-page .gallery-like-btn, .booking-page .gallery-close-btn{
    position:absolute; top:14px; z-index:4; width:40px; height:40px; border-radius:50%;
    display:flex; align-items:center; justify-content:center; color:#fff;
    background:rgba(20,16,14,.6); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    transition:transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .gallery-like-btn{ right:14px; }
  .booking-page .gallery-close-btn{ left:14px; }
  .booking-page .gallery-like-btn:active, .booking-page .gallery-close-btn:active{ transform:scale(.92); }
  .booking-page .gallery-like-btn svg{ width:19px; height:19px; }
  .booking-page .gallery-close-btn svg{ width:20px; height:20px; }
  .booking-page .gallery-like-count{ display:none; }
  /* Phones: the close button sits where the photo counter would. */
  .booking-page .gallery-index-pill{ display:none; }
  @media (max-width:959px){ .booking-page .gallery-nav{ display:none; } }
  @media (min-width:960px){
    .booking-page .gallery-carousel{ height:auto; aspect-ratio:16 / 9; border-radius:20px; margin-bottom:20px; background:var(--soft); }
    .booking-page .gallery-slide > .gallery-slide-background{ display:block; position:absolute; inset:0; z-index:0; object-fit:cover; filter:blur(18px); transform:scale(1.08); opacity:.7; pointer-events:none; }
    .booking-page .gallery-slide > img:not(.gallery-slide-background){ position:relative; z-index:1; object-fit:contain; }
    .booking-page .gallery-close-btn{ display:none; }
    .booking-page .gallery-index-pill{ display:block; }
  }

  /* ---------- Title, location, chips ---------- */
  .booking-page .title-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-top:20px; margin-bottom:6px; }
  .booking-page .listing-title{ font-size:1.5rem; font-weight:700; line-height:1.2; letter-spacing:-.02em; overflow-wrap:anywhere; }
  .booking-page .title-actions{ display:flex; gap:8px; flex-shrink:0; }
  .booking-page .action-btn{
    display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 14px; border-radius:999px; border:1px solid var(--line-strong);
    background:var(--card); font-size:.8rem; font-weight:600; transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .action-btn:active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ .booking-page .action-btn:hover{ background:var(--soft); } }
  .booking-page .action-btn svg{ width:15px; height:15px; }
  .booking-page .rating-row{ display:flex; align-items:center; gap:6px; font-size:.85rem; font-weight:600; margin-bottom:6px; }
  .booking-page .rating-row svg, .booking-page .reviews-header svg, .booking-page .widget-rating svg{ width:13px; height:13px; color:var(--red); }
  .booking-page .listing-loc{ display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:12px; font-size:.85rem; color:var(--muted); }
  .booking-page .listing-loc svg{ width:14px; height:14px; }
  .booking-page .map-link-inline{ color:var(--red); font-weight:600; padding-left:8px; border-left:1px solid var(--line-strong); }
  @media (hover:hover){ .booking-page .map-link-inline:hover{ text-decoration:underline; } }
  .booking-page .badge-row, .booking-page .info-chip-row{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
  .booking-page .mini-badge{ display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:999px; background:var(--green-tint); color:var(--green-deep); font-size:.72rem; font-weight:600; }
  .booking-page .mini-badge svg{ width:12px; height:12px; }
  .booking-page .info-chip{ padding:5px 12px; border-radius:999px; background:var(--card); border:1px solid var(--line); font-size:.78rem; font-weight:500; }
  .booking-page .divider{ border:0; border-top:1px solid var(--line); margin:22px 0; }

  /* ---------- Host and about ---------- */
  .booking-page .host-about-row{ display:block; }
  .booking-page .host-card{
    display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
    padding:14px 16px; border-radius:16px; background:var(--card); border:1px solid var(--line); box-shadow:var(--card-shadow);
  }
  .booking-page .host-avatar{
    width:44px; height:44px; border-radius:50%; background:var(--red); color:#fff; flex-shrink:0; overflow:hidden;
    display:flex; align-items:center; justify-content:center; font-weight:700; font-size:.9rem;
  }
  .booking-page .host-avatar img{ width:100%; height:100%; object-fit:cover; }
  .booking-page .host-avatar-link{ transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  .booking-page .host-avatar-link:active{ transform:scale(var(--press-scale,.97)); }
  .booking-page .host-name{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:.9rem; font-weight:600; }
  .booking-page .host-name svg{ width:14px; height:14px; color:var(--red); }
  .booking-page .contact-controls{ display:flex; align-items:center; gap:8px; margin-left:auto; }
  .booking-page .contact-control{
    width:42px; height:42px; flex:0 0 42px; border-radius:50%; border:1px solid var(--line-strong); background:var(--card);
    display:inline-flex; align-items:center; justify-content:center; color:var(--ink);
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .contact-control img{ width:24px; height:24px; object-fit:contain; display:block; }
  .booking-page .contact-control svg{ width:19px; height:19px; }
  .booking-page .contact-control:not([aria-disabled="true"]):active{ transform:scale(.94); }
  @media (hover:hover){ .booking-page .contact-control:not([aria-disabled="true"]):not(:disabled):hover{ background:var(--ink); color:var(--card); } }
  .booking-page .contact-controls.is-owner .contact-control{ opacity:.5; }
  .booking-page .about-block{ margin-top:22px; }
  .booking-page .about-title, .booking-page .section-title{ font-size:1.05rem; font-weight:700; letter-spacing:-.01em; margin-bottom:8px; }
  .booking-page .about-text{ font-size:.92rem; line-height:1.6; color:var(--muted); }
  .booking-page .about-paragraph{ margin:0 0 10px; white-space:pre-wrap; overflow-wrap:break-word; }
  .booking-page .about-paragraph:last-child{ margin-bottom:0; }
  .booking-page .about-toggle-btn{ display:inline; margin-left:4px; color:var(--ink); font-weight:600; text-decoration:underline; text-underline-offset:2px; white-space:nowrap; }
  .booking-page .amenity-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px 16px; margin-top:4px; }
  @media (min-width:640px){ .booking-page .amenity-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
  .booking-page .amenity-item{ display:flex; align-items:center; gap:10px; font-size:.86rem; }
  .booking-page .amenity-item svg{ width:18px; height:18px; color:var(--ink); }
  .booking-page .about-block .section-title{ margin-top:22px !important; }

  /* Offices and shops */
  .booking-page .commercial-section{ margin-top:18px; }
  .booking-page .commercial-section + .commercial-section{ border-top:1px solid var(--line); padding-top:16px; }
  .booking-page .commercial-section-title{ font-size:.98rem; font-weight:700; margin-bottom:10px; }
  .booking-page .commercial-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px 16px; }
  @media (min-width:640px){ .booking-page .commercial-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); } }
  .booking-page .commercial-item dt{ color:var(--muted); font-size:.72rem; font-weight:600; }
  .booking-page .commercial-item dd{ margin-top:2px; font-size:.86rem; overflow-wrap:anywhere; }
  .booking-page .commercial-list{ padding-left:18px; list-style:disc; color:var(--muted); font-size:.86rem; line-height:1.55; }
  .booking-page .commercial-note{ margin-top:8px; color:var(--muted); font-size:.82rem; line-height:1.45; }
  .booking-page .commercial-disclosure{ margin-top:10px; padding:10px 12px; border-radius:12px; background:var(--green-tint); color:var(--green-deep); font-size:.8rem; }

  /* ---------- Reviews ---------- */
  .booking-page .reviews-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
  .booking-page .reviews-header .section-title{ display:flex; align-items:center; gap:6px; margin-bottom:0; }
  .booking-page .review-strip{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:12px; }
  .booking-page .review-card{ padding:14px; border-radius:16px; background:var(--card); border:1px solid var(--line); box-shadow:var(--card-shadow); }
  .booking-page .review-top{ display:flex; align-items:center; gap:10px; margin-bottom:8px; }
  .booking-page .review-avatar{ width:32px; height:32px; border-radius:50%; background:var(--soft); display:flex; align-items:center; justify-content:center; font-size:.7rem; font-weight:700; overflow:hidden; }
  .booking-page .review-avatar img{ width:100%; height:100%; object-fit:cover; }
  .booking-page .review-name{ font-size:.86rem; font-weight:600; }
  .booking-page .review-time{ font-size:.72rem; color:var(--muted); }
  .booking-page .review-stars{ display:flex; gap:2px; color:var(--red); margin-bottom:6px; }
  .booking-page .review-stars svg{ width:12px; height:12px; }
  .booking-page .review-text{ font-size:.84rem; line-height:1.45; color:var(--muted); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .booking-page .reviews-state{ grid-column:1 / -1; color:var(--muted); font-size:.85rem; padding:8px 0; }
  .booking-page .reviews-empty{ grid-column:1 / -1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:24px 16px; border-radius:16px; background:var(--card); border:1px solid var(--line); text-align:center; }
  .booking-page .reviews-empty-stars{ display:flex; gap:5px; margin-bottom:6px; }
  .booking-page .reviews-empty-stars svg{ width:22px; height:22px; fill:transparent; stroke:var(--line-strong); stroke-width:1.6; stroke-linejoin:round;
    transition:fill var(--motion-emphasis,300ms) var(--ease-out,ease), stroke var(--motion-emphasis,300ms) var(--ease-out,ease), transform var(--motion-emphasis,300ms) var(--ease-out,ease);
    transition-delay:calc(var(--i, 0) * 30ms); }
  .booking-page .reviews-empty.is-seen .reviews-empty-stars svg{ fill:var(--red-tint); stroke:var(--red); transform:scale(1.08); }
  .booking-page .reviews-empty-title{ font-size:.95rem; font-weight:700; }
  .booking-page .reviews-empty-text{ max-width:340px; font-size:.84rem; line-height:1.45; color:var(--muted); }

  /* ---------- Booking widget ---------- */
  .booking-page .booking-widget{ padding:20px; border-radius:20px; background:var(--card); border:1px solid var(--line); box-shadow:var(--widget-shadow); }
  .booking-page .widget-price-row{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:4px; }
  .booking-page .widget-price{ font-size:1.4rem; font-weight:700; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .booking-page .widget-price span{ font-size:.85rem; font-weight:500; color:var(--muted); letter-spacing:0; }
  .booking-page .widget-rating{ display:flex; align-items:center; gap:4px; font-size:.82rem; font-weight:600; }
  .booking-page .widget-rating-count{ color:var(--muted); font-weight:400; }
  .booking-page .new-badge{ display:inline-flex; align-items:center; padding:3px 10px; border-radius:999px; background:var(--soft); font-size:.72rem; font-weight:600; }
  .booking-page .picker-title{ margin-top:16px; margin-bottom:2px; font-size:1.02rem; font-weight:700; }
  .booking-page .picker-sub{ margin-bottom:12px; font-size:.82rem; line-height:1.45; color:var(--muted); }

  /* Room / Table (hotels taking both) */
  .booking-page .mode-switch{ position:relative; display:grid; grid-template-columns:1fr 1fr; gap:2px; margin-top:14px; padding:3px; border-radius:999px; background:var(--soft); }
  .booking-page .mode-pill{ position:absolute; top:3px; bottom:3px; left:3px; width:calc(50% - 4px); border-radius:999px; background:var(--card); box-shadow:0 1px 3px rgba(0,0,0,.12); transition:transform var(--motion-quick,200ms) var(--ease-in-out,ease); }
  .booking-page .mode-switch[data-mode="table"] .mode-pill{ transform:translateX(calc(100% + 2px)); }
  .booking-page .mode-switch button{ position:relative; z-index:1; height:34px; border-radius:999px; font-size:.85rem; font-weight:600; color:var(--muted); transition:color var(--motion-micro,150ms) var(--ease-out,ease); }
  .booking-page .mode-switch button[aria-selected="true"]{ color:var(--ink); }
  .booking-page .mode-view{ animation:booking-fade var(--motion-micro,150ms) var(--ease-out,ease) both; }
  @keyframes booking-fade{ from{ opacity:0; } to{ opacity:1; } }

  /* Fields */
  .booking-page .field{ display:flex; flex-direction:column; gap:6px; margin-top:12px; }
  .booking-page .field label, .booking-page .sheet-label{ font-size:.8rem; font-weight:600; }
  .booking-page .field-hint{ font-size:.75rem; color:var(--muted); }
  .booking-page :is(input, select, textarea):not([type="checkbox"]){
    width:100%; min-height:42px; padding:9px 12px; border-radius:12px; border:1px solid var(--line-strong);
    background:var(--card); color:var(--ink); font:inherit; font-size:.9rem; outline:none; color-scheme:light dark;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease);
  }
  .booking-page :is(input, select, textarea):focus{ border-color:var(--ink); }
  .booking-page input[readonly]{ background:var(--soft); color:var(--muted); }
  .booking-page textarea{ min-height:80px; resize:vertical; }

  /* Calendar */
  .booking-page .cal{ margin-top:4px; }
  .booking-page .cal-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .booking-page .cal-title{ font-size:.95rem; font-weight:700; }
  .booking-page .cal-nav{ display:flex; gap:6px; }
  .booking-page .cal-nav button{
    width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:1px solid var(--line-strong);
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .cal-nav button:disabled{ opacity:.3; }
  .booking-page .cal-nav button:not(:disabled):active{ transform:scale(.92); }
  @media (hover:hover){ .booking-page .cal-nav button:not(:disabled):hover{ background:var(--soft); } }
  .booking-page .cal-nav svg{ width:14px; height:14px; }
  .booking-page .cal-dows, .booking-page .cal-grid{ display:grid; grid-template-columns:repeat(7, 1fr); }
  .booking-page .cal-dow{ padding:4px 0; text-align:center; font-size:.68rem; font-weight:600; color:var(--muted); }
  .booking-page .cal-grid{ row-gap:4px; overflow:hidden; }
  .booking-page .cal-grid.slide-next{ animation:cal-in-next var(--motion-quick,200ms) var(--ease-out,ease) both; }
  .booking-page .cal-grid.slide-prev{ animation:cal-in-prev var(--motion-quick,200ms) var(--ease-out,ease) both; }
  @keyframes cal-in-next{ from{ opacity:0; transform:translateX(16px); } to{ opacity:1; transform:none; } }
  @keyframes cal-in-prev{ from{ opacity:0; transform:translateX(-16px); } to{ opacity:1; transform:none; } }
  .booking-page .cal-day{ position:relative; height:40px; display:flex; align-items:center; justify-content:center; font-size:.85rem; font-variant-numeric:tabular-nums; }
  .booking-page .cal-day > span{
    position:relative; z-index:1; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .cal-day.empty{ visibility:hidden; }
  .booking-page .cal-day.open > span{ background:var(--green-tint); color:var(--ink); font-weight:600; }
  @media (hover:hover){ .booking-page .cal-day.open:hover > span{ background:var(--green-tint-strong); } }
  .booking-page .cal-day.open:active > span{ transform:scale(.92); }
  .booking-page .cal-day.closed > span{ color:var(--muted); opacity:.45; }
  .booking-page .cal-day.booked > span{ text-decoration:line-through; text-decoration-thickness:1px; }
  .booking-page .cal-day.checkout > span{ color:var(--ink); opacity:1; text-decoration:none; box-shadow:inset 0 0 0 1.5px var(--green-tint-strong); }
  @media (hover:hover){ .booking-page .cal-day.checkout:hover > span{ background:var(--green-tint); } }
  .booking-page .cal-day.today > span{ box-shadow:inset 0 0 0 1.5px var(--line-strong); }
  /* The chosen stay: one band from check-in to check-out, the two days as red circles. */
  .booking-page .cal-day.in-range::before, .booking-page .cal-day.range-start::before, .booking-page .cal-day.range-last::before{
    content:''; position:absolute; top:2px; bottom:2px; left:0; right:0; background:var(--range);
  }
  .booking-page .cal-day.range-start::before{ left:50%; }
  .booking-page .cal-day.range-last::before{ right:50%; }
  .booking-page .cal-day.in-range > span{ background:transparent; color:var(--ink); }
  .booking-page .cal-day.range-end > span{ background:var(--red); color:#fff; font-weight:700; opacity:1; }
  .booking-page .cal-legend{ display:flex; flex-wrap:wrap; gap:12px; margin-top:10px; font-size:.72rem; color:var(--muted); }
  .booking-page .cal-legend .dot{ display:inline-block; width:8px; height:8px; margin-right:5px; border-radius:50%; vertical-align:middle; }
  .booking-page .cal-legend .dot-open{ background:var(--green); }
  .booking-page .cal-legend .dot-selected{ background:var(--red); }
  .booking-page .cal-legend .dot-closed{ background:var(--line-strong); }
  .booking-page .range-summary{ margin-top:10px; font-size:.88rem; font-weight:600; }
  .booking-page .range-note{ margin-top:4px; font-size:.8rem; color:var(--red); }

  /* Guests */
  .booking-page .guest-field{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; padding:12px 0; border-top:1px solid var(--line); }
  .booking-page .guest-label{ display:block; font-size:.9rem; font-weight:600; }
  .booking-page .guest-hint{ display:block; font-size:.75rem; color:var(--muted); }
  .booking-page .stepper{ display:flex; align-items:center; gap:10px; }
  .booking-page .stepper button{
    width:34px; height:34px; border-radius:50%; border:1px solid var(--line-strong); font-size:1.1rem; line-height:1;
    display:flex; align-items:center; justify-content:center; transition:opacity var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  .booking-page .stepper button:disabled{ opacity:.3; }
  .booking-page .stepper button:not(:disabled):active{ transform:scale(.92); }
  .booking-page .stepper output{ min-width:20px; text-align:center; font-weight:600; font-variant-numeric:tabular-nums; }

  /* Hotel check-in facts */
  .booking-page .stay-facts{ margin-top:4px; border-top:1px solid var(--line); }
  .booking-page .stay-facts li{ display:flex; justify-content:space-between; gap:12px; padding:9px 0; font-size:.84rem; border-bottom:1px solid var(--line); }
  .booking-page .stay-facts li span:first-child{ color:var(--muted); }

  /* Price summary: opens once something is priced (C5, grid rows). */
  .booking-page .details-wrap{ display:grid; grid-template-rows:0fr; opacity:0; transition:grid-template-rows var(--motion-standard,250ms) var(--ease-in-out,ease), opacity var(--motion-quick,200ms) var(--ease-out,ease); }
  .booking-page .details-wrap.open{ grid-template-rows:1fr; opacity:1; }
  .booking-page .details-wrap > .details-box{ min-height:0; overflow:hidden; }
  .booking-page .details-box{ font-size:.88rem; }
  .booking-page .details-wrap.open .details-box{ margin-top:14px; padding:12px 14px; border-radius:14px; background:var(--soft); }
  .booking-page .details-row{ display:flex; justify-content:space-between; gap:12px; padding:3px 0; font-variant-numeric:tabular-nums; }
  .booking-page .details-row.total{ margin-top:6px; padding-top:9px; border-top:1px solid var(--line-strong); font-weight:700; }
  .booking-page .details-label{ color:var(--muted); }

  /* Buttons and notes */
  .booking-page .confirm-btn{
    position:relative; overflow:hidden; width:100%; min-height:48px; margin-top:16px; padding:0 20px; border-radius:999px;
    background:var(--red); color:#fff; font-size:.95rem; font-weight:700;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease);
  }
  @media (hover:hover){ .booking-page .confirm-btn:not(:disabled):hover{ background:var(--red-deep); } }
  .booking-page .confirm-btn:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  .booking-page .confirm-btn:disabled{ background:var(--soft-2); color:var(--muted); }
  .booking-page .confirm-btn.cta-sending:disabled, .booking-page .confirm-btn.cta-sent:disabled{ background:var(--red); color:#fff; }
  .booking-page .confirm-btn.cta-sending{ cursor:wait; }
  .booking-page .confirm-btn.cta-sent{ pointer-events:none; }
  .booking-page .cta-progress{ position:absolute; inset:0; background:var(--green); border-radius:inherit; transform:scaleX(0); transform-origin:left center; pointer-events:none; z-index:0; }
  .booking-page .cta-airplane{ position:absolute; top:50%; left:8px; z-index:1; transform:translateY(-50%); opacity:0; display:flex; pointer-events:none; }
  .booking-page .confirm-btn.cta-sending .cta-airplane{ opacity:1; }
  .booking-page .cta-airplane svg{ width:18px; height:18px; transform:rotate(-45deg); }
  .booking-page .cta-label{ position:relative; z-index:1; }
  .booking-page .form-note{ margin-top:10px; font-size:.78rem; line-height:1.45; color:var(--muted); text-align:center; }
  .booking-page .success-msg{ margin-top:12px; padding:12px 14px; border-radius:14px; font-size:.86rem; line-height:1.45; }
  .booking-page .success-msg.error{ background:var(--red-tint); color:var(--red); }
  .booking-page .sent-card{ display:flex; flex-direction:column; align-items:center; gap:8px; margin-top:16px; padding:18px 16px; border-radius:16px; background:var(--green-tint); text-align:center; animation:booking-rise var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .booking-page .sent-card p{ font-size:.88rem; line-height:1.45; }
  .booking-page .sent-check{ width:40px; height:40px; border-radius:50%; background:var(--green); color:#fff; display:flex; align-items:center; justify-content:center; }
  .booking-page .sent-check svg{ width:22px; height:22px; }
  .booking-page .sent-check path{ stroke-dasharray:1; stroke-dashoffset:0; animation:booking-draw var(--motion-emphasis,300ms) var(--ease-out,ease) 120ms both; }
  .booking-page .sent-link{ display:inline-flex; align-items:center; min-height:36px; padding:0 16px; border-radius:999px; background:var(--ink); color:var(--card) !important; font-size:.84rem; font-weight:600; }
  @keyframes booking-rise{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }
  @keyframes booking-draw{ from{ stroke-dashoffset:1; } to{ stroke-dashoffset:0; } }

  /* The owner's own listing */
  .booking-page .owner-note{ margin-top:16px; padding:14px 16px; border-radius:14px; background:var(--soft); font-size:.86rem; line-height:1.45; }
  .booking-page .owner-note p{ font-weight:600; }
  .booking-page .owner-note-link{ display:inline-flex; margin-top:10px; padding:8px 14px; border-radius:999px; background:var(--ink); color:var(--card) !important; font-size:.8rem; font-weight:600; transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  .booking-page .owner-note-link:active{ transform:scale(var(--press-scale,.97)); }
  .booking-page .owner-note--contact{ flex-basis:100%; margin-top:0; padding:0; background:transparent; color:var(--muted); font-size:.78rem; font-weight:400; }

  /* Properties: Buy / Rent (animation.md §8.1) */
  .booking-page .property-purpose-selector{ position:relative; display:flex; gap:2px; padding:3px; margin-bottom:14px; border-radius:999px; background:var(--soft); }
  .booking-page .property-purpose-pill{ position:absolute; top:3px; bottom:3px; left:3px; width:calc(50% - 4px); border-radius:999px; background:var(--card); box-shadow:0 1px 3px rgba(0,0,0,.12);
    opacity:0; pointer-events:none; transition:transform var(--motion-quick,200ms) var(--ease-in-out,ease), opacity var(--motion-micro,150ms) var(--ease-out,ease); }
  .booking-page .property-purpose-selector[data-view="sale"] .property-purpose-pill{ opacity:1; transform:none; }
  .booking-page .property-purpose-selector[data-view="rent"] .property-purpose-pill{ opacity:1; transform:translateX(calc(100% + 2px)); }
  .booking-page .property-purpose-option{ position:relative; z-index:1; flex:1; display:flex; align-items:center; justify-content:center; gap:6px; height:34px; border-radius:999px; font-size:.84rem; font-weight:600; color:var(--muted);
    transition:color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  .booking-page .property-purpose-option.active{ color:var(--ink); }
  .booking-page button.property-purpose-option:active{ transform:scale(var(--press-scale,.97)); }
  .booking-page .property-purpose-selector.is-single .property-purpose-option{ color:var(--ink); cursor:default; }
  .booking-page .property-purpose-option svg{ width:16px; height:16px; }
  .booking-page .property-view{ animation:booking-fade var(--motion-micro,150ms) var(--ease-out,ease) both; }
  .booking-page .property-price-section{ padding:4px 0 14px; }
  .booking-page .property-price-section + .property-price-section{ border-top:1px solid var(--line); padding-top:14px; }
  .booking-page .property-price-label{ display:flex; align-items:center; gap:8px; margin-bottom:4px; font-size:.82rem; color:var(--muted); }
  .booking-page .property-price-label svg, .booking-page .property-policy-title svg{ width:17px; height:17px; }
  .booking-page .property-price-value{ font-size:1.3rem; font-weight:700; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
  .booking-page .property-price-value span{ font-size:.85rem; font-weight:500; color:var(--muted); }
  .booking-page .property-rent-terms{ margin-top:4px; font-size:.84rem; color:var(--muted); }
  .booking-page .property-price-missing, .booking-page .property-policy-empty{ color:var(--muted); font-size:.82rem; font-weight:400; }
  .booking-page .property-units{ display:grid; grid-template-columns:1fr 1fr; margin-bottom:6px; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .booking-page .property-unit-item{ display:flex; align-items:flex-start; gap:8px; padding:12px 4px; min-width:0; }
  .booking-page .property-unit-item + .property-unit-item{ border-left:1px solid var(--line); padding-left:12px; }
  .booking-page .property-unit-item svg{ width:18px; height:18px; margin-top:1px; }
  .booking-page .property-unit-item strong, .booking-page .property-unit-item span{ display:block; font-size:.82rem; line-height:1.35; }
  .booking-page .property-unit-item span{ color:var(--muted); font-size:.74rem; }
  .booking-page .property-policy{ margin-top:16px; padding-top:14px; border-top:1px solid var(--line); }
  .booking-page .property-policy-title{ display:flex; align-items:center; gap:8px; margin-bottom:8px; font-size:.92rem; font-weight:700; }
  .booking-page .property-policy-details{ display:grid; gap:8px; margin-bottom:10px; }
  .booking-page .property-policy-row dt{ color:var(--muted); font-size:.74rem; font-weight:600; }
  .booking-page .property-policy-row dd{ margin-top:2px; font-size:.84rem; line-height:1.45; white-space:pre-wrap; overflow-wrap:anywhere; }
  .booking-page .property-policy-link{ display:flex; align-items:center; gap:10px; padding:10px 12px; margin-top:8px; border-radius:12px; background:var(--soft); }
  .booking-page .property-policy-icon{ width:22px; height:26px; color:var(--green); }
  .booking-page .property-policy-name{ min-width:0; overflow-wrap:anywhere; font-size:.82rem; font-weight:600; }
  .booking-page .property-policy-action{ display:block; margin-top:2px; color:var(--muted); font-size:.72rem; font-weight:400; }
  .booking-page .property-policy-download{ display:inline-block; margin-top:8px; font-size:.8rem; font-weight:600; text-decoration:underline; }
  .booking-page .property-purchase-btn{ width:100%; min-height:46px; margin-top:10px; border-radius:999px; border:1px solid var(--line-strong); font-size:.9rem; font-weight:700;
    transition:background var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  .booking-page .property-purchase-btn:active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ .booking-page .property-purchase-btn:not(.property-purchase-primary):hover{ background:var(--soft); } }
  .booking-page .property-purchase-btn.property-purchase-primary{ border-color:var(--red); background:var(--red); color:#fff; }

  /* ---------- Phone bar and toast ---------- */
  .booking-page .phone-bar{
    position:fixed; left:0; right:0; bottom:0; z-index:40; display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:12px 16px calc(12px + env(safe-area-inset-bottom)); background:var(--card); border-top:1px solid var(--line);
    box-shadow:0 -8px 24px -18px rgba(0,0,0,.35);
    transition:transform var(--motion-quick,200ms) var(--ease-out,ease), opacity var(--motion-quick,200ms) var(--ease-out,ease);
  }
  .booking-page .phone-bar.is-hidden{ transform:translateY(110%); opacity:0; transition-timing-function:var(--ease-in,ease); }
  .booking-page .phone-bar-price{ min-width:0; }
  .booking-page .phone-bar-price strong{ display:block; font-size:1rem; font-variant-numeric:tabular-nums; }
  .booking-page .phone-bar-price span{ display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.76rem; color:var(--muted); }
  .booking-page .phone-bar-btn{ flex-shrink:0; min-height:44px; padding:0 20px; border-radius:999px; background:var(--red); color:#fff; font-size:.9rem; font-weight:700; transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  .booking-page .phone-bar-btn:active{ transform:scale(var(--press-scale,.97)); }
  @media (min-width:960px){ .booking-page .phone-bar{ display:none; } }
  .booking-page .booking-toast{
    position:fixed; left:50%; bottom:calc(88px + env(safe-area-inset-bottom)); z-index:60; max-width:calc(100% - 32px);
    padding:11px 18px; border-radius:999px; background:var(--ink); color:var(--paper); font-size:.86rem; font-weight:600;
    opacity:0; pointer-events:none; transform:translate(-50%, 12px);
    transition:opacity var(--motion-micro,150ms) var(--ease-in,ease), transform var(--motion-micro,150ms) var(--ease-in,ease);
  }
  .booking-page .booking-toast.show{ opacity:1; transform:translate(-50%, 0); transition-duration:var(--motion-quick,200ms); transition-timing-function:var(--ease-out,ease); }
  @media (min-width:960px){ .booking-page .booking-toast{ bottom:24px; } }

  /* ---------- Table reservation sheet ---------- */
  .booking-layer.booking-page{ background:transparent; }
  .booking-page .sheet-overlay{
    position:fixed; inset:0; z-index:1000; display:flex; align-items:flex-end; justify-content:center;
    background:rgba(20,16,14,.42); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
    animation:booking-fade var(--motion-quick,200ms) var(--ease-out,ease) both;
  }
  .booking-page .sheet{
    width:100%; max-width:480px; max-height:92vh; overflow:auto; padding:20px 20px calc(20px + env(safe-area-inset-bottom));
    border-radius:22px 22px 0 0; background:var(--card); color:var(--ink); box-shadow:0 24px 70px rgba(0,0,0,.28);
    animation:sheet-up var(--motion-standard,250ms) var(--ease-out,ease) both;
  }
  @keyframes sheet-up{ from{ transform:translateY(24px); opacity:0; } to{ transform:none; opacity:1; } }
  @media (min-width:640px){
    .booking-page .sheet-overlay{ align-items:center; padding:16px; }
    .booking-page .sheet{ border-radius:22px; }
  }
  .booking-page .sheet-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:6px; }
  .booking-page .sheet-head h2, .booking-page .sheet-sent h2{ font-size:1.2rem; font-weight:700; }
  .booking-page .sheet-head p, .booking-page .sheet-sent p{ margin-top:4px; color:var(--muted); font-size:.86rem; }
  .booking-page .sheet-close{ width:34px; height:34px; border-radius:50%; background:var(--soft); display:flex; align-items:center; justify-content:center; }
  .booking-page .sheet-close svg{ width:16px; height:16px; }
  .booking-page .sheet-label{ display:block; margin:12px 0 6px; }
  .booking-page .sheet-pair{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .booking-page .sheet-check{ display:flex; align-items:center; gap:8px; margin:14px 0 8px; font-size:.88rem; }
  .booking-page .sheet-check input{ width:18px; height:18px; accent-color:var(--red); }
  .booking-page .sheet-error{ min-height:1.1rem; margin:10px 0 0; color:var(--red); font-size:.82rem; }
  .booking-page .sheet .confirm-btn{ margin-top:8px; }
  .booking-page .sheet-sent{ display:flex; flex-direction:column; align-items:center; gap:6px; text-align:center; padding:8px 0; }

  /* ---------- Skeleton ---------- */
  .booking-page .skel{ position:relative; overflow:hidden; background:var(--skel-base); border-radius:8px; }
  .booking-page .skel::after{ content:''; position:absolute; inset:0; background:linear-gradient(100deg, transparent 30%, var(--skel-shine) 50%, transparent 70%); animation:skel-sweep 1.4s ease-in-out infinite; }
  @keyframes skel-sweep{ 0%{ transform:translateX(-100%); } 100%{ transform:translateX(100%); } }
  .booking-page .skel-shell{ display:block; max-width:640px; margin:0 auto; }
  .booking-page .skel-shell > div:first-child > :not(.skel-gallery){ margin-left:20px; margin-right:20px; }
  .booking-page .skel-gallery{ height:clamp(300px, 56svh, 430px); border-radius:0 0 28px 28px; margin-bottom:20px; }
  .booking-page .skel-line{ height:.7rem; border-radius:6px; margin-bottom:.5rem; }
  .booking-page .skel-line.w-60{ width:60%; } .booking-page .skel-line.w-40{ width:40%; } .booking-page .skel-line.w-90{ width:90%; } .booking-page .skel-line.w-100{ width:100%; }
  .booking-page .skel-line.tall{ height:1.3rem; }
  .booking-page .skel-avatar{ width:44px; height:44px; border-radius:50%; }
  .booking-page .skel-card{ margin:20px 16px 0; padding:20px; border-radius:20px; background:var(--card); border:1px solid var(--line); }
  .booking-page .skel-cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin:12px 0; }
  .booking-page .skel-cal-cell{ aspect-ratio:1/1; border-radius:50%; }
  .booking-page .skel-button{ height:48px; border-radius:999px; margin-top:12px; }
  @media (min-width:960px){
    .booking-page .skel-shell{ display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,400px); gap:32px; max-width:1240px; height:100%; padding:20px 32px 0; overflow:hidden; }
    .booking-page .skel-shell > div:first-child > :not(.skel-gallery){ margin-left:0; margin-right:0; }
    .booking-page .skel-gallery{ height:auto; aspect-ratio:16 / 9; border-radius:20px; }
    .booking-page .skel-card{ margin:0; align-self:start; }
  }

  /* ---------- Reduced motion ---------- */
  @media (prefers-reduced-motion:reduce){
    .booking-page *, .booking-page *::before, .booking-page *::after{ animation-duration:1ms !important; animation-delay:0ms !important; transition-duration:1ms !important; transition-delay:0ms !important; }
    .booking-page .skel::after{ animation:none; }
    .booking-page :is(button, a):active{ transform:none !important; }
  }
`;
