// Styles for /pricing, ported unchanged from legacy-pages/pricing.html and
// scoped under .pricing-page (the page root). Rendered only on this page.

export const PRICING_STYLES = `
  
  /* ---------- Shared Varoom tokens (same set the other legacy pages use) ---------- */
  
  .pricing-page{
    --red:#C41E3A; --red-deep:#8F1229; --white:#FFFFFF; --ink:#24211E; --paper:#F7F6F3;
    --muted:#5c584f;
    --font-display:'Helvetica Neue', Arial, sans-serif; --font-body:'Helvetica Neue', Arial, sans-serif; --font-brand:'Fraunces', serif;
  }
  html[data-theme="dark"] .pricing-page{
    --white:#000000; --paper:#000000; --ink:#E7E9EA; --muted:#71767b;
  }
  .pricing-page, .pricing-page *{ margin:0; padding:0; box-sizing:border-box; }
  .pricing-page{ font-family:var(--font-body); background:var(--paper); color:var(--ink); min-height:100vh; transition:background .2s ease, color .2s ease; }
  .pricing-page a{ color:inherit; text-decoration:none; }
  .pricing-page button{ font-family:inherit; cursor:pointer; border:none; background:none; color:inherit; }
  .pricing-page :focus-visible{ outline:2px solid var(--ink); outline-offset:3px; }
  
  /* ---------- Page-only tokens, derived from the shared ones ---------- */
  
  .pricing-page{
    --pc-glass: color-mix(in srgb, var(--white) 80%, transparent);
    --pc-glass-featured: color-mix(in srgb, var(--white) 88%, transparent);
    --pc-sheen: linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,0) 45%);
    --pc-sheen-featured: linear-gradient(180deg, rgba(255,255,255,.9), rgba(255,255,255,0) 50%);
    --pc-line: rgba(36,33,30,.13);
    --pc-line-hover: rgba(36,33,30,.28);
    --pc-line-featured: rgba(36,33,30,.30);
    --pc-edge-a: rgba(255,255,255,.95);
    --pc-edge-b: rgba(36,33,30,.04);
    --pc-chip: rgba(36,33,30,.05);
    --pc-shadow: 0 22px 50px -28px rgba(36,33,30,.35), 0 2px 6px rgba(36,33,30,.05);
    --pc-shadow-hover: 0 30px 60px -28px rgba(36,33,30,.42), 0 2px 8px rgba(36,33,30,.07);
    --pc-shadow-featured: 0 34px 70px -30px rgba(36,33,30,.45), 0 2px 8px rgba(36,33,30,.07);
    --pc-glow-top: radial-gradient(55% 42% at 50% 22%, rgba(255,255,255,.95), rgba(255,255,255,0) 70%);
    --pc-glow-bottom: radial-gradient(45% 30% at 50% 100%, rgba(196,30,58,.07), rgba(196,30,58,0) 70%);
    --pc-title: clamp(4.5rem, min(15vw, 19vh), 15rem);

    /* Everything on the page is sized in em from this one value, so the whole layout
       (heading, cards, toggle) scales with the window height and fits one screen. */
    font-size:clamp(11px, 1.62vh, 17px);
    position:relative; overflow:hidden;
    min-height:100vh; min-height:100dvh;
    display:flex; flex-direction:column;
  }
  html[data-theme="dark"] .pricing-page{
    --pc-glass: color-mix(in srgb, var(--white) 72%, transparent);
    --pc-glass-featured: color-mix(in srgb, var(--white) 80%, transparent);
    --pc-sheen: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 40%);
    --pc-sheen-featured: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,0) 45%);
    --pc-line: rgba(255,255,255,.12);
    --pc-line-hover: rgba(255,255,255,.26);
    --pc-line-featured: rgba(255,255,255,.28);
    --pc-edge-a: rgba(255,255,255,.34);
    --pc-edge-b: rgba(255,255,255,.05);
    --pc-chip: rgba(255,255,255,.07);
    --pc-shadow: 0 24px 60px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(0,0,0,.25);
    --pc-shadow-hover: 0 32px 70px -30px rgba(0,0,0,.95), 0 0 40px -18px rgba(255,255,255,.18);
    --pc-shadow-featured: 0 36px 80px -32px rgba(0,0,0,.95), 0 0 60px -24px rgba(255,255,255,.22);
    --pc-glow-top: radial-gradient(55% 42% at 50% 24%, rgba(255,255,255,.075), rgba(255,255,255,0) 70%);
    --pc-glow-bottom: radial-gradient(45% 30% at 50% 100%, rgba(196,30,58,.11), rgba(196,30,58,0) 70%);
  }
  
  /* Deep, non-flat background: two soft glows, no bright colour */
  
  .pricing-page .pricing-bg{ position:absolute; inset:0; background:var(--pc-glow-top), var(--pc-glow-bottom); pointer-events:none; }
  
  /* ---------- Top bar (matches payments.html) ---------- */
  
  .pricing-page .pricing-top{ position:relative; z-index:2; display:flex; align-items:center; justify-content:space-between; padding:1.2em 2.5em; }
  .pricing-page .logo{ font-family:var(--font-brand); font-weight:900; font-size:1.7em; display:flex; align-items:baseline; }
  .pricing-page .logo .va{ color:var(--red); }
  .pricing-page .back-link{ font-size:1em; font-weight:500; color:var(--muted); }
  .pricing-page .back-link:hover{ color:var(--ink); }
  .pricing-page .pricing-wrap{ position:relative; z-index:1; flex:1; width:100%; max-width:1200px; margin:0 auto; padding:0 2.5em 2.2em; display:flex; flex-direction:column; justify-content:center; }
  .pricing-page .eyebrow{ text-align:center; font-size:.85em; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  
  /* ---------- Oversized heading: sits behind the cards, fades out ---------- */
  
  .pricing-page .pricing-title{
    position:relative; z-index:0; text-align:center; user-select:none;
    font-family:var(--font-display); font-weight:700; letter-spacing:-.045em;
    font-size:var(--pc-title); line-height:.9; padding-bottom:.14em;
    margin-bottom:calc(var(--pc-title) * -.36);
    color:var(--ink); opacity:.16;
  }
  @supports ((-webkit-background-clip:text) or (background-clip:text)){
    .pricing-page .pricing-title{
      opacity:1; color:transparent;
      background:linear-gradient(180deg, color-mix(in srgb, var(--ink) 72%, transparent) 15%, transparent 88%);
      -webkit-background-clip:text; background-clip:text;
    }
  }
  
  /* ---------- Cards ---------- */
  
  .pricing-page .plans{ position:relative; z-index:1; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:1.6em; align-items:stretch; padding-top:1em; }
  .pricing-page .plan{
    position:relative; display:flex; flex-direction:column; isolation:isolate;
    padding:1.9em 1.7em 1.6em; border-radius:20px;
    background:var(--pc-sheen), var(--pc-glass);
    border:1px solid var(--pc-line);
    -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%);
    box-shadow:var(--pc-shadow);
    transition:transform .25s ease, box-shadow .25s ease, border-color .25s ease;
  }
  
  /* soft edge reflection, drawn as a 1px gradient ring over the border */
  
  .pricing-page .plan::before{
    content:""; position:absolute; inset:-1px; border-radius:inherit; padding:1px; pointer-events:none;
    background:linear-gradient(160deg, var(--pc-edge-a), var(--pc-edge-b) 38%, var(--pc-edge-b) 62%, var(--pc-edge-a));
    -webkit-mask:linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite:xor; mask-composite:exclude;
    opacity:.75; transition:opacity .25s ease;
  }
  .pricing-page .plan:hover{ transform:translateY(-4px); border-color:var(--pc-line-hover); box-shadow:var(--pc-shadow-hover); }
  .pricing-page .plan:hover::before{ opacity:1; }
  
  /* Growth: the emphasised centre card */
  
  .pricing-page .plan--featured{
    background:var(--pc-sheen-featured), var(--pc-glass-featured);
    border-color:var(--pc-line-featured);
    box-shadow:var(--pc-shadow-featured);
    transform:translateY(-.9em);
  }
  .pricing-page .plan--featured::before{ opacity:1; }
  .pricing-page .plan--featured:hover{ transform:translateY(calc(-.9em - 4px)); border-color:var(--pc-line-hover); }
  .pricing-page .plan-price{ display:block; font-family:var(--font-display); line-height:1.05; }
  .pricing-page .plan-price .cur{ font-size:1.15em; font-weight:600; letter-spacing:.01em; margin-right:.15rem; }
  .pricing-page .plan-price .amt{ font-size:3.1em; font-weight:700; letter-spacing:-.035em; font-variant-numeric:tabular-nums; }
  .pricing-page .plan-price .per{ font-size:1.05em; font-weight:500; color:var(--muted); margin-left:.2rem; }
  .pricing-page .plan-name{ margin-top:.8em; font-size:1.1em; font-weight:700; }
  .pricing-page .plan-desc{ margin-top:.2em; font-size:1em; line-height:1.5; color:var(--muted); min-height:3.05em; }
  .pricing-page .plan-divider{ border:none; height:1px; background:var(--pc-line); margin:1.3em 0; }
  .pricing-page .plan-features{ list-style:none; display:flex; flex-direction:column; gap:.85em; flex:1; }
  .pricing-page .plan-features li{ display:flex; align-items:flex-start; gap:.75em; font-size:1em; line-height:1.4; }
  .pricing-page .plan-features .check{ flex:0 0 auto; width:1.5em; height:1.5em; margin-top:-.1em; }
  
  /* Styled directly (not via .check ancestors): <use> shadow content can't see the wrapping svg's selectors */
  
  .pricing-page .pc-ring{ fill:var(--pc-chip); stroke:var(--pc-line-hover); stroke-width:1; }
  .pricing-page .pc-tick{ fill:none; stroke:var(--ink); stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
  
  /* CTA stays pinned to the bottom of every card */
  
  .pricing-page .plan-cta{
    margin-top:1.6em; width:100%; padding:.95em 1em; border-radius:14px;
    font-size:1.05em; font-weight:600; text-align:center;
    border:1px solid var(--pc-line-hover); color:var(--ink);
    transition:background .2s ease, border-color .2s ease, transform .2s ease;
  }
  .pricing-page .plan-cta:hover{ background:var(--pc-chip); border-color:var(--ink); }
  .pricing-page .plan-cta:active{ transform:scale(.99); }
  .pricing-page .plan-cta--primary{ background:var(--ink); color:var(--paper); border-color:var(--ink); }
  .pricing-page .plan-cta--primary:hover{ background:var(--ink); opacity:.9; }
  
  /* ---------- Billing toggle ---------- */
  
  .pricing-page .billing{ display:flex; align-items:center; justify-content:center; gap:.9em; margin-top:2em; font-size:1.1em; font-weight:500; }
  .pricing-page .billing-label{ color:var(--muted); display:inline-flex; align-items:center; gap:.45rem; transition:color .2s ease; }
  .pricing-page .billing-label.is-active{ color:var(--ink); }
  .pricing-page .badge-soon{ font-size:.7em; font-weight:600; padding:.15rem .5rem; border-radius:100px; background:var(--pc-chip); color:var(--muted); }
  .pricing-page .switch{ position:relative; width:3.4em; height:1.9em; border-radius:100px; background:var(--pc-chip); border:1px solid var(--pc-line-hover); flex:0 0 auto; transition:background .2s ease, border-color .2s ease; }
  .pricing-page .switch .knob{ position:absolute; top:.2em; left:.2em; width:1.4em; height:1.4em; border-radius:50%; background:var(--ink); display:flex; align-items:center; justify-content:center; transition:transform .2s ease; }
  .pricing-page .switch .knob::after{ content:""; width:5px; height:5px; border-radius:50%; background:var(--paper); }
  .pricing-page .switch[aria-checked="true"] .knob{ transform:translateX(1.5em); }
  .pricing-page .switch[aria-disabled="true"]{ cursor:not-allowed; opacity:.65; }
  .pricing-page .pricing-msgs{ position:relative; text-align:center; margin-top:.7em; }
  .pricing-page .pricing-note{ min-height:1.3em; font-size:.95em; color:var(--muted); }
  
  /* the click message floats under the note so it never pushes the layout */
  
  .pricing-page .pricing-status{ position:absolute; left:0; right:0; top:100%; margin-top:.5em; font-size:1em; font-weight:500; color:var(--ink); }
  .pricing-page .sr-only{ position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  
  /* ---------- Responsive: desktop is the target; below this the cards simply stack ---------- */
  
  /* Hotel hosts have four plans: one row on wide screens, two rows on laptops. */
  .pricing-page .plans.plans--four{ grid-template-columns:repeat(4, minmax(0, 1fr)); gap:1.2em; }
  @media (max-width:1180px){
    .pricing-page .plans.plans--four{ grid-template-columns:repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width:980px){
    .pricing-page{ font-size:0.9375rem; overflow-x:hidden; overflow-y:auto; }
    .pricing-page .pricing-top{ padding:1.1rem 1.3rem; }
    .pricing-page .pricing-wrap{ padding:.5rem 1.3rem 4rem; justify-content:flex-start; }
    .pricing-page .plan{ padding:1.9rem 1.7rem 1.6rem; }
    .pricing-page .plans{
      display:flex; max-width:none; margin:0; gap:1.6em;
      /* Let each mobile card end with its own content instead of stretching to
         the height of the tallest card in the horizontal scroller. */
      align-items:flex-start;
      overflow-x:auto; overflow-y:hidden;
      padding:1em 1.3rem 1em 0;
      scroll-snap-type:x mandatory;
      scroll-behavior:smooth;
      scrollbar-width:none;
      -ms-overflow-style:none;
    }
    .pricing-page .plans::-webkit-scrollbar{ display:none; }
    .pricing-page .plan{
      flex:0 0 86vw; min-width:0;
      /* Keep the card visually substantial on mobile while letting future
         feature additions increase its height naturally. */
      min-height:70dvh;
      scroll-snap-align:start;
    }
    .pricing-page .plan--featured{ transform:none; }
    .pricing-page .plan--featured:hover{ transform:translateY(-4px); }
    .pricing-page .plan-desc{ min-height:0; }
  }
  @media (prefers-reduced-motion:reduce){
    .pricing-page .plan, .pricing-page .plan::before, .pricing-page .plan-cta, .pricing-page .switch, .pricing-page .switch .knob{ transition:none; }
    .pricing-page .plan:hover, .pricing-page .plan--featured:hover{ transform:none; }
    .pricing-page .plan--featured{ transform:none; }
  }
`;
