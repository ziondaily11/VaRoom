// Styles for /list (the listing wizard). Scoped to the wizard (#listing-page)
// and its own dialogs, so the app shell and sidebar around it are untouched.
// Light, readable form card beside the step's photo; one progress bar above;
// motion follows animation.md (C4 step slides, B9 progress, B4 press) with a
// reduced-motion fallback at the end.

export const LIST_WIZARD_STYLES = `
  #listing-page, .listing-leave-dialog, .lw-checking{
    --red:#C41E3A; --red-deep:#8F1229; --red-tint:rgba(196,30,58,.08); --ok:#1e7a4a;
    --ink:#24211E; --muted:#6b665e; --line:rgba(36,33,30,.12); --line-strong:rgba(36,33,30,.22);
    --page:var(--va-light); --card:var(--va-light); --field:#F7F6F3; --chip:#F1EEE9;
    --shadow:0 1px 2px rgba(36,33,30,.04), 0 18px 48px -28px rgba(36,33,30,.35);
    font-family:Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color:var(--ink);
  }
  html[data-theme="dark"] #listing-page, html[data-theme="dark"] .listing-leave-dialog, html[data-theme="dark"] .lw-checking{
    --red-tint:rgba(229,56,79,.16); --ok:#3fb950;
    --ink:#E7E9EA; --muted:#8b98a5; --line:rgba(255,255,255,.12); --line-strong:rgba(255,255,255,.24);
    --page:#000000; --card:#141414; --field:#000000; --chip:#232323; --shadow:none;
  }
  #listing-page *, #listing-page *::before, #listing-page *::after{ box-sizing:border-box; }
  /* Anything marked hidden stays hidden, whatever display a class gives it (conditional fields). */
  #listing-page [hidden]{ display:none !important; }
  /* The resets leave the plan choice's pricing page (PRICING_STYLES) to its own styles. */
  #listing-page :where(h1,h2,h3,h4,p,ul,ol,li):where(:not(.pricing-page *)){ margin:0; padding:0; }
  #listing-page :where(ul,ol){ list-style:none; }
  #listing-page :where(button):where(:not(.pricing-page *)){ font:inherit; color:inherit; cursor:pointer; border:0; background:none; }
  #listing-page :where(a){ color:inherit; }
  #listing-page :focus-visible{ outline:3px solid rgba(196,30,58,.45); outline-offset:2px; }
  .lw-checking{ text-align:center; padding:6rem 1rem; color:var(--muted); }

  /* ---------- Page and progress ---------- */
  #listing-page{ min-height:100vh; min-height:100dvh; background:var(--page); padding:1.4rem clamp(1rem,3vw,2.5rem) 3rem; }
  #listing-page .wizard-shell{ max-width:1240px; margin:0 auto; }
  #listing-page .wz-progress{ margin-bottom:1.1rem; }
  #listing-page .wz-progress-head{ display:flex; align-items:baseline; justify-content:space-between; gap:1rem; margin-bottom:.6rem; }
  #listing-page .wz-progress-title{ display:flex; align-items:center; gap:.7rem; min-width:0; }
  #listing-page .wz-progress-label{ font-size:.92rem; font-weight:600; }
  #listing-page .wz-progress-label span{ color:var(--muted); font-weight:500; }
  #listing-page .listing-save-status{ font-size:.78rem; color:var(--muted); text-align:right; }
  #listing-page .listing-save-status[data-state="saved"]{ color:var(--ok); }
  #listing-page .listing-save-status[data-state="error"]{ color:var(--red); }
  #listing-page .wz-progress-bar{ display:grid; grid-template-columns:repeat(6, minmax(0,1fr)); gap:6px; }
  #listing-page .wz-progress-seg button{ display:flex; flex-direction:column; gap:.4rem; width:100%; padding:0; text-align:left; }
  #listing-page .wz-progress-seg button:disabled{ cursor:default; }
  #listing-page .wz-progress-fill{ position:relative; display:block; height:5px; border-radius:999px; background:var(--line); overflow:hidden; }
  #listing-page .wz-progress-fill::after{ content:''; position:absolute; inset:0; border-radius:inherit; background:var(--red); transform:scaleX(0); transform-origin:left center;
    transition:transform var(--motion-standard,250ms) var(--ease-in-out,ease-in-out); }
  #listing-page .wz-progress-seg.is-current .wz-progress-fill::after, #listing-page .wz-progress-seg.is-done .wz-progress-fill::after{ transform:scaleX(1); }
  #listing-page .wz-progress-seg.is-done .wz-progress-fill::after{ opacity:.45; }
  #listing-page .wz-progress-name{ font-size:.74rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  #listing-page .wz-progress-seg.is-current .wz-progress-name{ color:var(--ink); font-weight:600; }
  @media (hover:hover){ #listing-page .wz-progress-seg button:not(:disabled):hover .wz-progress-name{ color:var(--ink); text-decoration:underline; } }

  /* ---------- A step: the form card beside its photo ---------- */
  #listing-page .step-frame{ display:none; }
  /* Wide screens: the card fits the screen; the form scrolls inside it with its buttons kept at the bottom
     (the app shell's own scrolling would not let them follow the page). */
  #listing-page .step-frame.active{
    display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr); height:max(560px, calc(100dvh - 7.2rem));
    background:var(--card); border:1px solid var(--line); border-radius:24px; overflow:hidden; box-shadow:var(--shadow);
  }
  #listing-page .step-panel{ position:relative; min-width:0; min-height:0; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; padding:clamp(1.5rem,3vw,2.5rem) clamp(1.5rem,3vw,2.5rem) 0; }
  #listing-page .step-title{ font-size:clamp(1.55rem,2.4vw,2rem); font-weight:700; letter-spacing:-.02em; line-height:1.15; margin-bottom:.45rem; }
  #listing-page .step-sub{ font-size:.95rem; line-height:1.5; color:var(--muted); margin-bottom:1.6rem; max-width:52ch; }
  #listing-page .step-fields{ flex:1; }

  #listing-page .step-photo{ position:relative; min-height:0; background-size:cover; background-position:center; }
  #listing-page .step-photo::after{ content:''; position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.6) 100%); pointer-events:none; }
  #listing-page .step-photo-badge{ position:absolute; top:1.2rem; left:1.2rem; z-index:1; display:flex; align-items:center; gap:.4rem; padding:.45rem .85rem; border-radius:999px;
    background:rgba(20,14,12,.6); color:#fff; font-size:.78rem; font-weight:600; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
  #listing-page .step-photo-badge .check{ color:#7ED6A5; }
  #listing-page .step-photo-caption{ position:absolute; left:1.5rem; right:1.5rem; bottom:1.5rem; z-index:1; color:#fff; }
  #listing-page .step-photo-caption h3{ font-size:1.4rem; font-weight:700; margin-bottom:.3rem; }
  #listing-page .step-photo-caption p{ font-size:.88rem; line-height:1.45; color:rgba(255,255,255,.9); max-width:38ch; }
  #listing-page .step-frame[data-step="5"] .step-photo::after{ display:none; }

  /* ---------- Fields ---------- */
  #listing-page .field{ display:flex; flex-direction:column; gap:.4rem; margin-bottom:1.05rem; min-width:0; }
  #listing-page .field:last-child{ margin-bottom:0; }
  #listing-page .field-row{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:0 .8rem; }
  #listing-page .field-row > .field{ margin-bottom:1.05rem; }
  #listing-page label{ font-size:.85rem; font-weight:600; color:var(--ink); }
  #listing-page label small{ font-weight:500; color:var(--muted); }
  #listing-page :is(input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]), select, textarea){
    width:100%; min-width:0; font:inherit; font-size:.95rem; color:var(--ink); background:var(--field);
    padding:.75rem .9rem; border:1px solid var(--line); border-radius:12px;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), box-shadow var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease);
  }
  #listing-page :is(input, select, textarea)::placeholder{ color:var(--muted); opacity:.8; }
  #listing-page :is(input, select, textarea):focus{ outline:none; border-color:var(--ink); background:var(--card); box-shadow:0 0 0 4px rgba(196,30,58,.12); }
  #listing-page :is(input, select, textarea, button)[aria-invalid="true"]{ border-color:var(--red) !important; box-shadow:0 0 0 4px rgba(196,30,58,.16); }
  #listing-page textarea{ resize:vertical; min-height:96px; line-height:1.5; }
  /* "Write with Elie" under the summary highlight and the description */
  #listing-page .elie-write{ display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px; }
  #listing-page .elie-write-button{ display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid var(--line); border-radius:999px;
    background:var(--card); color:var(--ink); font:inherit; font-size:.8rem; font-weight:600; cursor:pointer; }
  #listing-page .elie-write-button:hover{ border-color:var(--ink); }
  #listing-page .elie-write-button:disabled{ cursor:progress; opacity:.8; }
  #listing-page .elie-write-undo{ padding:4px 6px; border:0; background:none; color:var(--muted); font:inherit; font-size:.8rem; text-decoration:underline; cursor:pointer; }
  #listing-page .elie-write-note{ flex-basis:100%; margin:0; font-size:.78rem; color:var(--muted); }
  #listing-page .elie-write-note a{ color:var(--ink); font-weight:600; }
  #listing-page #property-description{ min-height:150px; }
  #listing-page input[type="checkbox"], #listing-page input[type="radio"]{ accent-color:var(--red); width:1.05rem; height:1.05rem; flex-shrink:0; }
  #listing-page .checkbox-row{ display:flex; align-items:center; gap:.6rem; }
  #listing-page .checkbox-row label{ font-weight:500; }

  /* Choices that look like cards: office or shop, hotel offer, rent or sale, exact or starting price. */
  #listing-page :is(.hotel-offer-mode, .property-purpose-mode){ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:.6rem; margin:0 0 1.3rem; }
  #listing-page :is(.hotel-offer-mode, .property-purpose-mode)[hidden]{ display:none; }
  #listing-page .office-shop-type{ display:none; grid-template-columns:repeat(2, minmax(0,1fr)); gap:.6rem; margin-bottom:1.2rem; }
  #listing-page .office-shop-type.active{ display:grid; }
  #listing-page .sale-price-mode-row{ display:grid; grid-template-columns:1fr 1fr; gap:.5rem; margin-bottom:.7rem; }
  #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option){
    display:flex; flex-direction:column; gap:.2rem; padding:.85rem .95rem; text-align:left; border:1.5px solid var(--line); border-radius:14px; background:var(--card); color:var(--ink);
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease);
  }
  #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option) strong{ font-weight:600; font-size:.92rem; }
  #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option) small{ font-size:.76rem; line-height:1.35; color:var(--muted); }
  #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option).selected{ border-color:var(--red); background:var(--red-tint); }
  #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option):active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ #listing-page :is(.office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option):not(.selected):hover{ border-color:var(--line-strong); } }

  /* Groups that show for some listings only. */
  #listing-page :is(.booking-group, .hotel-dining-fields){ display:none; }
  #listing-page :is(.booking-group, .hotel-dining-fields).active{ display:block; }
  #listing-page :is(.property-rent-section, .property-sale-section, .property-policy-section, .conditional)[hidden]{ display:none; }
  #listing-page .property-section-label{ display:block; margin:.4rem 0 .6rem; font-size:.72rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); }
  #listing-page .booking-hint{ font-size:.82rem; line-height:1.5; color:var(--muted); margin-bottom:.9rem; }

  /* Office and shop sections. */
  #listing-page .office-shop-section{ display:none; margin-top:.4rem; }
  #listing-page .office-shop-section.active{ display:block; }
  #listing-page .office-shop-section .section-heading{ font-size:1.05rem; font-weight:700; margin:1.6rem 0 .7rem; padding-top:1.2rem; border-top:1px solid var(--line); }
  #listing-page .office-shop-section .section-heading:first-child{ margin-top:.4rem; padding-top:0; border-top:0; }
  #listing-page .office-shop-section .section-help{ font-size:.82rem; line-height:1.45; color:var(--muted); margin:0 0 .8rem; }
  #listing-page .option-grid{ display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:.45rem .8rem; margin-bottom:1rem; }
  #listing-page .option-grid label{ display:flex; align-items:center; gap:.5rem; font-size:.86rem; font-weight:500; cursor:pointer; }
  #listing-page .office-shop-amenities-store{ display:none !important; }
  #listing-page .office-shop-section summary{ margin:1.4rem 0 .7rem; font-size:1rem; font-weight:700; cursor:pointer; }
  #listing-page .office-shop-document-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:.6rem; margin-bottom:1rem; }
  #listing-page .office-shop-document-card{ position:relative; display:flex; flex-direction:column; gap:.35rem; padding:.85rem; border:1.5px dashed var(--line-strong); border-radius:14px; background:var(--field); font-size:.82rem; }
  #listing-page .office-shop-document-card input[type="file"]{ font-size:.75rem; }
  #listing-page .office-shop-existing-documents{ font-size:.8rem; color:var(--muted); }

  /* ---------- Photos and amenities ---------- */
  #listing-page .photo-hint{ font-size:.8rem; color:var(--muted); margin-bottom:.7rem; }
  #listing-page .photo-dropzone{ display:flex; align-items:center; justify-content:center; min-height:150px; padding:1.4rem 1rem; text-align:center;
    border:2px dashed var(--line-strong); border-radius:18px; background:var(--field); color:var(--muted); font-size:.92rem; font-weight:600; cursor:pointer;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease), color var(--motion-micro,150ms) var(--ease-out,ease); }
  #listing-page .photo-dropzone::before{ content:''; width:28px; height:28px; margin-right:.6rem; flex:none;
    background:currentColor; -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3Ccircle cx='9' cy='11' r='2'/%3E%3Cpath d='m21 16-5-5-8 8'/%3E%3C/svg%3E") center/contain no-repeat;
    mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='14' rx='2'/%3E%3Ccircle cx='9' cy='11' r='2'/%3E%3Cpath d='m21 16-5-5-8 8'/%3E%3C/svg%3E") center/contain no-repeat; }
  #listing-page .photo-dropzone.dragover{ border-color:var(--red); background:var(--red-tint); color:var(--red-deep); }
  @media (hover:hover){ #listing-page .photo-dropzone:not([aria-disabled="true"]):hover{ border-color:var(--red); color:var(--ink); } }
  #listing-page .photo-dropzone[aria-disabled="true"]{ cursor:not-allowed; opacity:.7; }
  #listing-page .photo-dropzone input[type="file"]{ display:none; }
  #listing-page .photo-error{ display:none; margin-top:.5rem; font-size:.82rem; font-weight:600; color:var(--red); }
  #listing-page .photo-error.show{ display:block; }
  #listing-page .photo-preview-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr)); gap:.6rem; margin-top:.9rem; }
  #listing-page .photo-thumb{ position:relative; aspect-ratio:4 / 3; border-radius:12px; overflow:hidden; background:var(--chip); cursor:grab; animation:lw-fade-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  #listing-page .photo-thumb:active{ cursor:grabbing; }
  #listing-page .photo-thumb.drag-over{ outline:2px dashed var(--red); outline-offset:2px; }
  #listing-page .photo-thumb img{ width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
  #listing-page .photo-thumb .remove-photo{ position:absolute; top:6px; right:6px; width:24px; height:24px; border-radius:50%; display:grid; place-items:center;
    background:rgba(0,0,0,.65); color:#fff; font-size:.9rem; line-height:1; }
  @media (hover:hover){ #listing-page .photo-thumb .remove-photo:hover{ background:var(--red); } }
  #listing-page .photo-thumb .cover-tag{ position:absolute; left:6px; bottom:6px; padding:.2rem .5rem; border-radius:999px; background:var(--red); color:#fff; font-size:.62rem; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }
  #listing-page .photo-thumb.add-tile{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.2rem; cursor:pointer;
    border:1.5px dashed var(--line-strong); background:transparent; color:var(--muted); font-size:.72rem; font-weight:600; }
  #listing-page .photo-thumb.add-tile svg{ width:20px; height:20px; }
  @media (hover:hover){ #listing-page .photo-thumb.add-tile:hover{ border-color:var(--red); color:var(--red); } }

  #listing-page .amenities-hint{ font-size:.82rem; color:var(--muted); margin-bottom:.7rem; }
  #listing-page .amenities-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:.5rem; }
  #listing-page .amenities-grid.library-state-store{ position:absolute !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0,0,0,0) !important; white-space:nowrap !important; }
  #listing-page .amenity-check{ display:flex; align-items:center; gap:.5rem; padding:.55rem .7rem; border:1px solid var(--line); border-radius:12px; font-size:.84rem; font-weight:500; cursor:pointer;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  #listing-page .amenity-check svg{ width:16px; height:16px; color:var(--red); flex-shrink:0; }
  #listing-page .amenity-check.checked{ border-color:var(--red); background:var(--red-tint); }
  #listing-page .amenities-library-open{ display:inline-flex; align-items:center; justify-content:center; gap:.5rem; min-height:46px; padding:.7rem 1.2rem; margin-top:.2rem;
    border:1.5px solid var(--line-strong); border-radius:999px; background:var(--card); color:var(--ink); font-weight:600; font-size:.92rem;
    transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  #listing-page .amenities-library-open:active{ transform:scale(var(--press-scale,.97)); }
  @media (hover:hover){ #listing-page .amenities-library-open:hover{ border-color:var(--red); } }
  #listing-page :is(.amenities-library-open, .amenities-library-summary)[hidden]{ display:none !important; }
  #listing-page .amenities-library-summary{ margin:.6rem 0 0; font-size:.82rem; line-height:1.45; color:var(--muted); }

  /* The amenities library: over the step's photo on wide screens, over the form on phones. */
  #listing-page .amenities-library-overlay{ position:absolute; inset:0; z-index:12; display:flex; align-items:center; justify-content:center; padding:clamp(.6rem,2vw,1.2rem); background:rgba(0,0,0,.28);
    animation:lw-fade-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  #listing-page .amenities-library-overlay[hidden]{ display:none; }
  #listing-page .amenities-library-dialog{ display:flex; flex-direction:column; width:min(100%,620px); max-height:min(100%,640px); min-height:0; overflow:hidden;
    border:1px solid var(--line); border-radius:18px; background:var(--card); color:var(--ink); box-shadow:0 24px 60px rgba(0,0,0,.3);
    animation:lw-pop-in var(--motion-standard,250ms) var(--ease-out,ease) both; }
  #listing-page .amenities-library-header{ flex:0 0 auto; padding:1rem 1rem .6rem; }
  #listing-page .amenities-library-title-row{ display:flex; align-items:center; justify-content:space-between; gap:.6rem; margin-bottom:.7rem; }
  #listing-page .amenities-library-title{ font-size:1rem; font-weight:700; }
  #listing-page .amenities-library-count{ font-size:.76rem; color:var(--muted); white-space:nowrap; }
  #listing-page .amenities-library-search{ display:flex; align-items:center; gap:.5rem; min-height:42px; padding:0 .8rem; border:1px solid var(--line); border-radius:12px; background:var(--field); font-weight:500; }
  #listing-page .amenities-library-search svg{ width:17px; height:17px; flex:none; color:var(--muted); }
  #listing-page .amenities-library-search input{ border:0 !important; background:transparent !important; padding:.5rem 0 !important; box-shadow:none !important; }
  #listing-page .amenities-library-categories{ flex:0 0 auto; display:flex; gap:.4rem; overflow-x:auto; padding:0 1rem .7rem; scrollbar-width:none; }
  #listing-page .amenities-library-category{ flex:none; padding:.4rem .75rem; border:1px solid var(--line); border-radius:999px; background:var(--card); font-size:.76rem; font-weight:600; }
  #listing-page .amenities-library-category[aria-pressed="true"]{ border-color:var(--ink); background:var(--ink); color:var(--card); }
  #listing-page .amenities-library-options{ flex:1 1 auto; min-height:0; display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); grid-auto-rows:min-content; align-content:start; gap:.45rem;
    overflow-y:auto; overscroll-behavior:contain; padding:.2rem 1rem 1rem; }
  #listing-page .amenities-library-option{ display:flex; align-items:center; gap:.5rem; min-width:0; min-height:44px; padding:.5rem .65rem; border:1.5px solid var(--line); border-radius:12px; background:var(--card);
    font-size:.8rem; font-weight:600; text-align:left; transition:border-color var(--motion-micro,150ms) var(--ease-out,ease), background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  #listing-page .amenities-library-option svg{ width:17px; height:17px; flex:none; color:var(--red); }
  #listing-page .amenities-library-option span{ overflow:hidden; text-overflow:ellipsis; }
  #listing-page .amenities-library-option.selected{ border-color:var(--red); background:var(--red-tint); }
  @media (hover:hover){ #listing-page .amenities-library-option:not(.selected):hover{ border-color:var(--line-strong); } }
  #listing-page .amenities-library-empty{ grid-column:1 / -1; padding:1.2rem .4rem; text-align:center; font-size:.85rem; color:var(--muted); }
  #listing-page .amenities-library-footer{ flex:0 0 auto; display:flex; justify-content:flex-end; padding:.7rem 1rem .9rem; border-top:1px solid var(--line); }
  #listing-page .amenities-library-done{ display:inline-flex; align-items:center; gap:.45rem; min-height:44px; padding:.55rem 1.3rem; border-radius:999px; background:var(--red); color:#fff; font-weight:700; font-size:.88rem;
    transition:transform var(--motion-press,120ms) var(--ease-out,ease); }
  #listing-page .amenities-library-done:active{ transform:scale(var(--press-scale,.97)); }

  /* Property policy document. */
  #listing-page .policy-upload-link{ display:flex; align-items:center; justify-content:center; min-height:4.5rem; padding:1rem; border:1.5px dashed var(--line-strong); border-radius:14px;
    background:var(--field); color:var(--muted); font-weight:600; font-size:.88rem; cursor:pointer; text-align:center; }
  @media (hover:hover){ #listing-page .policy-upload-link:hover{ border-color:var(--red); color:var(--ink); } }
  #listing-page .policy-file-name{ display:none; align-items:center; gap:.6rem; margin-top:.45rem; font-size:.84rem; color:var(--muted); }
  #listing-page .policy-file-name.show{ display:flex; }
  #listing-page :is(.policy-preview-btn, .policy-remove){ padding:0; border:0; background:none; font-size:.84rem; font-weight:600; text-decoration:underline; text-underline-offset:2px; color:var(--ink); }
  #listing-page .policy-remove{ color:var(--red); }
  #listing-page .policy-preview-overlay{ position:absolute; inset:0; z-index:10; display:none; flex-direction:column; overflow:hidden; background:#1a1210; }
  #listing-page .policy-preview-overlay.show{ display:flex; }
  #listing-page .policy-preview-toolbar{ display:flex; align-items:center; justify-content:space-between; gap:.6rem; padding:.65rem 1rem; background:rgba(0,0,0,.45); color:#eee; font-size:.8rem; }
  #listing-page .policy-preview-close{ width:30px; height:30px; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.14); color:#fff; }
  #listing-page .policy-preview-frame{ flex:1; border:0; background:#fff; }

  /* ---------- Price and booking ---------- */
  #listing-page .price-preview{ display:flex; align-items:baseline; gap:.35rem; margin:-.4rem 0 1.4rem; }
  #listing-page .price-preview .amount{ font-size:2rem; font-weight:700; letter-spacing:-.02em; line-height:1; }
  #listing-page .price-preview .unit{ font-size:.95rem; color:var(--muted); }

  /* ---------- Review ---------- */
  #listing-page .review-card{ display:flex; align-items:center; gap:1rem; padding:1rem; margin-bottom:1.2rem; border:1px solid var(--line); border-radius:16px; background:var(--field); }
  #listing-page .review-card .review-thumb{ width:72px; height:72px; flex:none; border-radius:12px; overflow:hidden; background:var(--chip); object-fit:cover; }
  #listing-page .review-card .review-thumb.placeholder{ display:flex; align-items:center; justify-content:center; padding:.3rem; text-align:center; font-size:.68rem; color:var(--muted); }
  #listing-page .review-card h4{ font-size:1.05rem; font-weight:700; margin-bottom:.15rem; }
  #listing-page .review-card .review-meta{ font-size:.82rem; color:var(--muted); margin-bottom:.2rem; }
  #listing-page .review-card .review-price{ font-size:.9rem; font-weight:700; color:var(--red); }
  #listing-page .review-checklist{ margin-bottom:1.4rem; font-size:.88rem; line-height:1.9; color:var(--muted); }
  #listing-page .review-checklist li{ display:flex; gap:.55rem; }
  #listing-page .review-checklist .check{ color:var(--ok); font-weight:800; }
  /* The review's carousel of every chosen photo and video, on every screen size. */
  #listing-page .review-gallery{ position:absolute; inset:0; z-index:2; overflow:hidden; background:#000; border-radius:inherit; outline:none; }
  #listing-page .review-gallery:focus-visible{ box-shadow:inset 0 0 0 3px rgba(196,30,58,.6); }
  #listing-page .review-gallery-track{ display:flex; width:100%; height:100%; overflow-x:auto; scroll-snap-type:x mandatory; scrollbar-width:none; overscroll-behavior-x:contain; }
  #listing-page .review-gallery-track::-webkit-scrollbar{ display:none; }
  #listing-page .review-gallery-slide{ flex:0 0 100%; height:100%; scroll-snap-align:start; }
  #listing-page .review-gallery-slide :is(img, video){ width:100%; height:100%; object-fit:cover; display:block; }
  #listing-page .review-gallery-count{ position:absolute; top:1rem; right:1rem; z-index:1; padding:.3rem .65rem; border-radius:999px; background:rgba(20,14,12,.6); color:#fff; font-size:.78rem; font-weight:600; }
  #listing-page .review-gallery-controls{ position:absolute; inset:auto 0 1rem; z-index:1; display:flex; align-items:center; justify-content:center; gap:.6rem; pointer-events:none; }
  #listing-page .review-gallery-controls > *{ pointer-events:auto; }
  #listing-page .review-gallery-arrow{ width:2.4rem; height:2.4rem; display:grid; place-items:center; border:0; border-radius:50%; background:rgba(20,14,12,.6); color:#fff; font-size:1.3rem; line-height:1; cursor:pointer;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease); }
  @media (hover:hover){ #listing-page .review-gallery-arrow:hover{ background:rgba(20,14,12,.85); } }
  #listing-page .review-gallery-dots{ display:flex; gap:.35rem; padding:.45rem .6rem; border-radius:999px; background:rgba(20,14,12,.5); }
  #listing-page .review-gallery-dot{ width:.45rem; height:.45rem; padding:0; border:0; border-radius:999px; background:rgba(255,255,255,.55); cursor:pointer;
    transition:width var(--motion-quick,200ms) var(--ease-in-out,ease-in-out); }
  #listing-page .review-gallery-dot.active{ width:1.1rem; background:#fff; }
  #listing-page :is(.review-gallery-arrow, .review-gallery-dot):focus-visible{ outline:2px solid #fff; outline-offset:2px; }

  #listing-page .submit-row{ display:flex; flex-wrap:wrap; gap:.6rem; margin-top:auto; padding-top:1rem; }
  #listing-page .submit-row [hidden]{ display:none !important; }
  #listing-page .submit-btn{ display:flex; align-items:center; justify-content:center; gap:.5rem; min-height:52px; padding:.85rem 1.4rem; border-radius:999px; font-weight:600; font-size:1rem;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  #listing-page .submit-btn{ flex:1 1 100%; background:var(--red); color:#fff; }
  @media (hover:hover){ #listing-page .submit-btn:not(:disabled):hover{ background:var(--red-deep); } }
  #listing-page .submit-btn:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  #listing-page .submit-btn:disabled{ opacity:.5; cursor:not-allowed; }

  /* The plan choice: the pricing page (PRICING_STYLES) over the whole step card until the host can publish. */
  #listing-page .step-frame.active{ position:relative; }
  #listing-page .tier-choice-overlay{ position:absolute; inset:0; z-index:14; overflow-y:auto; overscroll-behavior:contain; border-radius:inherit; container-type:inline-size;
    animation:lw-fade-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  #listing-page .tier-choice-overlay .pricing-page{ min-height:100%; }
  #listing-page .tier-choice-overlay .pricing-wrap{ padding-top:2.2em; }
  #listing-page .tier-choice-title{ position:relative; z-index:1; text-align:center; font-size:2.3em; font-weight:700; letter-spacing:-.02em; line-height:1.15; }
  #listing-page .tier-choice-sub{ position:relative; z-index:1; max-width:56ch; margin:.5em auto 1.6em; text-align:center; font-size:1.1em; line-height:1.5; color:var(--muted); }
  #listing-page .tier-choice-back{ position:relative; z-index:1; display:block; width:max-content; margin:1.6em auto 0; color:var(--muted); font-size:1em; font-weight:600; text-decoration:underline; text-underline-offset:3px; }
  #listing-page .tier-choice-back:focus-visible{ outline:3px solid rgba(196,30,58,.45); outline-offset:2px; }
  /* Four plans (Hotel) in a card narrower than the screen: two rows. */
  @container (max-width:1000px){ #listing-page .tier-choice-overlay .plans.plans--four{ grid-template-columns:repeat(2, minmax(0,1fr)); } }
  /* Phones: the step card is only as tall as its form, so the plans cover the screen. */
  @media (max-width:900px){ #listing-page .tier-choice-overlay{ position:fixed; z-index:300; border-radius:0; } }
  #listing-page .form-note{ flex:1 1 100%; margin-top:.3rem; text-align:center; font-size:.8rem; color:var(--muted); }

  /* ---------- Moving on ---------- */
  #listing-page .wz-step-alert{ display:none; margin-top:1rem; padding:.75rem .95rem; border-radius:12px; background:var(--red-tint); color:var(--red-deep); font-size:.88rem; font-weight:600; line-height:1.4; }
  html[data-theme="dark"] #listing-page .wz-step-alert{ color:#ff9aa7; }
  #listing-page .wz-step-alert.show{ display:block; animation:lw-alert-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  #listing-page .panel-actions{ position:sticky; bottom:0; z-index:3; display:flex; flex-direction:column; align-items:stretch; gap:.6rem; margin:auto calc(-1 * clamp(1.5rem,3vw,2.5rem)) 0;
    padding:1.4rem clamp(1.5rem,3vw,2.5rem) clamp(1.2rem,2.4vw,1.8rem); background:linear-gradient(to top, var(--card) 82%, transparent); }
  #listing-page .step-frame[data-step="5"] .panel-actions{ position:static; background:none; padding-top:.6rem; }
  #listing-page .panel-actions-row{ display:flex; align-items:center; gap:.8rem; }
  #listing-page .panel-actions .wz-step-alert{ margin-top:0; }
  #listing-page .step-btn{ display:inline-flex; align-items:center; justify-content:center; gap:.4rem; min-height:50px; padding:.8rem 1.4rem; border-radius:999px; font-weight:600; font-size:.95rem; white-space:nowrap;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  #listing-page .step-btn.next{ flex:1; background:var(--red); color:#fff; }
  #listing-page .step-btn.back{ color:var(--muted); padding-inline:.9rem; }
  @media (hover:hover){ #listing-page .step-btn.next:hover{ background:var(--red-deep); } #listing-page .step-btn.back:hover{ color:var(--ink); background:var(--field); } }
  #listing-page .step-btn:active{ transform:scale(var(--press-scale,.97)); }
  #listing-page .step-btn:disabled{ opacity:.55; cursor:not-allowed; }

  /* Notices (saved, published, errors). */
  #listing-page .success-msg{ display:none; }
  #listing-page .success-msg.show{ display:block; position:fixed; z-index:40; left:50%; bottom:1.5rem; width:min(92vw, 34rem); transform:translateX(-50%);
    animation:lw-toast-in var(--motion-standard,250ms) var(--ease-out,ease) both; }
  #listing-page .success-msg .inner{ display:flex; align-items:flex-start; gap:.8rem; padding:1rem 1.1rem; border:1px solid var(--line); border-radius:16px; background:var(--card); box-shadow:0 18px 48px rgba(0,0,0,.18); font-size:.92rem; line-height:1.45; }
  #listing-page .success-msg #success-msg-inner{ flex:1; min-width:0; }
  #listing-page .success-msg.error .inner{ border-color:rgba(196,30,58,.35); background:#FBE9E9; color:var(--red-deep); }
  html[data-theme="dark"] #listing-page .success-msg.error .inner{ background:#2a0f14; color:#ff9aa7; }
  #listing-page .success-msg a{ color:var(--red); font-weight:600; text-decoration:underline; }
  #listing-page .success-msg-close{ width:2rem; height:2rem; margin:-.3rem -.3rem 0 0; border-radius:50%; font-size:1.4rem; line-height:1; }

  /* ---------- Photo viewer (outside the card) ---------- */
  .photo-lightbox{ display:none; position:fixed; inset:0; z-index:400; align-items:center; justify-content:center; padding:2rem; background:rgba(10,7,6,.92); }
  .photo-lightbox.show{ display:flex; animation:lw-fade-in var(--motion-quick,200ms) var(--ease-out,ease) both; }
  .photo-lightbox-media, .photo-lightbox-media :is(img, video){ max-width:92vw; max-height:86vh; display:block; border-radius:12px; }
  .photo-lightbox-close{ position:fixed; top:1.4rem; right:1.4rem; width:42px; height:42px; border:0; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.14); color:#fff; font-size:1.3rem; cursor:pointer; }

  /* ---------- "Leave this listing?" ---------- */
  .listing-leave-dialog{ position:fixed; inset:0; margin:auto; width:min(28rem, calc(100vw - 2rem)); max-height:calc(100dvh - 2rem); overflow:auto; padding:0;
    border:1px solid var(--line); border-radius:22px; background:var(--card); color:var(--ink); box-shadow:0 24px 70px rgba(0,0,0,.3); }
  .listing-leave-dialog:not([open]){ display:none; }
  .listing-leave-dialog[open]{ display:block; animation:lw-pop-in var(--motion-standard,250ms) var(--ease-out,ease) both; }
  .listing-leave-dialog::backdrop{ background:rgba(0,0,0,.4); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); }
  body.listing-leave-fallback::before{ content:''; position:fixed; inset:0; z-index:9998; background:rgba(0,0,0,.4); }
  body.listing-leave-fallback .listing-leave-dialog{ z-index:9999; }
  .listing-leave-card{ padding:clamp(1.25rem,4vw,1.6rem); }
  .listing-leave-dialog h2{ margin:0 0 .5rem; font-size:1.2rem; font-weight:700; line-height:1.25; }
  .listing-leave-dialog p{ margin:0; color:var(--muted); line-height:1.5; font-size:.92rem; }
  .listing-leave-actions{ display:grid; gap:.55rem; margin-top:1.2rem; }
  .listing-leave-actions button{ min-height:48px; padding:.7rem 1rem; border:1px solid var(--line); border-radius:999px; background:var(--card); color:var(--ink); font:inherit; font-size:.95rem; font-weight:600; cursor:pointer;
    transition:background-color var(--motion-micro,150ms) var(--ease-out,ease), transform var(--motion-press,120ms) var(--ease-out,ease); }
  .listing-leave-actions button[data-leave-action="save"]{ border-color:var(--red); background:var(--red); color:#fff; }
  .listing-leave-actions button:is([data-leave-action="discard"], [data-leave-action="confirm-discard"]){ border-color:rgba(196,30,58,.4); color:var(--red); }
  .listing-leave-actions button:not(:disabled):active{ transform:scale(var(--press-scale,.97)); }
  .listing-leave-actions button:focus-visible{ outline:3px solid rgba(196,30,58,.45); outline-offset:2px; }
  .listing-leave-actions button:disabled{ opacity:.6; cursor:wait; }

  /* ---------- Motion (animation.md) ---------- */
  #listing-page.nav-forward .step-frame.active .step-panel > :not(.panel-actions){ animation:lw-from-right var(--motion-standard,250ms) var(--ease-out,ease) both; }
  #listing-page.nav-back .step-frame.active .step-panel > :not(.panel-actions){ animation:lw-from-left var(--motion-standard,250ms) var(--ease-out,ease) both; }
  #listing-page:is(.nav-forward, .nav-back) .step-frame.active .step-photo{ animation:lw-fade-in var(--motion-standard,250ms) var(--ease-out,ease) both; }
  @keyframes lw-from-right{ from{ opacity:0; transform:translateX(24px); } to{ opacity:1; transform:none; } }
  @keyframes lw-from-left{ from{ opacity:0; transform:translateX(-24px); } to{ opacity:1; transform:none; } }
  @keyframes lw-fade-in{ from{ opacity:0; } to{ opacity:1; } }
  @keyframes lw-pop-in{ from{ opacity:0; transform:scale(.95); } to{ opacity:1; transform:none; } }
  @keyframes lw-alert-in{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:none; } }
  @keyframes lw-toast-in{ from{ opacity:0; transform:translate(-50%, 12px); } to{ opacity:1; transform:translateX(-50%); } }

  /* ---------- Narrower screens ---------- */
  @media (max-width:1100px){
    #listing-page .step-frame.active{ grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr); }
  }
  @media (max-width:900px){
    #listing-page{ padding:1rem 1rem calc(6rem + env(safe-area-inset-bottom)); }
    #listing-page .step-frame.active{ grid-template-columns:1fr; height:auto; overflow:clip; border-radius:20px; }
    #listing-page .step-panel{ overflow:visible; }
    /* The photo becomes a short banner above the form; the review keeps a swipeable gallery. */
    #listing-page .step-photo{ order:-1; height:150px; }
    #listing-page .step-photo-caption, #listing-page .step-photo-badge{ display:none; }
    #listing-page .step-frame:is([data-step="5"], [data-step="6"]) .step-photo{ height:clamp(15rem, 40dvh, 24rem); }
    /* The policy preview and amenities library cover the screen on phones. */
    #listing-page .policy-preview-overlay{ position:fixed; z-index:300; }
    #listing-page .amenities-library-overlay.mobile-amenities-overlay{ position:absolute; inset:var(--amenities-overlay-top, 0px) 0 var(--amenities-overlay-bottom, 0px); align-items:stretch; justify-content:stretch; padding:.5rem; border-radius:0 0 20px 20px; }
    #listing-page .amenities-library-overlay.mobile-amenities-overlay .amenities-library-dialog{ width:100%; height:100%; max-height:none; }
    /* The actions stay pinned to the bottom of the screen. */
    #listing-page .panel-actions{ position:fixed; z-index:20; left:0; right:0; bottom:0; margin:0; padding:.7rem 1rem calc(.6rem + env(safe-area-inset-bottom));
      background:var(--page); box-shadow:0 -10px 18px -14px rgba(0,0,0,.35); }
    #listing-page .step-frame[data-step="5"] .panel-actions{ position:static; margin:1rem 0 0; padding:0; background:none; }
    #listing-page .step-panel{ padding:1.4rem 1.25rem calc(5rem + env(safe-area-inset-bottom)); }
    #listing-page .step-frame[data-step="5"] .step-panel{ padding-bottom:1.4rem; }
    #listing-page .success-msg.show{ bottom:calc(1rem + env(safe-area-inset-bottom)); }
  }
  @media (max-width:600px){
    #listing-page .wz-progress-name{ display:none; }
    #listing-page .wz-progress-head{ flex-direction:column; gap:.15rem; }
    #listing-page .listing-save-status{ text-align:left; }
    #listing-page :is(.field-row, .option-grid){ grid-template-columns:1fr; }
    #listing-page :is(.hotel-offer-mode, .property-purpose-mode){ grid-template-columns:1fr; }
    #listing-page .amenities-library-options{ grid-template-columns:1fr; }
  }

  @media (prefers-reduced-motion:reduce){
    #listing-page *, #listing-page *::before, #listing-page *::after, .listing-leave-dialog, .listing-leave-dialog *, .photo-lightbox{ animation-duration:1ms !important; animation-delay:0ms !important; transition-duration:1ms !important; }
    #listing-page :is(.step-btn, .submit-btn, .amenities-library-open, .amenities-library-done, .office-shop-type button, .hotel-offer-option, .property-purpose-option, .sale-mode-option):active,
    .listing-leave-actions button:active{ transform:none; }
  }
`;
