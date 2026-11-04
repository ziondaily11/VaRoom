// Styles for /list (the listing wizard), ported unchanged from
// legacy-pages/list.html (this style exists only while the page is mounted).

export const LIST_WIZARD_STYLES = `
  :root{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;

    /* Wizard-specific tokens. Fixed editorial palette — intentionally not
       swapped by the light/dark theme toggle, which only affects the
       surrounding site chrome (header, success/error states). */
    --wz-dark:#1B120F;
    --wz-dark-2:#241B18;
    --wz-dark-border:rgba(255,255,255,.10);
    --wz-cream:#F4E9DC;
    --wz-cream-2:#EBDCC9;
    --wz-cream-border:rgba(26,18,16,.12);
    --wz-ink-onlight:#241A16;
    --wz-cream-text-muted:#6b584c;
  }
  [data-theme="dark"]{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b;
  }
  *{ margin:0; padding:0; box-sizing:border-box; }
  body{ font-family:var(--font-body); background:var(--paper); color:var(--ink); min-height:100vh; transition:background .2s ease, color .2s ease; }
  a{ color:inherit; text-decoration:none; }
  button{ font-family:inherit; cursor:pointer; border:none; background:none; }
  :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }

  header{ display:flex; align-items:center; justify-content:space-between; padding:1.5rem 2.5rem; }
  .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.55rem; display:flex; align-items:baseline; }
  .logo .va{ color:var(--red); }
  .back-link{ font-size:.9rem; font-weight:500; }
  .back-link:hover{ color:var(--red); }

  .checking-msg{ text-align:center; padding:6rem 0; color:var(--muted); }

  /* ============ WIZARD SHELL ============ */
  .wizard{ background:#090909; min-height:100vh; padding:0 0 3rem; }
  .wizard-top-nav{ display:flex; align-items:center; justify-content:space-between; padding:1.4rem 2.5rem; }
  .wizard-top-nav .logo{ color:#F5EFEC; }
  .wizard-top-nav .logo .va{ color:var(--red); }
  .wizard-top-nav .back-link{ font-size:.88rem; color:#B8ACA8; }
  .wizard-top-nav .back-link:hover{ color:#fff; }
  .wizard-correction-nav{ display:none; }

  .wizard-shell{ max-width:1240px; margin:.5rem auto 0; padding:0 2.2vw; }

  .step-frame{ display:none; }
  .step-frame.active{ display:grid; grid-template-columns:minmax(340px,460px) 1fr; border-radius:22px; overflow:hidden; min-height:640px; box-shadow:0 30px 70px rgba(0,0,0,.45); }

  /* -- Panel tones -- */
  .step-panel{ padding:2.6rem 2.6rem 2.4rem; display:flex; flex-direction:column; }
  .tone-dark .step-panel{ background:var(--wz-dark); color:#F5EFEC; }
  .tone-cream .step-panel{ background:var(--wz-cream); color:var(--wz-ink-onlight); }
  .tone-red .step-panel{ background:var(--red); color:#fff; }

  .panel-brand{ display:flex; align-items:center; gap:.5rem; font-family:var(--font-brand); font-weight:800; font-size:1.05rem; margin-bottom:1.9rem; }
  .panel-brand .roof{ width:0; height:0; border-left:7px solid transparent; border-right:7px solid transparent; border-bottom:10px solid var(--red); }
  .tone-red .panel-brand .roof{ border-bottom-color:#fff; }
  .tone-dark .panel-brand{ color:#F5EFEC; }
  .tone-cream .panel-brand{ color:var(--wz-ink-onlight); }
  .tone-red .panel-brand{ color:#fff; }

  .progress-row{ display:flex; align-items:center; gap:.9rem; margin-bottom:1.8rem; }
  .progress-ring{ position:relative; width:60px; height:60px; border-radius:50%; flex:none;
    background:conic-gradient(var(--ring-fg) calc(var(--pct) * 3.6deg), var(--ring-bg) 0deg); }
  .progress-ring::after{ content:''; position:absolute; inset:6px; border-radius:50%; background:var(--ring-hole); }
  .progress-ring span{ position:relative; z-index:1; display:flex; align-items:center; justify-content:center; width:100%; height:100%; font-size:.72rem; font-weight:700; }
  .tone-dark .progress-ring{ --ring-fg:var(--red); --ring-bg:rgba(255,255,255,.14); --ring-hole:var(--wz-dark); }
  .tone-cream .progress-ring{ --ring-fg:var(--red); --ring-bg:rgba(26,18,16,.12); --ring-hole:var(--wz-cream); }
  .tone-red .progress-ring{ --ring-fg:#fff; --ring-bg:rgba(255,255,255,.28); --ring-hole:var(--red); }

  .progress-text{ font-size:.78rem; }
  .progress-text .step-count{ font-weight:700; }
  .tone-dark .progress-text{ color:#D8CBC6; }
  .tone-cream .progress-text{ color:var(--wz-cream-text-muted); }
  .tone-red .progress-text{ color:rgba(255,255,255,.85); }

  .step-eyebrow{ font-size:.78rem; font-weight:700; letter-spacing:.13em; text-transform:uppercase; margin-bottom:.6rem; }
  .tone-dark .step-eyebrow, .tone-red .step-eyebrow{ color:rgba(255,255,255,.65); }
  .tone-cream .step-eyebrow{ color:var(--red-deep); }

  .step-title{ font-family:var(--font-display); font-weight:600; font-size:clamp(1.65rem,2.6vw,2.05rem); line-height:1.12; margin-bottom:.6rem; }
  .step-sub{ font-size:.92rem; line-height:1.55; margin-bottom:1.7rem; }
  .tone-dark .step-sub{ color:#C9BDB8; }
  .tone-cream .step-sub{ color:var(--wz-cream-text-muted); }
  .tone-red .step-sub{ color:rgba(255,255,255,.88); }

  .step-fields{ flex:1; }
  .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1.05rem; }
  .field:last-child{ margin-bottom:0; }
  .field-row{ display:grid; grid-template-columns:1fr 1fr; gap:.7rem; }
  label{ font-size:.85rem; font-weight:600; }
  input, textarea, select{
    font-family:inherit; font-size:.93rem; padding:.72rem .85rem;
    border-radius:10px; width:100%; border:1px solid transparent;
  }
  .tone-dark input, .tone-dark textarea, .tone-dark select{ background:var(--wz-dark-2); color:#F5EFEC; border-color:var(--wz-dark-border); }
  .tone-dark input::placeholder, .tone-dark textarea::placeholder{ color:#8d7d78; }
  .tone-cream input, .tone-cream textarea, .tone-cream select{ background:#fff; color:var(--wz-ink-onlight); border-color:var(--wz-cream-border); }
  .tone-red input, .tone-red textarea, .tone-red select{ background:rgba(255,255,255,.14); color:#fff; border-color:rgba(255,255,255,.3); }
  .tone-red input::placeholder{ color:rgba(255,255,255,.65); }
  textarea{ resize:vertical; min-height:80px; }
  input:focus, textarea:focus, select:focus{ outline:none; border-color:currentColor; }

  .checkbox-row{ display:flex; align-items:center; gap:.6rem; }
  .checkbox-row input{ width:auto; }
  .checkbox-row label{ font-weight:500; }

  /* -- Step nav buttons -- */
  .panel-actions{ display:flex; align-items:center; gap:.9rem; margin-top:1.6rem; }
  .step-btn{ padding:.9rem 1.4rem; border-radius:100px; font-weight:600; font-size:.9rem; display:inline-flex; align-items:center; gap:.4rem; white-space:nowrap; }
  .step-btn.next{ background:var(--red); color:#fff; flex:1; justify-content:center; }
  .step-btn.next:hover{ background:var(--red-deep); }
  .tone-red .step-btn.next{ background:#fff; color:var(--red-deep); }
  .tone-red .step-btn.next:hover{ background:#f2e4e4; }
  .step-btn.back{ background:transparent; font-weight:600; font-size:.86rem; }
  .tone-dark .step-btn.back{ color:#C9BDB8; }
  .tone-cream .step-btn.back{ color:var(--wz-cream-text-muted); }
  .tone-red .step-btn.back{ color:rgba(255,255,255,.85); }
  .step-btn.back:hover{ text-decoration:underline; }
  .step-btn:disabled{ opacity:.55; cursor:not-allowed; }

  /* ============ PHOTO SIDE PANEL ============ */
  .step-photo{ position:relative; background-size:cover; background-position:center; min-height:340px; }
  .step-photo::after{ content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.72) 100%); }
  .step-photo-badge{
    position:absolute; top:1.3rem; left:1.3rem; z-index:1; background:rgba(20,14,12,.72); color:#fff;
    font-size:.8rem; font-weight:600; padding:.5rem .9rem; border-radius:100px; display:flex; align-items:center; gap:.4rem;
    backdrop-filter:blur(4px);
  }
  .step-photo-badge .check{ color:#7ED6A5; font-weight:800; }
  .step-photo-caption{ position:absolute; left:1.6rem; right:1.6rem; bottom:1.6rem; z-index:1; color:#fff; }
  .step-photo-caption h3{ font-family:var(--font-display); font-weight:600; font-size:1.5rem; margin-bottom:.3rem; }
  .step-photo-caption p{ font-size:.88rem; color:rgba(255,255,255,.85); max-width:36ch; }

  /* ============ STEP TRACKER ============ */
  .step-tracker{ max-width:1240px; margin:2.2rem auto 0; padding:0 2.2vw; display:grid; grid-template-columns:repeat(5,1fr); gap:.8rem; }
  .tracker-item{ background:#17110F; border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:.85rem 1rem; cursor:default; }
  .tracker-item.completed{ cursor:pointer; }
  .tracker-item .t-num{ font-size:.72rem; font-weight:700; letter-spacing:.08em; color:#5c584f; display:block; margin-bottom:.15rem; }
  .tracker-item .t-label{ font-size:.83rem; font-weight:600; color:#8d7d78; }
  .tracker-item.active{ background:#241B18; border-color:rgba(196,30,58,.4); }
  .tracker-item.active .t-num{ color:var(--red); }
  .tracker-item.active .t-label{ color:#F5EFEC; }
  .tracker-item.completed .t-label{ color:#C9BDB8; }
  .tracker-item.completed .t-num:before{ content:'✓ '; color:#7ED6A5; }

  /* ============ GENERAL LOCATION (temporary map replacement) ============ */
  .location-help{ font-size:.82rem; line-height:1.45; color:var(--wz-cream-text-muted); margin-top:.05rem; }

  /* ============ PHOTOS STEP ============ */
  .photo-hint{ font-size:.78rem; margin-bottom:.9rem; }
  .tone-dark .photo-hint{ color:#B8ACA8; }
  .photo-dropzone{
    border:1.5px dashed var(--wz-dark-border); border-radius:12px; padding:1.2rem 1rem;
    text-align:center; font-size:.86rem; cursor:pointer; transition:border-color .2s ease; display:block;
  }
  .tone-dark .photo-dropzone{ color:#B8ACA8; }
  .photo-dropzone:hover, .photo-dropzone.dragover{ border-color:var(--red); }
  .photo-dropzone input[type="file"]{ display:none; }

  .photo-preview-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(76px, 1fr)); gap:.5rem; margin-top:.8rem; }
  .photo-thumb{ position:relative; border-radius:10px; overflow:hidden; aspect-ratio:1/1; background:var(--wz-dark-2); cursor:grab; }
  .photo-thumb:active{ cursor:grabbing; }
  .photo-thumb.drag-over{ outline:2px dashed var(--red); outline-offset:2px; }
  .photo-thumb img{ width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
  .photo-thumb .remove-photo{
    position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%;
    background:rgba(0,0,0,.75); color:#fff; font-size:.75rem; line-height:1;
    display:flex; align-items:center; justify-content:center;
  }
  .photo-thumb .remove-photo:hover{ background:var(--red); }
  .photo-thumb .cover-tag{
    position:absolute; bottom:4px; left:4px; background:var(--red); color:#fff; font-size:.62rem; font-weight:700;
    letter-spacing:.04em; text-transform:uppercase; padding:.2rem .45rem; border-radius:100px;
  }
  .photo-error{ font-size:.8rem; color:#ff9d9d; display:none; margin-top:.4rem; }
  .photo-error.show{ display:block; }

  .photo-thumb.add-tile{
    cursor:pointer; border:1.5px dashed var(--wz-dark-border); background:transparent;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.15rem;
    color:#B8ACA8; font-size:.62rem; font-weight:600; transition:border-color .2s ease, color .2s ease;
  }
  .photo-thumb.add-tile:hover{ border-color:var(--red); color:var(--red); }
  .photo-thumb.add-tile svg{ width:20px; height:20px; }

  .photo-lightbox{
    display:none; position:fixed; inset:0; z-index:400; background:rgba(10,7,6,.92);
    align-items:center; justify-content:center; padding:2rem;
  }
  .photo-lightbox.show{ display:flex; }
  .photo-lightbox-media{ max-width:92vw; max-height:86vh; }
  .photo-lightbox-media img, .photo-lightbox-media video{ max-width:92vw; max-height:86vh; display:block; border-radius:10px; }
  .photo-lightbox-close{
    position:fixed; top:1.4rem; right:1.4rem; width:40px; height:40px; border-radius:50%;
    background:rgba(255,255,255,.12); color:#fff; display:flex; align-items:center; justify-content:center;
  }
  .photo-lightbox-close:hover{ background:rgba(255,255,255,.24); }

  /* ============ AMENITIES ============ */
  .amenities-hint{ font-size:.78rem; margin-bottom:.8rem; }
  .tone-dark .amenities-hint{ color:#B8ACA8; }
  .amenities-grid{ display:grid; grid-template-columns:repeat(2, 1fr); gap:.6rem .8rem; }
  .amenities-grid.library-state-store{ position:absolute!important; width:1px!important; height:1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; }
  .amenities-library-open{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; min-height:3.1rem; padding:.75rem 1.2rem; border:1px solid rgba(255,255,255,.45); border-radius:12px; background:var(--red); color:#fff; font:inherit; font-size:.95rem; font-weight:600; cursor:pointer; transition:transform .18s ease,background .18s ease; }
  .amenities-library-open[hidden],.amenities-library-summary[hidden]{ display:none!important; }
  .amenities-library-open:hover{ background:var(--red-deep); transform:translateY(-1px); }
  .amenities-library-summary{ margin:.55rem 0 0; color:#c7c3c3; font-size:.78rem; line-height:1.45; }
  .amenities-library-summary[hidden]{ display:none!important; }
  .amenities-library-overlay{ position:absolute; inset:0; z-index:5; display:flex; align-items:center; justify-content:center; padding:clamp(.5rem,2vw,1.25rem); background:rgba(0,0,0,.22); }
  .amenities-library-overlay[hidden]{ display:none; }
  .amenities-library-dialog{ display:flex; flex-direction:column; width:min(100%,620px); max-height:min(92%,620px); min-height:0; overflow:hidden; border:1px solid rgba(255,255,255,.35); border-radius:16px; background:rgba(18,18,18,.68); color:#fff; box-shadow:0 18px 55px rgba(0,0,0,.4); backdrop-filter:blur(18px) saturate(135%); -webkit-backdrop-filter:blur(18px) saturate(135%); }
  .amenities-library-header{ padding:.85rem .9rem .6rem; }
  .amenities-library-title-row{ display:flex; align-items:center; justify-content:space-between; gap:.6rem; margin-bottom:.65rem; }
  .amenities-library-title{ margin:0; font-size:.94rem; font-weight:700; }
  .amenities-library-count{ color:#b9f5cd; font-size:.72rem; white-space:nowrap; }
  .amenities-library-search{ display:flex; align-items:center; gap:.5rem; min-height:2.55rem; padding:0 .75rem; border:1px solid rgba(255,255,255,.42); border-radius:10px; background:rgba(0,0,0,.42); color:#fff; }
  .amenities-library-search svg{ width:17px; height:17px; flex:none; opacity:.9; }
  .amenities-library-search input{ width:100%; min-width:0; border:0; outline:0; background:transparent; color:inherit; font:inherit; font-size:.82rem; }
  .amenities-library-search input::placeholder{ color:rgba(255,255,255,.72); }
  .amenities-library-categories{ display:flex; gap:.4rem; overflow-x:auto; padding:.65rem .9rem .55rem; scrollbar-width:thin; }
  .amenities-library-category{ flex:none; border:1px solid rgba(255,255,255,.26); border-radius:100px; padding:.38rem .66rem; background:rgba(0,0,0,.36); color:#fff; font:inherit; font-size:.7rem; font-weight:600; cursor:pointer; }
  .amenities-library-category[aria-pressed="true"]{ border-color:#17c96b; background:rgba(10,119,59,.42); }
  .amenities-library-options{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.48rem; overflow:auto; padding:.45rem .9rem .9rem; min-height:0; }
  .amenities-library-option{ display:flex; align-items:center; gap:.5rem; min-width:0; min-height:2.55rem; border:1px solid transparent; border-radius:9px; padding:.5rem .58rem; background:rgba(0,0,0,.72); color:#fff; text-align:left; font:inherit; font-size:.74rem; font-weight:600; cursor:pointer; transition:border-color .16s ease,background .16s ease; }
  .amenities-library-option:hover{ border-color:rgba(255,255,255,.55); }
  .amenities-library-option.selected{ border:2px solid #11c969; background:rgba(0,0,0,.9); padding:calc(.5rem - 1px) calc(.58rem - 1px); }
  .amenities-library-option svg{ flex:none; width:17px; height:17px; color:#fff; }
  .amenities-library-option span{ overflow:hidden; text-overflow:ellipsis; }
  .amenities-library-empty{ grid-column:1/-1; padding:1.2rem .4rem; color:rgba(255,255,255,.78); font-size:.82rem; text-align:center; }
  .amenities-library-footer{ display:flex; justify-content:flex-end; padding:.6rem .9rem .85rem; border-top:1px solid rgba(255,255,255,.18); }
  .amenities-library-header,.amenities-library-categories,.amenities-library-footer{ flex:0 0 auto; }
  .amenities-library-options{ flex:1 1 auto; min-height:0; align-content:start; grid-auto-rows:min-content; overflow-y:auto; overscroll-behavior:contain; }
  .amenities-library-done{ display:inline-flex; align-items:center; gap:.45rem; min-height:2.55rem; border:0; border-radius:100px; padding:.55rem 1.1rem; background:#050505; color:#20e66e; font:inherit; font-size:.82rem; font-weight:700; cursor:pointer; }
  .amenities-library-done:hover{ background:#101810; }
  @media(prefers-color-scheme:light){ .amenities-library-dialog{ background:rgba(19,19,19,.78); } }
  @media(max-width:680px){ .amenities-library-overlay{ align-items:flex-end; } .amenities-library-dialog{ max-height:min(82%,560px); } }
  @media(max-width:390px){ .amenities-library-options{ grid-template-columns:1fr; } }
  @media (min-width:520px){ .amenities-grid{ grid-template-columns:repeat(3, 1fr); } }
  .office-shop-section{ display:none; margin-top:1rem; }
  .office-shop-section.active{ display:block; }
  .office-shop-section .section-heading{ font-family:var(--font-display); font-size:1.15rem; margin:1.2rem 0 .45rem; }
  .office-shop-section .section-help{ font-size:.8rem; line-height:1.45; margin:-.1rem 0 .7rem; opacity:.78; }
  .office-shop-section .field-row{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.7rem; }
  .office-shop-section .option-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.45rem .7rem; }
  .office-shop-section .option-grid label{ display:flex; align-items:center; gap:.42rem; font-size:.82rem; cursor:pointer; }
  .office-shop-section .conditional[hidden]{ display:none; }
  .office-shop-type{ display:none; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.65rem; margin-bottom:1rem; }
  .office-shop-type.active{ display:grid; }
  .office-shop-type button{ border:1px solid rgba(255,255,255,.45); border-radius:10px; padding:.7rem; background:rgba(255,255,255,.14); color:inherit; text-align:left; cursor:pointer; }
  .office-shop-type button.selected{ border-color:#050505; background:#050505; color:#fff; }
  .office-shop-type button small{ display:block; margin-top:.18rem; opacity:.74; }
  @media (max-width:520px){ .office-shop-section .field-row,.office-shop-section .option-grid{ grid-template-columns:1fr; } }
  .amenity-check{
    display:flex; align-items:center; gap:.5rem; padding:.55rem .6rem; border-radius:10px;
    border:1px solid var(--wz-dark-border); cursor:pointer; font-size:.82rem; transition:border-color .2s ease, background .2s ease;
  }
  .amenity-check:hover{ border-color:var(--red); }
  .amenity-check input{ width:auto; accent-color:var(--red); flex-shrink:0; }
  .amenity-check svg{ width:16px; height:16px; color:var(--red); flex-shrink:0; }
  .amenity-check.checked{ border-color:var(--red); background:rgba(196,30,58,.12); }

  /* ============ PRICING STEP ============ */
  .price-preview{ margin-bottom:1.4rem; }
  .price-preview .amount{ font-family:var(--font-display); font-weight:700; font-size:2.3rem; line-height:1; }
  .price-preview .unit{ font-size:.95rem; font-weight:500; color:rgba(255,255,255,.85); }
  .booking-group{ display:none; }
  .booking-group.active{ display:block; }
  .hotel-offer-mode{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.55rem; margin:1.1rem 0 1.35rem; }
  .hotel-offer-mode[hidden]{ display:none; }
  .hotel-offer-option{ appearance:none; border:1px solid rgba(255,255,255,.3); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; padding:.85rem .65rem; text-align:left; cursor:pointer; font:inherit; }
  .hotel-offer-option strong,.hotel-offer-option small{ display:block; }
  .hotel-offer-option small{ margin-top:.25rem; opacity:.72; line-height:1.3; }
  .hotel-offer-option.selected{ background:var(--red); border-color:var(--red); color:#fff; }
  .hotel-dining-fields{ display:none; }
  .hotel-dining-fields.active{ display:block; }
  .booking-hint{ font-size:.8rem; margin-bottom:1rem; line-height:1.5; color:rgba(255,255,255,.8); }

  .cal-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:.7rem; }
  .cal-title{ font-weight:700; font-size:.9rem; }
  .cal-nav{ display:flex; gap:.4rem; }
  .cal-nav button{ width:28px; height:28px; border-radius:8px; background:rgba(255,255,255,.14); display:flex; align-items:center; justify-content:center; color:#fff; }
  .cal-nav button:hover{ background:rgba(255,255,255,.24); }
  .cal-quick{ display:flex; gap:.6rem; margin-bottom:.8rem; }
  .cal-quick button{ font-size:.75rem; font-weight:600; padding:.4rem .75rem; border-radius:100px; background:rgba(255,255,255,.14); color:#fff; }
  .cal-quick button:hover{ background:rgba(255,255,255,.24); }
  .cal-grid{ display:grid; grid-template-columns:repeat(7, 1fr); gap:.25rem; }
  .cal-dow{ font-size:.62rem; font-weight:700; color:rgba(255,255,255,.6); text-align:center; padding:.2rem 0; }
  .cal-day{
    aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;
    border-radius:7px; font-size:.75rem; background:rgba(255,255,255,.1); color:#fff;
    cursor:pointer; border:1.5px solid transparent;
  }
  .cal-day:hover{ border-color:#fff; }
  .cal-day.selected{ background:#2E7D32; color:#fff; }
  .cal-day.past{ opacity:.3; cursor:not-allowed; }
  .cal-day.empty{ visibility:hidden; cursor:default; }
  .cal-legend{ font-size:.72rem; color:rgba(255,255,255,.75); margin-top:.6rem; }

  /* ============ REVIEW STEP ============ */
  .review-card{ background:var(--wz-dark); color:#F5EFEC; border-radius:14px; padding:1rem; display:flex; gap:.9rem; align-items:center; margin-bottom:1.2rem; }
  .review-card .review-thumb{ width:64px; height:64px; border-radius:10px; object-fit:cover; background:var(--wz-dark-2); flex:none; }
  .review-card .review-thumb.placeholder{ display:flex; align-items:center; justify-content:center; font-size:.65rem; color:#8d7d78; text-align:center; padding:.3rem; }
  .review-card h4{ font-family:var(--font-display); font-weight:600; font-size:1.05rem; margin-bottom:.15rem; }
  .review-card .review-meta{ font-size:.8rem; color:#C9BDB8; margin-bottom:.2rem; }
  .review-card .review-price{ font-size:.85rem; font-weight:700; color:var(--red); }
  .review-checklist{ font-size:.83rem; color:var(--wz-cream-text-muted); line-height:1.9; margin-bottom:1.4rem; }
  .review-checklist li{ list-style:none; display:flex; gap:.5rem; }
  .review-checklist .check{ color:#2E7D32; font-weight:800; }

  .submit-row{ margin-top:auto; display:flex; flex-wrap:wrap; gap:.6rem; }
  .submit-row [hidden]{ display:none !important; }
  .submit-btn{ background:var(--red); color:#fff; padding:1.05rem 1.6rem; border-radius:100px; font-weight:600; font-size:1rem; width:100%; transition:background .2s ease; display:flex; align-items:center; justify-content:center; gap:.5rem; }
  .submit-btn:hover{ background:var(--red-deep); }
  .submit-btn:disabled{ background:#c9c0bd; cursor:not-allowed; }
  .form-note{ font-size:.8rem; text-align:center; margin-top:.7rem; color:var(--wz-cream-text-muted); }

  .success-msg{ display:none; max-width:1240px; margin:2rem auto 0; padding:0 2.2vw; }
  .success-msg .inner{ display:flex; align-items:flex-start; gap:1rem; background:var(--white); border:1px solid #E4E1DA; border-radius:14px; padding:1.1rem 1.25rem; font-size:.95rem; color:var(--ink); }
  .success-msg #success-msg-inner{ flex:1 1 auto; min-width:0; }
  .success-msg-close{ flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; width:2rem; height:2rem; margin:-.3rem -.35rem 0 0; border:0; border-radius:50%; background:transparent; color:inherit; font-size:1.5rem; line-height:1; cursor:pointer; }
  .success-msg-close:hover{ background:rgba(0,0,0,.08); }
  .success-msg-close:focus-visible{ outline:2px solid currentColor; outline-offset:2px; }
  .success-msg.show{ display:block; }
  .success-msg.error .inner{ background:#FBE9E9; border-color:rgba(196,30,58,.3); color:var(--red-deep); }
  .success-msg a{ color:var(--red); font-weight:600; border-bottom:1.5px solid var(--red); }

  /* Desktop listing workspace: the sidebar replaces the old wordmark/back
     header while the existing mobile composition remains untouched below. */
  .wizard-sidebar{ display:none; }
  .review-mobile-gallery{ display:none; }
  @media (min-width:901px){
    body{ overflow:hidden; }
    .wizard{ min-height:100dvh; height:100dvh; padding:1rem 1.25rem 1rem 5.7rem; overflow:hidden; }
    .wizard-top-nav{ display:none; }
    .wizard-correction-nav{
      display:flex; position:absolute; z-index:5; top:.55rem; right:.55rem;
      align-items:center; gap:0; padding:0; overflow:hidden;
      border:1px solid rgba(255,255,255,.2); border-radius:0; background:#222; color:#F5EFEC;
    }
    .wizard-correction-nav label{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    .wizard-correction-nav select{ width:15rem; min-width:0; padding:.72rem .9rem; border:0; border-radius:0; background:#222; color:#F5EFEC; font-size:.95rem; font-weight:700; }
    .wizard-correction-nav button{ min-width:7rem; padding:.72rem .9rem; align-self:stretch; border-radius:0; background:#ff343c; color:#fff; font-size:.95rem; font-weight:700; }
    .wizard-correction-nav button:hover{ background:#df2029; }
    .wizard-sidebar{
      display:flex; position:fixed; z-index:20; inset:0 auto 0 0; width:4.45rem;
      flex-direction:column; align-items:center; padding:1rem 0; overflow-y:auto; scrollbar-width:none; background:#17110F;
      border-right:1px solid rgba(255,255,255,.08);
    }
    .wizard-sidebar::-webkit-scrollbar{ display:none; }
    .sidebar-nav-icon{
      width:2.45rem; height:2.45rem; border-radius:10px; display:grid; place-items:center;
      color:#B8ACA8; transition:background .18s ease, color .18s ease;
    }
    .sidebar-nav-icon:hover{ background:#2A201C; color:#fff; }
    .sidebar-nav-icon svg{ width:18px; height:18px; flex-shrink:0; }
    .sidebar-nav-icon [data-elie-icon]{ width:22px; height:22px; }
    .sidebar-host-nav{ display:grid; gap:.5rem; }

    .wizard-shell{ position:relative; max-width:1320px; height:calc(100dvh - 2rem); margin:0 auto; padding:0; }
    .step-frame.active{
      grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); min-height:0; height:100%; border-radius:22px;
    }
    .step-panel{ min-height:0; padding:1.45rem 1.8rem 1.3rem; }
    .step-frame[data-step="1"] .step-panel{ padding:1.25rem 1.5rem 1.05rem; background:#242424!important; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    .panel-brand{ display:none; }
    .progress-row{ gap:.7rem; margin-bottom:1rem; }
    .progress-ring{ width:48px; height:48px; }
    .progress-ring::after{ inset:5px; }
    .step-title{ font-size:clamp(1.45rem,2vw,1.85rem); margin-bottom:.4rem; }
    .step-sub{ font-size:.84rem; line-height:1.4; margin-bottom:.9rem; }
    .step-frame[data-step="1"] .progress-row{ gap:.9rem; margin-bottom:.45rem; }
    .step-frame[data-step="1"] .progress-ring{ width:76px; height:76px; }
    .step-frame[data-step="1"] .progress-ring::after{ inset:6px; }
    .step-frame[data-step="1"] .progress-ring{ --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    .step-frame[data-step="1"] .progress-ring span{ font-size:1rem; }
    .step-frame[data-step="1"] .progress-text{ font-size:1rem; line-height:1.6; color:#fff!important; }
    .step-frame[data-step="1"] .step-eyebrow{ display:none; }
    .step-frame[data-step="1"] .step-title{ font-size:clamp(1.55rem,2.2vw,2rem); margin-bottom:.2rem; }
    .step-frame[data-step="1"] .step-sub{ font-size:.88rem; line-height:1.55; margin:0 0 .85rem; padding-left:.65rem; color:#d0d0d0!important; }
    .step-fields{ min-height:0; overflow:auto; padding-right:.25rem; scrollbar-width:thin; }
    .step-frame[data-step="1"] .step-fields{ display:flex; flex-direction:column; gap:.45rem; overflow:visible; }
    .step-frame[data-step="1"] #property-description-field{ flex:1; min-height:5.5rem; }
    .step-frame[data-step="1"] #property-description{ flex:1; min-height:5.5rem; }
    .field{ gap:.3rem; margin-bottom:.65rem; }
    label{ font-size:.78rem; }
    input, textarea, select{ font-size:.84rem; padding:.55rem .7rem; }
    .step-frame[data-step="1"] .field{ gap:.25rem; margin-bottom:.45rem; }
    .step-frame[data-step="1"] label{ font-size:.9rem; }
    .step-frame[data-step="1"] input,
    .step-frame[data-step="1"] textarea,
    .step-frame[data-step="1"] select{ font-size:.88rem; padding:.62rem .78rem; border-radius:10px; }
    .step-frame[data-step="1"].tone-dark input,
    .step-frame[data-step="1"].tone-dark textarea,
    .step-frame[data-step="1"].tone-dark select{ background:#050505; color:#fff; border-color:transparent; }
    textarea{ min-height:64px; }
    .step-frame[data-step="1"] textarea{ resize:none; }
    .step-frame[data-step="1"] #caption{ min-height:4.6rem; }
    .step-frame[data-step="1"] #property-description{ min-height:7.5rem; }
    .panel-actions{ margin-top:auto; padding-top:.85rem; }
    .step-btn{ padding:.72rem 1rem; font-size:.84rem; }
    .step-frame[data-step="1"] .panel-actions{ padding-top:.35rem; }
    .step-frame[data-step="1"] .step-btn{ font-size:.9rem; }
    .step-frame[data-step="1"] .step-btn.next{ background:#d10e09; }
    .step-frame[data-step="1"] .step-btn.next:hover{ background:#b90b08; }
    .step-frame[data-step="1"] .step-photo{ min-height:0; background-position:center; }
    .step-frame[data-step="1"] .step-photo::after,
    .step-frame[data-step="1"] .step-photo-badge,
    .step-frame[data-step="1"] .step-photo-caption{ display:none; }
    .step-frame[data-step="1"] .office-shop-type{ grid-template-columns:1fr 1fr; margin:.15rem 0 .65rem; }
    .step-frame[data-step="1"] .office-shop-type button{ min-height:4.5rem; border:1px solid rgba(255,255,255,.5); border-radius:10px; padding:.7rem; background:rgba(255,255,255,.14); color:#fff; text-align:center; font-size:1rem; }
    .step-frame[data-step="1"] .office-shop-type button.selected{ border-color:#050505; background:#050505; color:#fff; }
    .step-frame[data-step="1"] .office-shop-type button small{ display:none; }
    .step-frame[data-step="1"] #office-shop-details-fields.active{ display:grid; grid-template-columns:1fr 1fr; gap:.65rem; margin:0 0 .4rem; }
    .step-frame[data-step="1"] #office-shop-details-fields .field{ margin:0; }
    .step-frame[data-step="1"] #office-shop-details-fields select{ padding:.45rem .65rem; }
    .step-frame[data-step="1"] .hotel-offer-mode{ margin:.15rem 0 .65rem; }
    .step-frame[data-step="1"] .hotel-offer-option,
    .step-frame[data-step="1"] .property-purpose-option{ background:#050505; color:#fff; border:0; border-radius:10px; padding:.72rem .65rem; }
    .step-frame[data-step="1"] .hotel-offer-option.selected,
    .step-frame[data-step="1"] .property-purpose-option.selected{ background:#ff343c; }
    .step-frame[data-step="1"] .hotel-offer-option small,
    .step-frame[data-step="1"] .property-purpose-option small{ font-size:.7rem; }
    .step-frame[data-step="1"] .property-purpose-mode{ margin:.15rem 0 .65rem; }
    .step-frame[data-step="2"] .step-panel{ padding:1.25rem 1.5rem 1.05rem; background:#242424!important; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    .step-frame[data-step="2"] .progress-row{ gap:.9rem; margin-bottom:.45rem; }
    .step-frame[data-step="2"] .progress-ring{ width:76px; height:76px; --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    .step-frame[data-step="2"] .progress-ring::after{ inset:6px; }
    .step-frame[data-step="2"] .progress-ring span{ font-size:1rem; }
    .step-frame[data-step="2"] .progress-text{ font-size:1rem; line-height:1.6; color:#fff!important; }
    .step-frame[data-step="2"] .step-eyebrow{ display:none; }
    .step-frame[data-step="2"] .step-title{ font-size:clamp(1.55rem,2.2vw,2rem); line-height:1.05; margin-bottom:.25rem; }
    .step-frame[data-step="2"] .step-sub{ font-size:.88rem; line-height:1.55; margin:0 0 .85rem; padding-left:.65rem; color:#d0d0d0!important; }
    .step-frame[data-step="2"] .step-fields{ overflow:visible; }
    .step-frame[data-step="2"] .step-fields > .field,
    .step-frame[data-step="2"] #office-shop-location-fields .field{ max-width:85%; gap:.25rem; margin-bottom:.8rem; }
    .step-frame[data-step="2"] label{ font-size:.9rem; }
    .step-frame[data-step="2"] input{ font-size:.88rem; padding:.62rem .78rem; border-radius:10px; }
    .step-frame[data-step="2"] input{ background:#050505; color:#fff; border-color:transparent; }
    .step-frame[data-step="2"] .location-help{ display:none; }
    .step-frame[data-step="2"] #office-shop-location-fields.active{ display:block; margin-top:.65rem; }
    .step-frame[data-step="2"] .panel-actions{ margin-top:auto; padding-top:.5rem; }
    .step-frame[data-step="2"] .step-btn{ font-size:.9rem; }
    .step-frame[data-step="2"] .step-btn.back{ padding:.72rem 1rem; color:#fff!important; }
    .step-frame[data-step="2"] .step-btn.next{ flex:0 1 64%; padding:.72rem 1rem; background:#d10e09; }
    .step-frame[data-step="2"] .step-btn.next:hover{ background:#b90b08; }
    .step-frame[data-step="2"] .step-photo{ min-height:0; background-position:center; }
    .step-frame[data-step="2"] .step-photo::after,
    .step-frame[data-step="2"] .step-photo-badge,
    .step-frame[data-step="2"] .step-photo-caption{ display:none; }
    .step-tracker{ display:none; }

    /* Match the supplied media-and-amenities card for stay and residential
       listings. Office/shop cards retain their existing styles and controls. */
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-panel{ padding:1.25rem 1.5rem 1.05rem; background:#242424!important; color:#fff; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-row{ gap:.9rem; margin-bottom:.45rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-ring{ width:76px; height:76px; --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-ring::after{ inset:6px; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-ring span{ font-size:1rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-text{ color:#fff!important; font-size:1rem; line-height:1.6; font-weight:600; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-eyebrow{ display:none; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-title{ margin-bottom:.15rem; font-size:clamp(1.55rem,2.2vw,2rem); }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-sub{ margin:0 0 .55rem; padding-left:.4rem; color:#d0d0d0!important; font-size:.84rem; line-height:1.35; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-fields{ overflow:auto; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .field{ margin-bottom:.55rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .photo-hint,
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-hint{ margin-bottom:.45rem; color:#d0d0d0; font-size:.76rem; line-height:1.3; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .photo-dropzone{ padding:.95rem .8rem; border:1.5px dashed rgba(255,255,255,.72); border-radius:12px; color:#f1f1f1; font-size:.86rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] #amenities-field{ margin-top:.5rem!important; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] #amenities-label{ display:block; margin-bottom:.25rem; font-size:.95rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-open{ display:flex; width:max-content; min-width:10.5rem; min-height:3.6rem; margin:.7rem auto .4rem; padding:.7rem 1rem; border:1px solid rgba(255,255,255,.72); border-radius:12px; background:#ff343c; color:#fff; font-size:.95rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-open:hover{ background:#e9232e; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-summary{ margin:.2rem 0 0; color:#d0d0d0; font-size:.76rem; }
    #listing-page[data-listing-niche="property"] .step-frame[data-step="3"] .property-policy-section{ margin:.85rem 0 0; }
    #listing-page[data-listing-niche="property"] .step-frame[data-step="3"] .policy-upload-link{ display:flex; width:100%; min-height:5.3rem; justify-content:center; padding:1rem; border:1.5px dashed rgba(255,255,255,.58); border-radius:12px; color:#fff; font-size:.9rem; }
    #listing-page[data-listing-niche="property"] .step-frame[data-step="3"] .policy-upload-link:hover{ border-color:#fff; }
    #listing-page[data-listing-niche="property"] .step-frame[data-step="3"] .policy-upload-link svg{ width:28px; height:28px; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .panel-actions{ padding-top:.45rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-btn{ font-size:.9rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-btn.next{ background:#d10e09; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-btn.next:hover{ background:#b90b08; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-photo{ min-height:0; background-position:center; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-photo::after,
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-photo-badge,
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-photo-caption{ display:none; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-overlay{ background:rgba(0,0,0,.18); }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-dialog{ width:88%; max-height:68%; border-color:rgba(255,255,255,.46); border-radius:10px; background:rgba(31,31,31,.36); backdrop-filter:blur(12px) saturate(125%); -webkit-backdrop-filter:blur(12px) saturate(125%); }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-header{ padding:.45rem .55rem .2rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-title-row{ display:none; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-search{ min-height:2rem; padding:0 .45rem; border:0; border-bottom:1px solid rgba(255,255,255,.7); border-radius:0; background:transparent; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-search input{ font-size:.78rem; font-weight:600; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-categories{ gap:.25rem; padding:.35rem .55rem .2rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-category{ padding:.25rem .45rem; font-size:.62rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-options{ grid-template-columns:repeat(3,minmax(0,1fr)); gap:.35rem; padding:.35rem .55rem .55rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-option{ justify-content:center; min-height:2.1rem; gap:.25rem; padding:.35rem .3rem; border-radius:8px; font-size:.68rem; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-option.selected{ padding:calc(.35rem - 1px) calc(.3rem - 1px); }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-option svg{ width:15px; height:15px; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-footer{ justify-content:center; padding:.3rem .5rem .45rem; border:0; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-done{ min-height:2.35rem; padding:.45rem 1rem; background:#050505; color:#20e66e; }

    /* The office/shop version uses the same reference card and library. */
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-panel{ padding:1.25rem 1.5rem 1.05rem; background:#242424!important; color:#fff; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-row{ gap:.9rem; margin-bottom:.45rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-ring{ width:76px; height:76px; --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-ring::after{ inset:6px; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-ring span{ font-size:1rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-text{ color:#fff!important; font-size:1rem; line-height:1.6; font-weight:600; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-eyebrow{ display:none; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-title{ margin-bottom:.15rem; font-size:clamp(1.55rem,2.2vw,2rem); }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-sub{ margin:0 0 .55rem; padding-left:.4rem; color:#d0d0d0!important; font-size:.84rem; line-height:1.35; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-fields{ overflow:auto; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .field{ margin-bottom:.55rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] input,
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] select,
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] textarea{ background:#050505; color:#fff; border:1px solid rgba(255,255,255,.68); border-radius:10px; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .section-heading{ margin:.8rem 0 .35rem; color:#fff; font-size:1rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .section-help{ color:#d0d0d0; font-size:.76rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .office-shop-amenities-store{ display:none!important; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-open{ display:flex; width:max-content; min-width:10.5rem; min-height:3rem; margin:.7rem auto .4rem; padding:.7rem 1rem; border:1px solid rgba(255,255,255,.72); border-radius:12px; background:#ff343c; color:#fff; font-size:.95rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-summary{ margin:.2rem 0 0; color:#d0d0d0; font-size:.76rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields .field-row{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields .option-grid{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.4rem .7rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields .option-grid label{ display:flex; align-items:center; gap:.42rem; color:#fff; font-size:.82rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]{ width:auto; accent-color:#ff343c; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields input[type="file"]{ width:100%; min-height:5rem; padding:.85rem; border:1.5px dashed rgba(255,255,255,.62); background:#050505; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields input[type="file"]::file-selector-button{ margin-right:.65rem; padding:.45rem .6rem; border:0; border-radius:6px; background:#242424; color:#fff; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-grid{ display:grid; grid-template-columns:repeat(3,minmax(0,110px)); gap:clamp(.55rem,3.5vw,2.4rem); align-items:stretch; max-width:460px; margin:.55rem 0 .65rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-card{ position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.5rem; min-width:0; min-height:112px; padding:.45rem .3rem; overflow:hidden; border:1.5px dashed rgba(255,255,255,.58); border-radius:10px; background:transparent; color:#fff; text-align:center; cursor:pointer; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-card svg{ width:34px; height:40px; flex:none; fill:currentColor; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-card span{ font-size:.68rem; font-weight:600; line-height:1.2; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] #office-shop-media-fields .office-shop-document-card input[type="file"]{ position:absolute; inset:0; width:100%; height:100%; min-height:0; padding:0; border:0; border-radius:0; background:transparent; opacity:0; cursor:pointer; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-card:focus-within{ outline:2px solid #ff343c; outline-offset:2px; }
    @media(max-width:900px){ #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-grid{ grid-template-columns:repeat(3,minmax(0,1fr)); gap:.45rem; max-width:100%; } #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .office-shop-document-card{ min-height:106px; } }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .panel-actions{ padding-top:.45rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-btn{ font-size:.9rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-btn.next{ background:#d10e09; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-photo{ min-height:0; background-position:center; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-photo::after,
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-photo-badge,
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-photo-caption{ display:none; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-dialog{ width:88%; max-height:68%; border-color:rgba(255,255,255,.46); border-radius:10px; background:rgba(31,31,31,.36); backdrop-filter:blur(12px) saturate(125%); -webkit-backdrop-filter:blur(12px) saturate(125%); }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-header{ padding:.45rem .55rem .2rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-title-row{ display:none; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-search{ min-height:2rem; padding:0 .45rem; border:0; border-bottom:1px solid rgba(255,255,255,.7); border-radius:0; background:transparent; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-categories{ gap:.25rem; padding:.35rem .55rem .2rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-category{ padding:.25rem .45rem; font-size:.62rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-options{ grid-template-columns:repeat(3,minmax(0,1fr)); gap:.35rem; padding:.35rem .55rem .55rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-option{ justify-content:center; min-height:2.1rem; gap:.25rem; padding:.35rem .3rem; border-radius:8px; font-size:.68rem; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-footer{ justify-content:center; padding:.3rem .5rem .45rem; border:0; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-done{ min-height:2.35rem; padding:.45rem 1rem; background:#050505; color:#20e66e; }

    /* Compact the denser steps without changing their fields or controls. */
    .location-help{ font-size:.74rem; }
    .photo-hint, .amenities-hint{ font-size:.7rem; margin-bottom:.5rem; }
    .photo-dropzone{ padding:.75rem; font-size:.76rem; }
    .photo-preview-grid{ grid-template-columns:repeat(6,1fr); gap:.35rem; margin-top:.5rem; }
    .amenities-grid{ gap:.38rem .5rem; }
    .amenity-check{ gap:.32rem; padding:.38rem; font-size:.7rem; }
    .amenity-check svg{ width:13px; height:13px; }
    .price-preview{ margin-bottom:.65rem; }
    .price-preview .amount{ font-size:1.75rem; }
    .booking-hint{ font-size:.68rem; line-height:1.3; margin-bottom:.45rem; }
    .cal-quick{ gap:.4rem; margin-bottom:.45rem; }
    .cal-quick button{ font-size:.67rem; padding:.28rem .55rem; }
    .cal-header{ margin-bottom:.35rem; }
    .cal-grid{ gap:.14rem; }
    .cal-dow{ font-size:.54rem; padding:.1rem 0; }
    .cal-day{ font-size:.63rem; border-radius:5px; }
    .cal-legend{ font-size:.64rem; margin-top:.4rem; }
    .review-card{ padding:.7rem; gap:.65rem; margin-bottom:.7rem; }
    .review-card .review-thumb{ width:50px; height:50px; }
    .review-checklist{ font-size:.76rem; line-height:1.55; margin-bottom:.7rem; }
    .submit-btn{ padding:.78rem 1rem; font-size:.88rem; }
    .form-note{ font-size:.67rem; margin-top:.45rem; }
    .success-msg.show{ position:fixed; z-index:30; inset:auto 1.25rem 1.25rem 5.7rem; max-width:1320px; }
  }

  @media (max-width:900px){
    /* The listing wizard is intentionally focused: it has its own step
       controls and no persistent app-level mobile bar. */
    body{ padding-bottom:0 !important; }
    .varoom-mobile-nav{ display:none !important; }
    .step-frame.active{ grid-template-columns:1fr; }
    .step-photo{ min-height:200px; order:-1; }
    .step-tracker{ display:none; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-panel{ background:#242424!important; color:#fff; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .progress-ring{ --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-open{ width:max-content; min-height:3.2rem; margin:.6rem auto .35rem; background:#ff343c; color:#fff; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .step-btn.next{ background:#d10e09; }
    #listing-page[data-listing-niche="property"] .step-frame[data-step="3"] .policy-upload-link{ display:flex; min-height:4.5rem; justify-content:center; padding:.8rem; border:1.5px dashed rgba(255,255,255,.58); border-radius:12px; color:#fff; }
    #listing-page:is([data-listing-niche="airbnb"],[data-listing-niche="hotel"],[data-listing-niche="property"]) .step-frame[data-step="3"] .amenities-library-dialog{ width:92%; max-height:78%; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-panel{ background:#242424!important; color:#fff; font-family:'Roboto Condensed','Arial Narrow',Arial,sans-serif; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .progress-ring{ --ring-fg:#18b66b; --ring-bg:#a8a8ad; --ring-hole:#242424; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .office-shop-amenities-store{ display:none!important; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-open{ width:max-content; min-height:3.2rem; margin:.6rem auto .35rem; background:#ff343c; color:#fff; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .step-btn.next{ background:#d10e09; }
    #listing-page:is([data-listing-niche="office"],[data-listing-niche="shop"]) .step-frame[data-step="3"] .amenities-library-dialog{ width:92%; max-height:78%; }
    /* Mobile review is a visual final check: give the chosen media the top
       half of the workspace while leaving the desktop review untouched. */
    .step-frame[data-step="5"].active{ min-height:100dvh; }
    .step-frame[data-step="5"] .step-photo{ min-height:clamp(19rem,45dvh,31rem); width:100%; }
    .step-frame[data-step="5"] .step-photo::after,
    .step-frame[data-step="5"] .step-photo-badge,
    .step-frame[data-step="5"] .step-photo-caption{ display:none; }
    .step-frame[data-step="5"] .step-panel{ padding-top:1.35rem; padding-bottom:1.35rem; }
    .step-frame[data-step="5"] .progress-row{ margin-bottom:1rem; }
    .review-mobile-gallery{ display:block; position:absolute; inset:0; z-index:2; overflow:hidden; background:var(--wz-dark); }
    .review-mobile-gallery-track{ display:flex; width:100%; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; }
    .review-mobile-gallery-track::-webkit-scrollbar{ display:none; }
    .review-mobile-gallery-slide{ flex:0 0 100%; height:100%; scroll-snap-align:start; }
    .review-mobile-gallery-slide img, .review-mobile-gallery-slide video{ width:100%; height:100%; object-fit:cover; display:block; }
    .review-mobile-gallery-controls{ position:absolute; inset:auto 0 .8rem; z-index:1; display:flex; align-items:center; justify-content:center; gap:.55rem; }
    .review-gallery-arrow{ width:2rem; height:2rem; display:grid; place-items:center; border-radius:50%; background:rgba(20,14,12,.65); color:#fff; backdrop-filter:blur(4px); }
    .review-gallery-dots{ display:flex; gap:.35rem; padding:.45rem .55rem; border-radius:100px; background:rgba(20,14,12,.55); }
    .review-gallery-dot{ width:.38rem; height:.38rem; border-radius:50%; background:rgba(255,255,255,.5); }
    .review-gallery-dot.active{ width:1rem; border-radius:100px; background:#fff; }
  }
  @media (max-width:520px){
    .wizard-top-nav{ padding:1.1rem 1.3rem; }
    .step-panel{ padding:2rem 1.4rem 1.8rem; }
    .field-row{ grid-template-columns:1fr; }
  }

  /* ============ PROPERTY: purpose selector (Card 1) ============ */
  .property-purpose-mode{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.55rem; margin:.3rem 0 1.05rem; }
  .property-purpose-mode[hidden]{ display:none; }
  .property-purpose-option{ appearance:none; border:1px solid rgba(255,255,255,.3); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; padding:.85rem .65rem; text-align:left; cursor:pointer; font:inherit; transition:background .18s ease, border-color .18s ease; }
  .property-purpose-option strong, .property-purpose-option small{ display:block; }
  .property-purpose-option small{ margin-top:.22rem; opacity:.72; line-height:1.3; font-size:.75rem; }
      .property-purpose-option.selected{ background:var(--red); border-color:var(--red); color:#fff; }
  .property-purpose-option.selected small{ opacity:.88; }

  /* ============ PROPERTY: policy upload (Card 3) ============ */
  .property-policy-section[hidden]{ display:none; }
  .policy-upload-link{ display:inline-flex; align-items:center; gap:.42rem; font-size:.83rem; font-weight:600; color:var(--red); cursor:pointer; background:none; border:none; border-bottom:1.5px solid transparent; padding:0; transition:border-color .18s ease; }
  .policy-upload-link:hover{ border-bottom-color:var(--red); }
  .policy-upload-link svg{ width:14px; height:14px; flex-shrink:0; }
  .policy-file-name{ display:none; align-items:center; gap:.55rem; font-size:.82rem; margin-top:.38rem; color:#C9BDB8; }
  .policy-file-name.show{ display:flex; }
  .policy-preview-btn{ background:none; border:none; padding:0; color:#C9BDB8; font-size:.82rem; cursor:pointer; font-family:inherit; text-decoration:underline; }
  .policy-preview-btn:hover{ color:#fff; }
  .policy-remove{ background:none; border:none; padding:0; color:#ff9d9d; font-size:.82rem; cursor:pointer; font-family:inherit; }
  .policy-remove:hover{ text-decoration:underline; }
  /* Overlay sits inside the existing .step-photo right panel */
  .policy-preview-overlay{ position:absolute; inset:0; z-index:10; background:#1a1210; display:none; flex-direction:column; border-radius:inherit; overflow:hidden; }
  .policy-preview-overlay.show{ display:flex; }
  .policy-preview-toolbar{ display:flex; align-items:center; justify-content:space-between; padding:.65rem 1rem; background:rgba(0,0,0,.45); flex-shrink:0; }
  .policy-preview-toolbar span{ font-size:.78rem; color:#C9BDB8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:18ch; }
  .policy-preview-close{ width:28px; height:28px; border-radius:50%; background:rgba(255,255,255,.14); color:#fff; display:grid; place-items:center; cursor:pointer; border:none; flex-shrink:0; }
  .policy-preview-close:hover{ background:rgba(255,255,255,.28); }
  .policy-preview-frame{ flex:1; border:none; background:#fff; }

  /* ============ PROPERTY: sale pricing (Card 4) ============ */
  .property-rent-section{ }
  .property-rent-section[hidden]{ display:none; }
  .property-sale-section{ margin-top:.9rem; padding-top:.85rem; border-top:1px solid rgba(255,255,255,.18); }
  .property-sale-section[hidden]{ display:none; }
  .property-section-label{ font-size:.7rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.6); margin-bottom:.55rem; display:block; }
  .sale-price-mode-row{ display:grid; grid-template-columns:1fr 1fr; gap:.5rem; margin-bottom:.65rem; }
  .sale-mode-option{ appearance:none; border:1px solid rgba(255,255,255,.3); border-radius:10px; background:rgba(255,255,255,.08); color:inherit; padding:.6rem .7rem; text-align:center; cursor:pointer; font:inherit; font-size:.82rem; font-weight:600; transition:background .18s ease, border-color .18s ease; }
  .sale-mode-option.selected{ background:rgba(255,255,255,.22); border-color:rgba(255,255,255,.75); }

  /* ============ PROPERTY: pay-to-list placeholder (Card 5) ============ */
  .pay-to-list-btn{ flex:1 1 calc(50% - .3rem); min-width:0; min-height:3.25rem; padding:.9rem 1rem; border-radius:100px; font-weight:600; font-size:.97rem; background:transparent; color:var(--wz-ink-onlight); border:1.5px solid var(--wz-cream-border); cursor:pointer; transition:background .2s ease, border-color .2s ease; display:flex; align-items:center; justify-content:center; gap:.5rem; font-family:inherit; }
  .submit-row #go-pro-btn{ flex:1 1 calc(50% - .3rem); min-width:0; min-height:3.25rem; width:auto; padding:.9rem 1rem; }
  .submit-row .form-note{ flex:1 0 100%; }
  .submit-row #submit-btn{ flex:1 0 100%; }
  .pay-to-list-btn:disabled,.submit-row #go-pro-btn:disabled{ opacity:.65; cursor:wait; }
  .pay-to-list-btn:hover{ background:rgba(26,18,16,.06); border-color:rgba(26,18,16,.32); }
  .pay-to-list-btn[hidden]{ display:none; }

  @media(max-width:520px){
    .property-purpose-mode{ grid-template-columns:1fr; }
    .sale-price-mode-row{ grid-template-columns:1fr; }
    .pay-to-list-btn,.submit-row #go-pro-btn{ min-height:2.9rem; padding:.65rem .45rem; font-size:.82rem; }
  }
  @media(min-width:901px){
    .property-purpose-option{ padding:.65rem .5rem; }
    .pay-to-list-btn{ font-size:.88rem; padding:.78rem 1rem; }
  }

  /* Shared listing-card visual system: keep niche content and behavior while
     giving Steps 1–4 the same red form panel and image split. */
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel{ background:#C41E3A!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .progress-ring,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .progress-ring,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .progress-ring,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .progress-ring{ --ring-fg:#fff; --ring-bg:rgba(255,255,255,.28); --ring-hole:#C41E3A; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel textarea,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel select,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel textarea,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel select,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel textarea,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel select,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel textarea,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel select{ background:rgba(255,255,255,.12)!important; border:1px solid rgba(255,255,255,.35)!important; color:#fff!important; color-scheme:dark; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel textarea::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel textarea::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel textarea::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input::placeholder,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel textarea::placeholder{ color:rgba(255,255,255,.7)!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="radio"]{ accent-color:#fff; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="checkbox"],
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="radio"]{ appearance:none; -webkit-appearance:none; display:inline-grid; place-content:center; width:1rem; height:1rem; flex:none; padding:0!important; border:1px solid rgba(255,255,255,.35)!important; border-radius:3px; background:rgba(255,255,255,.12)!important; vertical-align:middle; cursor:pointer; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="checkbox"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="radio"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="checkbox"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="radio"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="checkbox"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="radio"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="checkbox"]:checked,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="radio"]:checked{ background:#fff!important; border-color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="checkbox"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="checkbox"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="checkbox"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="checkbox"]:checked::before{ content:""; width:.28rem; height:.53rem; border:solid #8F1229; border-width:0 2px 2px 0; transform:rotate(45deg) translate(-1px,-1px); }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="radio"],
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="radio"]{ border-radius:50%; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input[type="radio"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input[type="radio"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input[type="radio"]:checked::before,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input[type="radio"]:checked::before{ content:""; width:.4rem; height:.4rem; border-radius:50%; background:#8F1229; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel select option,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel select option,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel select option,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel select option{ background:#8F1229; color:#fff; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .office-shop-type button,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .hotel-offer-option,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .property-purpose-option{ background:rgba(255,255,255,.12)!important; border:1px solid rgba(255,255,255,.35)!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .office-shop-type button.selected,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .hotel-offer-option.selected,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .property-purpose-option.selected{ background:rgba(255,255,255,.3)!important; border-color:rgba(255,255,255,.78)!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .sale-mode-option{ background:rgba(255,255,255,.12)!important; border:1px solid rgba(255,255,255,.35)!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .sale-mode-option.selected{ background:rgba(255,255,255,.3)!important; border-color:rgba(255,255,255,.78)!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-btn.next,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-btn.next,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-btn.next,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-btn.next{ background:#fff!important; color:#8F1229!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-btn.next:hover,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-btn.next:hover,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-btn.next:hover,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-btn.next:hover{ background:#f2e4e4!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel input:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel textarea:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="1"] .step-panel select:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel input:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel textarea:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="2"] .step-panel select:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel input:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel textarea:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel select:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel input:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel textarea:focus-visible,
  #listing-page[data-listing-niche] .step-frame[data-step="4"] .step-panel select:focus-visible{ outline:2px solid rgba(255,255,255,.9); outline-offset:1px; border-color:rgba(255,255,255,.85)!important; }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-panel :is(label,.section-heading,.section-help,.step-eyebrow,.step-sub,.location-help,.photo-hint,.amenities-hint,.booking-hint,.property-section-label){ color:#fff!important; font-weight:700!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-search input{ background:rgba(255,255,255,.12)!important; border:1px solid rgba(255,255,255,.35)!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .photo-dropzone{ border:2px dashed rgba(255,255,255,.9)!important; box-shadow:inset 0 0 0 1px rgba(255,255,255,.12); }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .photo-dropzone:hover,
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .photo-dropzone.dragover{ border-color:#fff!important; box-shadow:0 0 0 3px rgba(255,255,255,.14), inset 0 0 0 1px rgba(255,255,255,.18); }
  /* Keep the reference captions visible across every niche and wizard step. */
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo::after{ display:block!important; }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption{ display:block!important; left:1.35rem; right:1.35rem; bottom:1.35rem; z-index:3; max-width:38rem; color:#fff!important; text-shadow:0 1px 3px rgba(0,0,0,.55); }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption h3{ color:#fff!important; font-weight:700; }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption p{ color:rgba(255,255,255,.92)!important; max-width:38ch; }
  @media(max-width:900px){
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption{ left:1rem; right:1rem; bottom:1rem; }
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption h3{ font-size:1.1rem; }
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo-caption p{ font-size:.75rem; }
  }
  @media(min-width:901px){
    #listing-page[data-listing-niche] .step-frame.active:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]){ grid-template-columns:minmax(0,1fr) minmax(0,1fr); }
  }
  /* Keep long form content in its own scroll area so the CTA always has a
     dedicated row at the bottom of the card. */
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-panel{ min-width:0; min-height:0; display:flex; flex-direction:column; }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-fields{ flex:1 1 auto; min-width:0; min-height:0; overflow-x:hidden; overflow-y:auto!important; padding:0 .35rem 1rem 0; overscroll-behavior:contain; scrollbar-width:thin; }
  #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .panel-actions{ position:relative; z-index:2; flex:0 0 auto; margin-top:auto; padding:.85rem 0 0; background:#C41E3A; }
  #listing-page[data-listing-niche] .step-frame.active:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]){ background:#C41E3A; }
  @media(min-width:901px){
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-panel{ border-radius:0 20px 20px 0; }
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo{ border-radius:20px 0 0 20px; overflow:hidden; }
    .wizard-correction-nav{ border:0; border-radius:13px; overflow:hidden; box-shadow:0 0 0 1px rgba(255,255,255,.3); }
    .wizard-correction-nav select{ border:0; border-radius:0; }
    .wizard-correction-nav button{ border:0!important; border-radius:0; outline:none; box-shadow:none; }
    .wizard-correction-nav select:focus,
    .wizard-correction-nav button:focus{ outline:none; box-shadow:none; }
    .wizard-correction-nav select:focus-visible,
    .wizard-correction-nav button:focus-visible{ outline:2px solid #fff!important; outline-offset:-3px; box-shadow:none!important; position:relative; z-index:2; }
  }
  @media(max-width:900px){
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-panel{ border-radius:18px 18px 0 0; }
    #listing-page[data-listing-niche] .step-frame:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]) .step-photo{ border-radius:0 0 18px 18px; overflow:hidden; }
  }
  /* Keep the amenity chooser roomy. Desktop displays it over the hero image;
     mobile moves it over the remaining form fields, above the anchored CTA. */
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .step-panel{ position:relative; min-width:0; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-overlay{ z-index:12; padding:clamp(.5rem,1.6vw,1rem); }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-dialog{ width:min(100%,720px); height:min(78%,640px); max-height:none; min-height:0; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-title-row{ display:flex!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-header{ display:flex; align-items:center; justify-content:space-between; gap:.75rem; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-title-row{ flex:1 1 auto; min-width:0; margin-bottom:0; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-search{ flex:0 1 20rem; min-width:10rem; min-height:2.55rem; padding:0 .75rem; border:1px solid rgba(255,255,255,.42); border-radius:10px; background:rgba(0,0,0,.42); }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-search input{ min-width:0; border:0!important; outline:0; box-shadow:none!important; background:transparent!important; color:#fff!important; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-options{ grid-template-columns:repeat(2,minmax(0,1fr)); gap:.55rem; }
  #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-option{ min-height:2.55rem; padding:.5rem .58rem; font-size:.78rem; }
  @media(min-width:901px){
    #listing-page[data-listing-niche] .step-frame.active:is([data-step="1"],[data-step="2"],[data-step="3"],[data-step="4"]){ grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr); }
  }
  @media(max-width:900px){
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-overlay.mobile-amenities-overlay{
      position:absolute; inset:var(--amenities-overlay-top, 0px) 0 var(--amenities-overlay-bottom, 0px);
      align-items:stretch; justify-content:stretch; padding:.45rem .65rem .65rem;
      border-radius:0 0 18px 18px; background:rgba(15,10,10,.22);
    }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-overlay.mobile-amenities-overlay .amenities-library-dialog{
      width:100%; height:100%; max-height:none; min-height:0; border-radius:14px;
      background:rgba(28,25,24,.84); backdrop-filter:blur(20px) saturate(140%); -webkit-backdrop-filter:blur(20px) saturate(140%);
    }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-header{ display:grid; grid-template-columns:minmax(0,1fr); gap:.45rem; padding:.7rem .75rem .45rem; }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-title-row{ margin-bottom:0; }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-search{ min-height:2.55rem; flex:initial; min-width:0; border:1px solid rgba(255,255,255,.42); border-radius:10px; background:rgba(0,0,0,.42); }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-options{ grid-template-columns:repeat(2,minmax(0,1fr)); flex:1 1 auto; min-height:0; }
    #listing-page[data-listing-niche] .step-frame[data-step="3"] .amenities-library-footer{ padding:.5rem .75rem .65rem; }
  }
  /* Keep commercial checkboxes at a visible, stable size despite shared input
     sizing rules in the red listing panel. */
  #listing-page[data-listing-niche="office"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"],
  #listing-page[data-listing-niche="shop"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]{ appearance:none!important; -webkit-appearance:none!important; display:inline-grid!important; place-content:center; box-sizing:border-box; width:1.15rem!important; min-width:1.15rem!important; max-width:1.15rem!important; height:1.15rem!important; min-height:1.15rem!important; flex:0 0 1.15rem!important; margin:0 .1rem 0 0; padding:0!important; border:1.5px solid rgba(255,255,255,.9)!important; border-radius:3px; background:rgba(20,15,15,.35)!important; vertical-align:middle; cursor:pointer; }
  #listing-page[data-listing-niche="office"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:checked,
  #listing-page[data-listing-niche="shop"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:checked{ background:#fff!important; border-color:#fff!important; }
  #listing-page[data-listing-niche="office"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:checked::before,
  #listing-page[data-listing-niche="shop"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:checked::before{ content:""; width:.3rem; height:.55rem; border:solid #8F1229; border-width:0 2px 2px 0; transform:rotate(45deg) translate(-1px,-1px); }
  #listing-page[data-listing-niche="office"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:focus-visible,
  #listing-page[data-listing-niche="shop"] .step-frame[data-step="3"] #office-shop-media-fields input[type="checkbox"]:focus-visible{ outline:2px solid #fff; outline-offset:2px; }

  /* Shared compact confirmation dialog for leaving a listing. */
  .listing-leave-dialog{
    position:fixed; inset:0; margin:auto; width:min(30rem,calc(100vw - 2rem)); max-width:none;
    max-height:calc(100dvh - 2rem); overflow:auto; padding:0; border:1px solid rgba(255,255,255,.22);
    border-radius:20px; color:#fff; background:#211916; box-shadow:0 24px 80px rgba(0,0,0,.48); font-family:inherit;
  }
  .listing-leave-dialog:not([open]){ display:none; }
  .listing-leave-dialog[open]{ display:block; }
  .listing-leave-dialog::backdrop{ background:rgba(6,4,4,.72); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); }
  body.listing-leave-fallback::before{ content:""; position:fixed; inset:0; z-index:9998; background:rgba(6,4,4,.72); backdrop-filter:blur(5px); }
  body.listing-leave-fallback .listing-leave-dialog{ z-index:9999; }
  .listing-leave-card{ padding:clamp(1.25rem,4vw,1.8rem); }
  .listing-leave-dialog h2{ margin:0 0 .55rem; color:#fff; font-size:clamp(1.35rem,3vw,1.7rem); line-height:1.15; }
  .listing-leave-dialog p{ margin:0; color:rgba(255,255,255,.78); line-height:1.5; }
  .listing-leave-actions{ display:grid; grid-template-columns:1fr; gap:.65rem; margin-top:1.3rem; }
  .listing-leave-actions button{
    min-height:3rem; padding:.75rem 1rem; border:1px solid rgba(255,255,255,.22); border-radius:12px;
    color:#fff; background:rgba(255,255,255,.08); font:inherit; font-size:1rem; font-weight:600; cursor:pointer;
  }
  .listing-leave-actions button[data-leave-action="save"]{ border-color:#c41e3a; background:#c41e3a; }
  .listing-leave-actions button[data-leave-action="discard"],
  .listing-leave-actions button[data-leave-action="confirm-discard"]{ border-color:rgba(255,100,115,.55); color:#ffb4bd; background:rgba(140,15,35,.28); }
  .listing-leave-actions button:hover{ filter:brightness(1.1); }
  .listing-leave-actions button:focus-visible{ outline:3px solid #fff; outline-offset:2px; }
  .listing-leave-actions button:disabled{ opacity:.65; cursor:wait; }
  @media(max-width:480px){
    .listing-leave-dialog{ width:calc(100vw - 1.25rem); max-height:calc(100dvh - 1.25rem); border-radius:16px; }
    .listing-leave-card{ padding:1.15rem; }
    .listing-leave-actions button{ min-height:2.9rem; }
  }
  /* The autosave status line (the legacy script injected this at runtime). */
  .listing-save-status{display:block;margin:.25rem 0 .6rem;color:rgba(255,255,255,.82);font-size:.78rem;line-height:1.35}.listing-save-status[data-state="saved"]{color:#c9ffe3}.listing-save-status[data-state="error"]{color:#ffe0e0}
`;
