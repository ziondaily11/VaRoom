// Styles for the not-found page (pages/404.tsx), scoped under
// .not-found-page: no :root, body, h1 or * rules, so nothing else on the
// site changes while it is open. The page always renders light, including
// under the old dark theme's `main` rule (public/js/varoom-dark-theme.css).
// Motion (animation.md): the content rises in once, 30 ms apart; buttons
// answer hover and press; reduced motion shows everything at once.

export const NOT_FOUND_STYLES = `
  .not-found-page {
    --nf-ink:#24211f; --nf-muted:#6f6a65; --nf-paper:#f7f5f1; --nf-line:#8a837c; --nf-red:#C41E3A; --nf-chip-hover:#ebe7e1;
    min-height:100vh; min-height:100dvh; display:flex; justify-content:center; overflow:hidden;
    color:var(--nf-ink); color-scheme:light; font-family:inherit;
    background:radial-gradient(circle at 50% 44%, #fffefa 0, var(--nf-paper) 62%);
  }
  html[data-theme="dark"] .not-found-page { color:var(--nf-ink) !important; background:radial-gradient(circle at 50% 44%, #fffefa 0, var(--nf-paper) 62%) !important; }
  .not-found-page *, .not-found-page *::before, .not-found-page *::after { box-sizing:border-box; }

  .not-found-page .nf-content {
    width:min(100%, 1040px); padding:clamp(2.6rem, 8vh, 5.6rem) 1.25rem 2.5rem;
    display:flex; align-items:center; flex-direction:column; text-align:center;
  }
  .not-found-page .nf-content > * { animation:nf-rise var(--motion-emphasis, 300ms) var(--ease-out, ease-out) both; }
  .not-found-page .nf-content > :nth-child(2) { animation-delay:30ms; }
  .not-found-page .nf-content > :nth-child(3) { animation-delay:60ms; }
  .not-found-page .nf-content > :nth-child(4) { animation-delay:90ms; }
  .not-found-page .nf-content > :nth-child(5) { animation-delay:120ms; }
  .not-found-page .nf-content > :nth-child(6) { animation-delay:150ms; }
  .not-found-page .nf-content > :nth-child(7) { animation-delay:180ms; }
  @keyframes nf-rise { from { opacity:0; transform:translateY(8px); } }

  .not-found-page .nf-eyebrow {
    margin:0 0 .35rem; color:var(--nf-red); font-size:.82rem; font-weight:700; line-height:1;
    letter-spacing:.18em; text-transform:uppercase; text-decoration:none; border-radius:4px;
  }
  .not-found-page .nf-eyebrow:hover { text-decoration:underline; text-underline-offset:4px; }
  .not-found-page .nf-code {
    margin:0; color:var(--nf-ink); font:400 clamp(7rem, 19vw, 12rem)/.84 Arial, sans-serif; letter-spacing:-.09em;
  }
  .not-found-page .nf-message { margin:1.25rem 0 1.25rem; font-size:clamp(.95rem, 2vw, 1.12rem); line-height:1.5; }

  .not-found-page .nf-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:.65rem; margin-bottom:1.4rem; }
  .not-found-page .nf-btn {
    display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:0 1.3rem;
    border:1px solid var(--nf-line); border-radius:999px; background:#fff; color:var(--nf-ink);
    font:inherit; font-size:.9rem; font-weight:600; text-decoration:none; cursor:pointer;
    transition:background var(--motion-micro, 150ms) var(--ease-out, ease-out), transform var(--motion-press, 120ms) var(--ease-out, ease-out);
  }
  .not-found-page .nf-btn:hover { background:var(--nf-chip-hover); }
  .not-found-page .nf-btn-primary { border-color:#292725; background:#292725; color:#fff; }
  .not-found-page .nf-btn-primary:hover { border-color:var(--nf-red); background:var(--nf-red); }
  .not-found-page .nf-btn:active { transform:scale(var(--press-scale, .97)); }

  .not-found-page .nf-search {
    width:min(100%, 380px); height:48px; display:flex; align-items:center; gap:.4rem; padding:0 .35rem 0 1.1rem;
    border:1px solid var(--nf-line); border-radius:999px; background:#fff; box-shadow:0 7px 22px rgba(56, 45, 35, .12);
    transition:box-shadow var(--motion-micro, 150ms) var(--ease-out, ease-out);
  }
  .not-found-page .nf-search:focus-within { outline:3px solid var(--nf-red); outline-offset:3px; }
  .not-found-page .nf-search input {
    min-width:0; flex:1; height:100%; border:0; outline:0; padding:0; background:transparent !important;
    color:var(--nf-ink) !important; font:inherit; font-size:.9rem; -webkit-appearance:none; appearance:none;
  }
  .not-found-page .nf-search input::placeholder { color:var(--nf-muted) !important; opacity:1; }
  .not-found-page .nf-search input::-webkit-search-cancel-button { -webkit-appearance:none; }
  .not-found-page .nf-search button {
    width:38px; height:38px; flex:0 0 auto; display:flex; align-items:center; justify-content:center;
    border:0; border-radius:50%; background:transparent; color:var(--nf-muted); cursor:pointer;
    transition:background var(--motion-micro, 150ms) var(--ease-out, ease-out), color var(--motion-micro, 150ms) var(--ease-out, ease-out), transform var(--motion-press, 120ms) var(--ease-out, ease-out);
  }
  .not-found-page .nf-search button:hover { background:var(--nf-chip-hover); color:var(--nf-ink); }
  .not-found-page .nf-search button:active { transform:scale(var(--press-scale, .97)); }

  .not-found-page .nf-art { display:block; width:min(100%, 760px); height:auto; margin:1.2rem auto .6rem; }

  .not-found-page .nf-categories { display:flex; flex-wrap:wrap; justify-content:center; gap:.65rem; }
  .not-found-page .nf-category {
    padding:.62rem 1.35rem; border:1px solid var(--nf-line); border-radius:999px; color:var(--nf-ink);
    font-size:.82rem; text-decoration:none;
    transition:transform var(--motion-micro, 150ms) var(--ease-out, ease-out), background var(--motion-micro, 150ms) var(--ease-out, ease-out);
  }
  .not-found-page .nf-category:hover { transform:translateY(-2px); background:var(--nf-chip-hover); }
  .not-found-page .nf-category:active { transform:scale(var(--press-scale, .97)); }

  .not-found-page a:focus-visible, .not-found-page button:focus-visible { outline:3px solid var(--nf-red); outline-offset:3px; }

  @media (max-width: 600px) {
    .not-found-page .nf-content { padding-top:3.2rem; }
    .not-found-page .nf-message { max-width:330px; }
    /* At least 16px (and the user's font size): iPhone does not zoom the page when the box is tapped. */
    .not-found-page .nf-search input { font-size:max(1rem, 16px); }
    .not-found-page .nf-art { margin-top:1.4rem; }
    .not-found-page .nf-category { padding:.56rem .85rem; font-size:.73rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .not-found-page .nf-content > * { animation:none; }
    .not-found-page .nf-category:hover { transform:none; }
  }
`;
