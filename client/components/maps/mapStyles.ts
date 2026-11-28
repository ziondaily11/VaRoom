// Styles for the /map page frame (header and the map's space), ported from
// legacy-pages/map.html and scoped under .map-page. The map itself is styled
// by components/maps/locationStyles.ts.

export const MAP_STYLES = `
  .map-page {
    --red:#C41E3A; --ink:#24211E; --paper:var(--va-light); --line:#E4E1DA;
    --font-brand:'Fraunces', serif;
    display:flex; flex-direction:column; height:100vh; height:100dvh; background:var(--paper); color:var(--ink);
  }
  [data-theme="dark"] .map-page { --paper:#000000; --ink:#E7E9EA; --line:rgba(255,255,255,.12); }
  .map-page a { color:inherit; text-decoration:none; }
  .map-page header { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; padding:1.2rem 1.5rem; border-bottom:1px solid var(--line); }
  .map-page .logo { font-family:var(--font-brand); font-weight:900; font-size:1.4rem; }
  .map-page .logo .va { color:var(--red); }
  .map-page .back-link { font-size:.9rem; font-weight:500; transition:color var(--motion-micro, 150ms) var(--ease-out, ease-out); }
  .map-page .back-link:hover { color:var(--red); }
  .map-page .map-stage { position:relative; flex:1 1 auto; min-height:0; }
`;
