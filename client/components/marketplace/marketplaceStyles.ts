// Styles for /marketplace, ported from legacy-pages/marketplace.html and
// scoped under .marketplace-page; the html/body rules are the page's own
// (this style exists only while Marketplace is mounted). The Filters panel,
// hidden at every width before, was removed with its rules.

export const MARKETPLACE_STYLES = `
  :root{
    --bg-surface: #121212;
    --card-bg: #1E1E1E;
    --card-bg-hover: #2A2A2A;
    --text-primary: #FFFFFF;
    --text-secondary: #A1A1AA;
    --accent-cta: #FF385C;
    --accent-link: #FF6B81;
    --border-subtle: #3F3F46;
    --radius-lg: 12px;
    --radius-sm: 6px;
    --red: var(--accent-cta); --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3; --nav-active-bg:#E9E7E2;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
    --line:#E4E1DA;
    --line-soft:#E4E1DA;
  }
  [data-theme="dark"]{
    /* Keep the marketplace on the same continuous VaRoom dark canvas as
       the dashboards. Listing cards are delineated by their outline and
       imagery, rather than a second dark slab behind every property. */
    --bg-surface: #000000;
    --card-bg: #000000;
    --card-bg-hover: #0d0d0d;
    --border-subtle: rgba(255,255,255,.10);
    --white: var(--bg-surface); --paper: var(--bg-surface); --ink: var(--text-primary); --muted: var(--text-secondary); --nav-active-bg:rgba(255,255,255,.14);
    --line: rgba(255,255,255,.12);
    --line-soft: rgba(255,255,255,.07);
  }
  .marketplace-page, .marketplace-page *{ margin:0; padding:0; box-sizing:border-box; }
  html{ overflow-x:hidden; font-size:1rem !important; }
  body{ font-family:var(--font-body); font-size:1rem !important; background:var(--paper); color:var(--ink); min-height:100vh; }
  .marketplace-page a{ color:inherit; text-decoration:none; }
  .marketplace-page button, .marketplace-page input, .marketplace-page select{ font-family:inherit; }
  .marketplace-page :focus-visible{ outline:3px solid var(--red-deep); outline-offset:3px; }
  .marketplace-page .mkt-header{
    display:flex; align-items:center; gap:1rem; padding:1rem 1.4rem;
    border-bottom:1px solid var(--line); background:var(--white); flex-wrap:wrap;
  }
  .marketplace-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.3rem; display:flex; align-items:baseline; white-space:nowrap; }
  .marketplace-page .logo .va{ color:var(--red); }
  .marketplace-page .logo .room{ color:var(--ink); }
  .marketplace-page .mode-switch{
    display:flex; align-items:center; gap:.4rem; font-size:.82rem; color:var(--muted); font-weight:600;
    padding:.35rem .5rem; border-radius:100px; background:var(--paper);
  }
  .marketplace-page .mode-switch a{ padding:.3rem .7rem; border-radius:100px; }
  .marketplace-page .mode-switch a.active{ background:var(--red); color:#fff; }
  .marketplace-page .search-bar{
    flex:1; display:flex; align-items:center; gap:.65rem; min-width:280px; max-width:980px;
  }
  .marketplace-page .search-field{ display:flex; align-items:center; min-height:46px; padding:.55rem .95rem; min-width:150px; border:1px solid var(--line); border-radius:12px; background:var(--white); transition:border-color .2s, box-shadow .2s; }
  .marketplace-page .search-field:first-child{ flex:1; min-width:260px; }
  .marketplace-page .search-field:focus-within{ border-color:var(--red); box-shadow:0 0 0 3px rgba(196,30,58,.12); }
  .marketplace-page .search-field label{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0,0,0,0); }
  .marketplace-page .search-field input, .marketplace-page .search-field select{ border:none; background:none; color:var(--ink); font-size:.86rem; outline:none; width:100%; }
  .marketplace-page .search-field input::placeholder{ color:var(--muted); opacity:1; }
  .marketplace-page .search-field select option{ background:var(--white); color:var(--ink); }
  .marketplace-page .search-submit{ min-height:46px; background:var(--red); color:#fff; border:1px solid var(--red); border-radius:12px; padding:0 1.25rem; font-weight:700; font-size:.86rem; cursor:pointer; }
  .marketplace-page .search-submit:hover{ background:var(--red-deep); }
  .marketplace-page .mkt-body{ display:flex; align-items:flex-start; min-width:0; }
  .marketplace-page .results-col{ order:1; flex:1 1 auto; padding:1.8rem clamp(1rem, 2.5vw, 2.5rem) 3rem; min-width:0; }
  .marketplace-page .image-fallback{ display:block; width:100%; height:100%; }
  .marketplace-page .card-media .placeholder, .marketplace-page .card-media-empty, .marketplace-page .media-loading, .marketplace-page .card-media.is-loading, .marketplace-page .card-media-loading{
    display:flex; align-items:center; justify-content:center; height:100%; color:var(--ink); background:linear-gradient(180deg, rgba(15,19,24,.08), rgba(15,19,24,.02));
    font-size:.78rem; text-align:center; padding:1rem;
  }
  .marketplace-page .card-media-empty{ background:linear-gradient(180deg, rgba(10,12,15,.92), rgba(10,12,15,.84)); }
  .marketplace-page .media-loading, .marketplace-page .card-media.is-loading, .marketplace-page .card-media-loading{ position:relative; background:rgba(10,12,15,.9); }
  .marketplace-page .media-loading::before, .marketplace-page .card-media.is-loading::before, .marketplace-page .card-media-loading::before{
    content:""; width:18px; height:18px; border:2px solid rgba(255,255,255,.2); border-top-color:rgba(255,255,255,.8); border-radius:50%;
    animation:spin .8s linear infinite; display:block; position:relative;
  }
  @keyframes spin{to{ transform:rotate(360deg); } }
  .marketplace-page .skeleton{ background:linear-gradient(90deg,var(--paper) 25%,var(--line-soft) 50%,var(--paper) 75%); background-size:200% 100%; animation:skeleton-shimmer 1.4s infinite; }
  .marketplace-page .skeleton-card{ pointer-events:none; }
  .marketplace-page .skeleton-line{ height:.75rem; border-radius:5px; }
  .marketplace-page .skeleton-line.title{ width:72%; height:1rem; }
  .marketplace-page .skeleton-line.host{ width:55%; }
  .marketplace-page .skeleton-line.price{ width:38%; }
  @keyframes skeleton-shimmer{to{ background-position:-200% 0; } }
  .marketplace-page .empty-state{ padding:3rem 1rem; text-align:center; color:var(--muted); }
  .marketplace-page .empty-state h2{ font-family:var(--font-display); color:var(--ink); font-size:1.15rem; margin-bottom:.4rem; }
  .marketplace-page .pagination{ display:flex; align-items:center; justify-content:center; gap:.4rem; margin-top:2rem; }
  .marketplace-page .pagination button{
    min-width:36px; height:36px; border-radius:8px; border:1px solid var(--line); background:var(--white);
    color:var(--ink); font-size:.85rem; cursor:pointer;
  }
  .marketplace-page .pagination button.active{ background:var(--red); color:#fff; border-color:var(--red); }
  .marketplace-page .pagination button[disabled]{ opacity:.4; cursor:not-allowed; }
  .marketplace-page .load-more{ min-width:120px; padding:0 1rem; }
  .marketplace-page .card-video{ width:100%; height:100%; object-fit:cover; display:block; }
  .marketplace-page .card-video video{ width:100%; height:100%; object-fit:cover; display:block; background:var(--paper); }
  .marketplace-page .card-media-loading{
    display:grid; place-items:center; aspect-ratio:4/3; background:#050505;
  }
  .marketplace-page .card-media-loading::before{
    content:''; width:1.5rem; height:1.5rem; border:2px solid rgba(255,255,255,.2);
    border-top-color:rgba(255,255,255,.85); border-radius:50%;
    animation:varoom-video-spin .8s linear infinite;
  }
  @keyframes varoom-video-spin{to{ transform:rotate(360deg); } }
  .marketplace-page .mobile-marketplace-tools{ display:none; }
  @media (min-width: 861px){
    .marketplace-page .mkt-header{ display:grid; grid-template-columns:1fr auto; gap:.8rem; padding:.8rem 1.4rem; border-bottom:1px solid var(--line); }
    .marketplace-page .mkt-header .logo, .marketplace-page .mkt-header .mode-switch{ display:none; }
    .marketplace-page .search-bar{ grid-column:1; grid-row:1; max-width:660px; width:100%; }
    .marketplace-page .results-col{ padding:1.25rem clamp(1rem, 2vw, 2rem) 3rem; }
  }
  @media (max-width: 860px){
    body{ padding-bottom:4.4rem; }
    .marketplace-page .mkt-header{ display:block; padding:.8rem .8rem .3rem; border:0; background:var(--paper); }
    .marketplace-page .mkt-header .logo, .marketplace-page .mode-switch{ display:none; }
    .marketplace-page .mkt-body{ flex-direction:column; }
    .marketplace-page .search-bar{ display:none; }
    .marketplace-page .mobile-marketplace-tools{ display:block; }
    .marketplace-page .mobile-search{ display:flex; align-items:center; gap:.55rem; height:2.75rem; padding:0 .9rem; border:1px solid var(--line-soft); border-radius:999px; background:var(--white); box-shadow:0 3px 12px rgba(26,18,16,.05); }
    .marketplace-page .mobile-search svg{ flex:0 0 auto; color:var(--muted); }
    .marketplace-page .mobile-search input{ min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--ink); font-size:.78rem; }
    .marketplace-page .mobile-search input::placeholder{ color:var(--muted); opacity:1; }
    .marketplace-page .mobile-search button{ display:flex; align-items:center; justify-content:center; width:1.55rem; height:1.55rem; border:0; background:none; color:var(--muted); cursor:pointer; }
    .marketplace-page .results-col{ width:100%; padding:.35rem .8rem 1.5rem; }
    .marketplace-page .pagination{ margin-top:1rem; }
  }
  
  /* Desktop marketplace surface */
  
  @media (min-width: 861px){
    html, body{ height:100%; overflow:hidden; }
    .marketplace-page .mkt-body{ height:calc(100vh - var(--mkt-header-h)); overflow-y:auto; overflow-x:hidden; }
    body{ background:#fbfbfa; color:#202124; }
    .marketplace-page .mkt-header{
      position:relative; z-index:4; display:grid; grid-template-columns:minmax(300px, 586px) auto;
      gap:1rem; height:var(--mkt-header-h); margin-left:0; padding:22px 24px 10px 22px;
      border:0; background:#fbfbfa;
    }
    .marketplace-page .mkt-header .logo, .marketplace-page .mkt-header .mode-switch{ display:none; }
    .marketplace-page .search-bar{ grid-column:1; grid-row:1; width:100%; max-width:none; position:relative; }
    .marketplace-page .search-bar::after{
      content:"☷"; position:absolute; right:16px; top:7px; color:#374151; font-size:0.875rem;
      transform:rotate(90deg);
    }
    .marketplace-page .search-field{
      width:100%; min-height:32px; height:32px; min-width:0; padding:0 14px 0 34px;
      border:0; border-radius:999px; background:#f1f1f1;
      position:relative;
    }
    .marketplace-page .search-field::before{
      content:""; position:absolute; left:13px; width:11px; height:11px;
      border:1.5px solid #4b5563; border-radius:50%;
    }
    .marketplace-page .search-field::after{
      content:""; position:absolute; left:23px; top:17px; width:5px; height:1.5px;
      background:#4b5563; transform:rotate(45deg); transform-origin:left center;
    }
    .marketplace-page .search-field input{ font-size:0.625rem; color:#374151; }
    .marketplace-page .search-submit{ display:none; }
    .marketplace-page .search-field{ border:1px solid rgba(0,0,0,.14); }
    html[data-theme="dark"] .marketplace-page .search-field{ border-color:rgba(255,255,255,.18); }
    .marketplace-page .mkt-body{ display:block; margin-left:0; min-height:calc(100vh - var(--mkt-header-h)); }
    .marketplace-page .results-col{ width:auto; padding:8px 20px 28px; }
    .marketplace-page .pagination{ margin-top:18px; }
  }
  @media (min-width: 861px){
    body, .marketplace-page .mkt-header, .marketplace-page .results-col{ background:var(--paper); color:var(--ink); }
    .marketplace-page .search-field{ background:var(--paper); color:var(--ink); }
  }
  @media (min-width: 861px){
    .marketplace-page .mkt-header{ padding-left:22px; }
    .marketplace-page .results-col{ padding:8px 20px 28px; }
  }

  /* Listing cards: one standard at every width. A full-bleed photo, a
     category tag and a floating details panel. Cards aim for 280px wide
     (never fewer than two columns); useCardGrid's ResizeObserver sets
     --mkt-cols, and the minmax fallback below gives the same result
     before it runs. Panel sizes scale with the card (cqw), so a card
     keeps its proportions on phones and desktops alike. */
  .marketplace-page{
    --mkt-panel-bg:#FFFFFF; --mkt-panel-ink:#1B1D21; --mkt-panel-muted:#8A8F98;
    --mkt-accent:#000000; --mkt-accent-soft:rgba(0,0,0,.06); --mkt-accent-soft-hover:rgba(0,0,0,.12);
    --mkt-card-placeholder:#E9E7E2;
  }
  [data-theme="dark"] .marketplace-page{
    --mkt-panel-bg:#151515; --mkt-panel-ink:#FFFFFF; --mkt-panel-muted:#A1A1AA;
    --mkt-accent:#FFFFFF; --mkt-accent-soft:rgba(255,255,255,.10); --mkt-accent-soft-hover:rgba(255,255,255,.18);
    --mkt-card-placeholder:#1A1A1A;
  }
  .marketplace-page .grid{
    --mkt-gap:16px;
    display:grid; gap:var(--mkt-gap); align-items:start;
    grid-template-columns:repeat(auto-fill, minmax(min(280px, calc(50% - var(--mkt-gap) / 2)), 1fr));
  }
  .marketplace-page .grid[data-cols]{ grid-template-columns:repeat(var(--mkt-cols), minmax(0, 1fr)); }
  @media (max-width: 860px){
    .marketplace-page .grid{ --mkt-gap:10px; }
  }
  .marketplace-page .card{
    position:relative; container-type:inline-size; isolation:isolate; min-width:0; width:100%;
    aspect-ratio:1 / 0.95; border-radius:clamp(18px, calc(var(--mkt-card-w, 280px) * .09), 28px); overflow:hidden; background:var(--mkt-card-placeholder);
    cursor:pointer; transition:transform .2s ease, box-shadow .2s ease;
  }
  .marketplace-page .card:hover{ transform:translateY(-2px); box-shadow:0 10px 24px rgba(20,24,28,.14); }
  .marketplace-page .card:focus-visible{ outline:2px solid var(--mkt-accent); outline-offset:2px; }
  @media (hover: none){
    .marketplace-page .card:hover{ transform:none; box-shadow:none; }
  }
  .marketplace-page .card-media{ position:absolute; inset:0; overflow:hidden; background:var(--mkt-card-placeholder); }
  .marketplace-page .card-media img, .marketplace-page .card-video{ width:100%; height:100%; object-fit:cover; display:block; }
  .marketplace-page .card-media img{ transition:transform .25s ease; }
  .marketplace-page .card:hover .card-media img{ transform:scale(1.03); }
  .marketplace-page .card-media.is-loading{ position:absolute; }
  .marketplace-page .card-media.is-loading::before{ position:absolute; z-index:1; top:50%; left:50%; margin:-9px 0 0 -9px; }
  .marketplace-page .card-media-loading{ position:absolute; inset:0; height:100%; aspect-ratio:auto; }

  .marketplace-page .card-category{
    position:absolute; z-index:2; top:5cqw; left:5cqw; max-width:60%;
    padding:1.6cqw 3.8cqw; border-radius:999px; background:var(--mkt-panel-bg);
    font-size:clamp(.56rem, 3.6cqw, .75rem); font-weight:600; line-height:1.2;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:0 2px 8px rgba(0,0,0,.08);
  }
  .marketplace-page .card-category--green{ color:#1F9D55; }
  .marketplace-page .card-category--amber{ color:#D97706; }
  .marketplace-page .card-category--violet{ color:#7C3AED; }
  .marketplace-page .card-category--blue{ color:#2563EB; }
  .marketplace-page .card-category--rose{ color:#E11D48; }
  .marketplace-page .card-category--teal{ color:#0D9488; }
  [data-theme="dark"] .marketplace-page .card-category--green{ color:#4ADE80; }
  [data-theme="dark"] .marketplace-page .card-category--amber{ color:#FBBF24; }
  [data-theme="dark"] .marketplace-page .card-category--violet{ color:#A78BFA; }
  [data-theme="dark"] .marketplace-page .card-category--blue{ color:#60A5FA; }
  [data-theme="dark"] .marketplace-page .card-category--rose{ color:#FB7185; }
  [data-theme="dark"] .marketplace-page .card-category--teal{ color:#2DD4BF; }

  .marketplace-page .card-body{
    position:absolute; z-index:2; left:4cqw; right:4cqw; bottom:4cqw;
    display:flex; align-items:flex-start; gap:3cqw; padding:4.4cqw 4.4cqw 4cqw;
    border-radius:clamp(12px, 6cqw, 20px); background:var(--mkt-panel-bg); color:var(--mkt-panel-ink);
    box-shadow:0 6px 18px rgba(15,19,24,.12);
  }
  .marketplace-page .card-text{ flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:1.6cqw; }
  .marketplace-page .card-title{
    font-family:var(--font-display); font-weight:700; font-size:clamp(.72rem, 5.4cqw, 1.05rem); line-height:1.2;
    color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .marketplace-page .card-loc{
    display:flex; align-items:center; gap:1.4cqw; min-width:0;
    font-size:clamp(.56rem, 3.6cqw, .75rem); line-height:1.25; color:var(--mkt-panel-muted);
  }
  .marketplace-page .card-loc-pin{ flex:none; display:inline-flex; width:clamp(9px, 4.2cqw, 13px); height:clamp(9px, 4.2cqw, 13px); color:var(--mkt-accent); }
  .marketplace-page .card-loc-pin svg{ width:100%; height:100%; }
  .marketplace-page .card-loc-text{ min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .marketplace-page .card-price{
    margin-top:1.4cqw; font-weight:800; font-size:clamp(.74rem, 5.6cqw, 1.1rem); line-height:1.15;
    color:inherit; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .marketplace-page .card-price span{ margin-left:.15em; font-weight:500; font-size:clamp(.54rem, 3.6cqw, .75rem); color:var(--mkt-panel-muted); }
  .marketplace-page .card-save{
    flex:none; display:grid; place-items:center; width:clamp(26px, 12cqw, 36px); height:clamp(26px, 12cqw, 36px);
    border:0; border-radius:clamp(7px, 3.2cqw, 10px); background:var(--mkt-accent-soft); color:var(--mkt-accent);
    cursor:pointer; transition:background-color .15s ease;
  }
  .marketplace-page .card-save:hover{ background:var(--mkt-accent-soft-hover); }
  .marketplace-page .card-save svg{ width:48%; height:48%; }

  .marketplace-page .skeleton-card{ cursor:default; }
  .marketplace-page .skeleton-card:hover{ transform:none; box-shadow:none; }
  .marketplace-page .skeleton-card .card-text{ gap:2.4cqw; }

  /* Category strip: its own row at the top of the listings, sticky in the
     scroll container (the page on phones, .mkt-body on laptops), so the
     listings scroll beneath it. */
  .marketplace-page{ --mkt-header-h:64px; }
  .marketplace-page .category-strip{
    position:sticky; top:0; z-index:5; display:flex; gap:10px; align-items:center;
    overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none;
    margin:-8px -20px 12px; padding:10px 20px;
    background:color-mix(in srgb, var(--paper) 82%, transparent);
    -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
    box-shadow:0 1px 0 var(--line-soft);
  }
  .marketplace-page .category-strip::-webkit-scrollbar{ display:none; }
  .marketplace-page .category-chip{
    flex:0 0 auto; min-height:27px; padding:0 15px; border:0; border-radius:999px;
    background:var(--paper); color:var(--ink); font-size:0.625rem; font-weight:600; cursor:pointer; white-space:nowrap;
  }
  .marketplace-page .category-chip.active{ background:var(--ink); color:var(--white); }
  @media (max-width: 860px){
    /* hidden would make body a scroll container and unstick the strip. */
    html, body, .host-app-layout, .client-app-layout{ overflow-x:clip; }
    .marketplace-page .category-strip{ gap:.5rem; margin:-.35rem -.8rem .6rem; padding:.55rem .8rem; }
    .marketplace-page .category-chip{ min-height:2rem; padding:0 .82rem; background:var(--white); font-size:.68rem; }
    .marketplace-page .category-chip.active{ background:var(--ink); color:var(--paper); }
  }

  /* Photo carousel: a scroll-snapped strip (swipe on touch), arrows on
     hover for pointers, and a counter. */
  .marketplace-page .card-slides{
    position:absolute; inset:0; display:flex; overflow-x:auto; overflow-y:hidden;
    scroll-snap-type:x mandatory; overscroll-behavior-x:contain; scrollbar-width:none;
  }
  .marketplace-page .card-slides::-webkit-scrollbar{ display:none; }
  .marketplace-page .card-slide{ position:relative; flex:0 0 100%; height:100%; scroll-snap-align:start; scroll-snap-stop:always; }
  .marketplace-page .card-count{
    position:absolute; z-index:2; top:5cqw; right:5cqw; padding:1.4cqw 3cqw; border-radius:999px;
    background:rgba(15,19,24,.55); color:#fff; font-size:clamp(.56rem, 3.4cqw, .72rem); font-weight:600; line-height:1.2;
    -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); pointer-events:none;
  }
  .marketplace-page .card-nav{
    position:absolute; z-index:2; top:38%; transform:translateY(-50%);
    display:grid; place-items:center; width:clamp(26px, 11cqw, 34px); height:clamp(26px, 11cqw, 34px);
    border:0; border-radius:50%; background:rgba(255,255,255,.92); color:#1B1D21; cursor:pointer;
    box-shadow:0 2px 8px rgba(0,0,0,.18); opacity:0; transition:opacity .15s ease;
  }
  .marketplace-page .card-nav svg{ width:50%; height:50%; }
  .marketplace-page .card-nav--prev{ left:4cqw; }
  .marketplace-page .card-nav--next{ right:4cqw; }
  .marketplace-page .card:hover .card-nav:not(:disabled), .marketplace-page .card-nav:focus-visible{ opacity:1; }
  .marketplace-page .card-nav:disabled{ cursor:default; }
  @media (hover: none){
    .marketplace-page .card-nav{ display:none; }
  }

  /* Property beds and baths: icon + count. */
  .marketplace-page .card-rooms{ display:flex; align-items:center; gap:3.2cqw; font-size:clamp(.56rem, 3.6cqw, .75rem); font-weight:600; line-height:1.2; color:var(--mkt-panel-ink); }
  .marketplace-page .card-room{ display:inline-flex; align-items:center; gap:1.2cqw; }
  .marketplace-page .card-room-icon{ display:inline-flex; width:clamp(11px, 4.6cqw, 15px); height:clamp(11px, 4.6cqw, 15px); color:var(--mkt-accent); }
  .marketplace-page .card-room-icon svg{ width:100%; height:100%; }
`;
