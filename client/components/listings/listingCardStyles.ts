// The Marketplace listing card's styles (MarketplaceCard), shared by
// /marketplace and the public host profile so both show the same card.
// Moved unchanged from marketplaceStyles.ts; `scope` is the class of the
// element that holds the grid (".marketplace-page" there). The scope must
// define --ink, --paper and --font-display (Marketplace's page tokens).
//
// Cards aim for 280px wide: useCardGrid's ResizeObserver sets the column
// count as CSS variables on the .grid; the minmax fallback gives the same
// result before it runs.

export const listingCardStyles = (scope: string): string => `
  ${scope} .image-fallback{ display:block; width:100%; height:100%; }
  ${scope} .card-media .placeholder, ${scope} .card-media-empty, ${scope} .card-media.is-loading, ${scope} .card-media-loading{
    display:flex; align-items:center; justify-content:center; height:100%; color:var(--ink); background:linear-gradient(180deg, rgba(15,19,24,.08), rgba(15,19,24,.02));
    font-size:.78rem; text-align:center; padding:1rem;
  }
  ${scope} .card-media-empty{ background:linear-gradient(180deg, rgba(10,12,15,.92), rgba(10,12,15,.84)); }
  ${scope} .card-media.is-loading, ${scope} .card-media-loading{ position:relative; background:rgba(10,12,15,.9); }
  /* The shared VaRoom spinner (styles/spinner.css), as on Host Home's media cards. */
  ${scope} .card-media.is-loading::before, ${scope} .card-media-loading::before{
    content:""; width:36px; height:36px; flex:none; display:block; position:relative;
    background:var(--varoom-spinner) center / contain no-repeat;
    animation:varoom-spinner-turn .8s steps(8) infinite;
  }
  ${scope} .card-video{ width:100%; height:100%; object-fit:cover; display:block; }
  ${scope} .card-video video{ width:100%; height:100%; object-fit:cover; display:block; background:var(--paper); }
  ${scope} .card-media-loading{
    display:grid; place-items:center; aspect-ratio:4/3; background:#050505;
  }

  /* Listing cards: one standard at every width. A full-bleed photo, a
     category tag and a floating details panel. Cards aim for 280px wide
     (never fewer than two columns); useCardGrid's ResizeObserver sets
     --mkt-cols, and the minmax fallback below gives the same result
     before it runs. Panel sizes scale with the card (cqw), so a card
     keeps its proportions on phones and desktops alike. */
  ${scope}{
    --mkt-panel-bg:var(--va-light); --mkt-panel-ink:#1B1D21; --mkt-panel-muted:#8A8F98;
    --mkt-accent:#000000; --mkt-accent-soft:rgba(0,0,0,.06); --mkt-accent-soft-hover:rgba(0,0,0,.12);
    --mkt-card-placeholder:#E9E7E2;
  }
  [data-theme="dark"] ${scope}{
    --mkt-panel-bg:#151515; --mkt-panel-ink:#FFFFFF; --mkt-panel-muted:#A1A1AA;
    --mkt-accent:#FFFFFF; --mkt-accent-soft:rgba(255,255,255,.10); --mkt-accent-soft-hover:rgba(255,255,255,.18);
    --mkt-card-placeholder:#1A1A1A;
  }
  ${scope} .grid{
    --mkt-gap:16px;
    display:grid; gap:var(--mkt-gap); align-items:start;
    grid-template-columns:repeat(auto-fill, minmax(min(280px, calc(50% - var(--mkt-gap) / 2)), 1fr));
  }
  ${scope} .grid[data-cols]{ grid-template-columns:repeat(var(--mkt-cols), minmax(0, 1fr)); }
  @media (max-width: 860px){
    ${scope} .grid{ --mkt-gap:10px; }
  }
  ${scope} .card{
    position:relative; container-type:inline-size; isolation:isolate; min-width:0; width:100%;
    aspect-ratio:1 / 0.95; border-radius:clamp(18px, calc(var(--mkt-card-w, 280px) * .09), 28px); overflow:hidden; background:var(--mkt-card-placeholder);
    cursor:pointer; transition:transform var(--motion-quick, 200ms) var(--ease-out, ease), box-shadow var(--motion-quick, 200ms) var(--ease-out, ease);
  }
  /* The global dark theme (public/js/varoom-dark-theme.css, on every
     route) turns any .card / .skeleton-card into a flat, square feed row
     with !important. Listing cards keep their own shape in every theme. */
  [data-theme="dark"] ${scope} .card{
    background:var(--mkt-card-placeholder) !important; border:0 !important;
    border-radius:clamp(18px, calc(var(--mkt-card-w, 280px) * .09), 28px) !important; box-shadow:none !important;
  }
  /* Motion (animation.md §8.6): one hover effect, the lift, on pointer devices only; press to .97. */
  @media (hover: hover){
    ${scope} .card:hover{ transform:translateY(-2px); box-shadow:0 10px 24px rgba(20,24,28,.14); }
    [data-theme="dark"] ${scope} .card:hover{ box-shadow:0 10px 24px rgba(20,24,28,.14) !important; }
  }
  ${scope} .card:active{ transform:scale(var(--press-scale, .97)); transition-duration:var(--motion-press, 120ms); }
  ${scope} .card:focus-visible{ outline:2px solid var(--mkt-accent); outline-offset:2px; }
  @media (prefers-reduced-motion: reduce){
    ${scope} .card, ${scope} .card-media img{ transition:none; }
    ${scope} .card:hover, ${scope} .card:active, [data-theme="dark"] ${scope} .card:hover{ transform:none; }
  }
  ${scope} .card-media{ position:absolute; inset:0; overflow:hidden; background:var(--mkt-card-placeholder); }
  ${scope} .card-media img, ${scope} .card-video{ width:100%; height:100%; object-fit:cover; display:block; }
  ${scope} .card-media.is-loading{ position:absolute; }
  ${scope} .card-media.is-loading::before{ position:absolute; z-index:1; top:50%; left:50%; margin:-18px 0 0 -18px; }
  ${scope} .card-media-loading{ position:absolute; inset:0; height:100%; aspect-ratio:auto; }

  ${scope} .card-category{
    position:absolute; z-index:2; top:5cqw; left:5cqw; max-width:60%;
    padding:1.6cqw 3.8cqw; border-radius:999px; background:var(--mkt-panel-bg);
    font-size:clamp(.56rem, 3.6cqw, .75rem); font-weight:600; line-height:1.2;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:0 2px 8px rgba(0,0,0,.08);
  }
  ${scope} .card-category--green{ color:#1F9D55; }
  ${scope} .card-category--amber{ color:#D97706; }
  ${scope} .card-category--violet{ color:#7C3AED; }
  ${scope} .card-category--blue{ color:#2563EB; }
  ${scope} .card-category--rose{ color:#E11D48; }
  ${scope} .card-category--teal{ color:#0D9488; }
  [data-theme="dark"] ${scope} .card-category--green{ color:#4ADE80; }
  [data-theme="dark"] ${scope} .card-category--amber{ color:#FBBF24; }
  [data-theme="dark"] ${scope} .card-category--violet{ color:#A78BFA; }
  [data-theme="dark"] ${scope} .card-category--blue{ color:#60A5FA; }
  [data-theme="dark"] ${scope} .card-category--rose{ color:#FB7185; }
  [data-theme="dark"] ${scope} .card-category--teal{ color:#2DD4BF; }

  ${scope} .card-body{
    position:absolute; z-index:2; left:4cqw; right:4cqw; bottom:4cqw;
    display:flex; align-items:flex-start; gap:3cqw; padding:4.4cqw 4.4cqw 4cqw;
    border-radius:clamp(12px, 6cqw, 20px); background:var(--mkt-panel-bg); color:var(--mkt-panel-ink);
    box-shadow:0 6px 18px rgba(15,19,24,.12);
  }
  ${scope} .card-text{ flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:1.6cqw; }
  ${scope} .card-title{
    font-family:var(--font-display); font-weight:700; font-size:clamp(.72rem, 5.4cqw, 1.05rem); line-height:1.2;
    color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  ${scope} .card-loc{
    display:flex; align-items:center; gap:1.4cqw; min-width:0;
    font-size:clamp(.56rem, 3.6cqw, .75rem); line-height:1.25; color:var(--mkt-panel-muted);
  }
  ${scope} .card-loc-pin{ flex:none; display:inline-flex; width:clamp(9px, 4.2cqw, 13px); height:clamp(9px, 4.2cqw, 13px); color:var(--mkt-accent); }
  ${scope} .card-loc-pin svg{ width:100%; height:100%; }
  ${scope} .card-loc-text{ min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  ${scope} .card-price{
    margin-top:1.4cqw; font-weight:800; font-size:clamp(.74rem, 5.6cqw, 1.1rem); line-height:1.15;
    color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  ${scope} .card-price span{ margin-left:.15em; font-weight:500; font-size:clamp(.54rem, 3.6cqw, .75rem); color:var(--mkt-panel-muted); }
  ${scope} .card-save{
    flex:none; display:grid; place-items:center; width:clamp(26px, 12cqw, 36px); height:clamp(26px, 12cqw, 36px);
    border:0; border-radius:clamp(7px, 3.2cqw, 10px); background:var(--mkt-accent-soft); color:var(--mkt-accent);
    cursor:pointer; transition:background-color .15s ease;
  }
  ${scope} .card-save:hover{ background:var(--mkt-accent-soft-hover); }
  ${scope} .card-save svg{ width:48%; height:48%; }

  ${scope} .skeleton-card{ cursor:default; }
  ${scope} .skeleton-card:hover, ${scope} .skeleton-card:active, [data-theme="dark"] ${scope} .skeleton-card:hover{ transform:none; box-shadow:none !important; }

  /* The owner's own card (/profile): the ⋮ menu on the photo, the status in place of Save. */
  ${scope} .card-owner{ position:absolute; z-index:3; top:4cqw; right:4cqw; }
  ${scope} .card-owner .card-menu-btn{
    width:clamp(28px, 11cqw, 34px); height:clamp(28px, 11cqw, 34px); padding:0; border:0; border-radius:50%;
    background:var(--mkt-panel-bg); color:var(--mkt-panel-ink); box-shadow:0 2px 8px rgba(0,0,0,.16); font-size:1.1rem; line-height:1;
    transition:transform var(--motion-press, 120ms) var(--ease-out, ease);
  }
  ${scope} .card-owner .card-menu-btn:active{ transform:scale(var(--press-scale, .97)); }
  ${scope} .card.has-owner .card-count{ right:calc(8cqw + clamp(28px, 11cqw, 34px)); }
  ${scope} .card-status{
    flex:none; align-self:flex-start; padding:1.4cqw 3cqw; border-radius:999px; background:var(--mkt-accent-soft);
    font-size:clamp(.54rem, 3.3cqw, .7rem); font-weight:700; letter-spacing:.03em; text-transform:uppercase; white-space:nowrap; color:var(--mkt-panel-ink);
  }
  ${scope} .card-status.available{ color:#1F9D55; }
  ${scope} .card-status.paused, ${scope} .card-status.unavailable{ color:#B45309; }
  ${scope} .card-status.booked{ color:var(--mkt-panel-muted); }
  [data-theme="dark"] ${scope} .card-status.available{ color:#4ADE80; }
  [data-theme="dark"] ${scope} .card-status.paused, [data-theme="dark"] ${scope} .card-status.unavailable{ color:#FBBF24; }
  ${scope} .skeleton-card .card-text{ gap:2.4cqw; }

  /* Photo carousel: a scroll-snapped strip (swipe on touch), arrows on
     hover for pointers, and a counter. */
  ${scope} .card-slides{
    position:absolute; inset:0; display:flex; overflow-x:auto; overflow-y:hidden;
    scroll-snap-type:x mandatory; overscroll-behavior-x:contain; scrollbar-width:none;
  }
  ${scope} .card-slides::-webkit-scrollbar{ display:none; }
  ${scope} .card-slide{ position:relative; flex:0 0 100%; height:100%; scroll-snap-align:start; scroll-snap-stop:always; }
  ${scope} .card-count{
    position:absolute; z-index:2; top:5cqw; right:5cqw; padding:1.4cqw 3cqw; border-radius:999px;
    background:rgba(15,19,24,.55); color:#fff; font-size:clamp(.56rem, 3.4cqw, .72rem); font-weight:600; line-height:1.2;
    -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); pointer-events:none;
  }
  ${scope} .card-nav{
    position:absolute; z-index:2; top:38%; transform:translateY(-50%);
    display:grid; place-items:center; width:clamp(26px, 11cqw, 34px); height:clamp(26px, 11cqw, 34px);
    border:0; border-radius:50%; background:rgba(255,255,255,.92); color:#1B1D21; cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.18); opacity:0; transition:opacity .15s ease;
  }
  ${scope} .card-nav svg{ width:50%; height:50%; }
  ${scope} .card-nav--prev{ left:4cqw; }
  ${scope} .card-nav--next{ right:4cqw; }
  ${scope} .card:hover .card-nav:not(:disabled), ${scope} .card-nav:focus-visible{ opacity:1; }
  ${scope} .card-nav:disabled{ cursor:default; }
  @media (hover: none){
    ${scope} .card-nav{ display:none; }
  }

  /* Property beds and baths: icon + count. */
  ${scope} .card-rooms{ display:flex; align-items:center; gap:3.2cqw; font-size:clamp(.56rem, 3.6cqw, .75rem); font-weight:600; line-height:1.2; color:var(--mkt-panel-ink); }
  ${scope} .card-room{ display:inline-flex; align-items:center; gap:1.2cqw; }
  ${scope} .card-room-icon{ display:inline-flex; width:clamp(11px, 4.6cqw, 15px); height:clamp(11px, 4.6cqw, 15px); color:var(--mkt-accent); }
  ${scope} .card-room-icon svg{ width:100%; height:100%; }
`;
