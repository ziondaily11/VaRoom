import { ANALYTICS_CSS } from '../analytics/analyticsStyles';

// Calendar styles (docs/host-controls/CALENDAR_UI_PLAN.md). The page wears
// the analytics look (.va-analytics: light and dark tokens), plus its own
// rules scoped to .vc. 1280px and wider: filters | month | details side by
// side. Narrower: the filters and the details slide over the page (a bottom
// sheet on phones). Place colours come in as --place. CSS only: no resize
// listeners.

export const CALENDAR_CSS = `${ANALYTICS_CSS}
.vc{--bar-top:30px;--bar-step:22px;--bar-h:19px}
.vc .vc-wrap{max-width:1600px;margin:0 auto;padding:22px clamp(14px,2.4vw,32px) 96px;display:flex;flex-direction:column;gap:16px}
.vc h1{font-size:clamp(1.3rem,2vw,1.6rem);font-weight:700;letter-spacing:-.02em;line-height:1.2}
.vc h2{font-size:1rem;font-weight:650;letter-spacing:-.01em}
.vc h3{font-size:.8rem;font-weight:650;letter-spacing:.02em;text-transform:uppercase;color:var(--mute);margin:0 0 8px}
.vc .vc-muted{color:var(--mute);font-size:.84rem}
.vc .vc-strong{color:var(--fg);font-weight:700}
.vc .vc-error{color:var(--bad-text);font-weight:550;font-size:.84rem}
.vc .vc-empty{text-align:center;padding:48px 16px;display:flex;flex-direction:column;align-items:center;gap:10px}
.vc button:disabled{opacity:.5;cursor:default}
.vc .vc-only-narrow{display:none !important}

/* ---------- buttons ---------- */
.vc .vc-pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:.84rem;font-weight:600;color:var(--fg);text-decoration:none;white-space:nowrap}
.vc .vc-pill:hover:not(:disabled){border-color:var(--fg)}
.vc .vc-pill.is-on{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
.vc .vc-pill.is-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.vc .vc-btn{display:inline-flex;align-items:center;justify-content:center;padding:9px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-weight:650;font-size:.84rem;color:var(--fg);white-space:nowrap}
.vc .vc-btn:hover:not(:disabled){border-color:var(--fg)}
.vc .vc-btn.is-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.vc .vc-btn.is-danger{color:var(--bad-text);border-color:var(--bad-soft);margin-right:auto}
.vc .vc-btn.is-wide{width:100%}
.vc .vc-textbtn{border:0;background:none;padding:0;color:var(--accent);font-size:.82rem;font-weight:600;cursor:pointer;white-space:nowrap}
.vc .vc-link{font-size:.84rem;font-weight:600;color:var(--accent);text-decoration:none}
.vc .vc-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.vc .vc-toggle{display:inline-flex;padding:3px;border-radius:999px;border:1px solid var(--line);background:var(--card)}
.vc .vc-toggle button{border:0;background:transparent;padding:6px 12px;border-radius:999px;font-size:.82rem;font-weight:600;color:var(--mute)}
.vc .vc-toggle button[aria-pressed="true"]{background:var(--fg);color:var(--canvas)}
.vc .vc-nav{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;background:var(--card);overflow:hidden}
.vc .vc-nav button{border:0;background:transparent;height:36px;min-width:36px;padding:0 12px;font-weight:650;color:var(--fg)}
.vc .vc-nav button + button{border-left:1px solid var(--line)}
.vc .vc-nav button:hover{background:var(--soft)}
.vc .vc-close,.vc .vc-back{border:0;background:var(--soft);width:32px;height:32px;border-radius:999px;font-size:1.2rem;line-height:1;display:inline-grid;place-items:center;color:var(--fg);flex:none}

/* ---------- header ---------- */
.vc .vc-head{display:flex;flex-wrap:wrap;gap:14px 20px;justify-content:space-between;align-items:center}
.vc .vc-head-date{display:flex;align-items:center;gap:14px}
.vc .vc-tile{width:58px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--card);text-align:center;box-shadow:var(--shadow)}
.vc .vc-tile span{display:block;background:var(--accent);color:#fff;font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 0}
.vc .vc-tile strong{display:block;font-size:1.45rem;font-weight:750;padding:4px 0 6px;font-variant-numeric:tabular-nums}
.vc .vc-head-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center}

/* ---------- three columns ---------- */
.vc .vc-shell{display:grid;grid-template-columns:264px minmax(0,1fr) 340px;gap:16px;align-items:start}
.vc .vc-side,.vc .vc-details,.vc .vc-main{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow)}
.vc .vc-side,.vc .vc-details{position:sticky;top:16px;max-height:calc(100vh - 32px);overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:18px}
.vc .vc-main{padding:14px;min-width:0}
.vc .vc-main-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:2px 4px 12px}
.vc .vc-scrim{position:fixed;inset:0;z-index:55;border:0;background:rgba(0,0,0,.38)}

/* ---------- left column ---------- */
.vc .vc-mini-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.vc .vc-mini-head strong{font-size:.9rem}
.vc .vc-mini-head button{border:0;background:transparent;width:28px;height:28px;border-radius:999px;color:var(--fg);font-weight:700}
.vc .vc-mini-head button:hover{background:var(--soft)}
.vc .vc-mini-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px;text-align:center}
.vc .vc-mini-dow{font-size:.68rem;font-weight:650;color:var(--dim);padding:2px 0 4px}
.vc .vc-mini-day{position:relative;border:0;background:transparent;height:30px;border-radius:999px;font-size:.8rem;font-weight:600;color:var(--fg);font-variant-numeric:tabular-nums}
.vc .vc-mini-day:hover{background:var(--soft)}
.vc .vc-mini-day.is-past{color:var(--dim)}
.vc .vc-mini-day.is-today{color:var(--accent)}
.vc .vc-mini-day.is-selected{background:var(--fg);color:var(--canvas)}
.vc .vc-mini-day i{position:absolute;left:50%;bottom:3px;width:4px;height:4px;margin-left:-2px;border-radius:999px;background:var(--accent)}
.vc .vc-checks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.vc .vc-checks li{display:flex;align-items:center;gap:6px;border-radius:10px;padding:2px 4px}
.vc .vc-checks li:hover{background:var(--soft)}
.vc .vc-checks label{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:.86rem;font-weight:550;padding:5px 0;cursor:pointer}
.vc .vc-checks label span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vc .vc-checks input{width:16px;height:16px;flex:none}
.vc .vc-swatch{display:inline-block;width:10px;height:10px;border-radius:3px;flex:none;margin-right:6px;vertical-align:middle}
.vc .vc-checks .vc-swatch{margin-right:0}
.vc .vc-gear{border:0;background:transparent;width:28px;height:28px;border-radius:999px;color:var(--mute);font-size:.95rem;flex:none}
.vc .vc-gear:hover{background:var(--hair);color:var(--fg)}
.vc .vc-kind-dot{width:10px;height:10px;border-radius:3px;flex:none;background:var(--good)}
.vc .vc-kind-dot.is-requests{background:transparent;border:1.5px dashed var(--accent)}
.vc .vc-kind-dot.is-offline{background:var(--c2)}
.vc .vc-kind-dot.is-other{background:repeating-linear-gradient(135deg,var(--c1) 0 2px,transparent 2px 4px);border:1px solid var(--c1)}
.vc .vc-kind-dot.is-viewings{background:var(--c3)}
.vc .vc-kind-dot.is-notes{background:var(--dim)}
.vc .vc-kind-dot.is-closed{background:repeating-linear-gradient(135deg,var(--dim) 0 2px,transparent 2px 4px);border:1px solid var(--line)}
.vc .vc-coming{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vc .vc-coming button{width:100%;display:flex;flex-direction:column;gap:1px;text-align:left;border:1px solid var(--line);border-left:3px solid var(--place);border-radius:12px;background:var(--card);padding:8px 10px;color:var(--fg)}
.vc .vc-coming button:hover{background:var(--soft)}
.vc .vc-coming strong{font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vc .vc-coming-day{font-size:.74rem;font-weight:650;color:var(--mute)}

/* ---------- month ---------- */
.vc .vc-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:.76rem;color:var(--mute)}
.vc .vc-legend span{display:inline-flex;align-items:center;gap:5px}
.vc .vc-legend i{width:12px;height:8px;border-radius:3px;display:inline-block;background:color-mix(in srgb,var(--fg) 22%,var(--card));border-left:3px solid var(--fg)}
.vc .vc-legend .is-request{background:transparent;border:1.5px dashed var(--fg)}
.vc .vc-legend .is-offline{background:color-mix(in srgb,var(--fg) 34%,var(--card))}
.vc .vc-legend .is-other{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--fg) 30%,transparent) 0 2px,transparent 2px 4px)}
.vc .vc-legend .is-closed{background:repeating-linear-gradient(135deg,var(--dim) 0 2px,transparent 2px 4px);border-left:0}
.vc .vc-month-grid{display:flex;flex-direction:column;gap:4px}
.vc .vc-week{position:relative;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.vc .vc-week-head{position:static}
.vc .vc-dow{font-size:.72rem;font-weight:650;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;padding:0 8px 2px}
.vc .vc-cell{position:relative;min-height:118px;display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;gap:2px;padding:6px 8px;border-radius:12px;border:1px solid var(--hair);background:var(--card);text-align:left;color:var(--fg)}
.vc .vc-cell.is-blank{border:0;background:transparent}
.vc .vc-cell:hover:not(:disabled){border-color:var(--line);background:color-mix(in srgb,var(--soft) 60%,var(--card))}
.vc .vc-cell-top{display:flex;justify-content:space-between;align-items:center;gap:4px}
.vc .vc-num{font-size:.84rem;font-weight:650;font-variant-numeric:tabular-nums}
.vc .vc-cell.is-today .vc-num{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff}
.vc .vc-cell-price{font-size:.68rem;font-weight:700;color:var(--fg);background:var(--soft);border-radius:999px;padding:1px 6px}
.vc .vc-cell-tags{display:flex;flex-wrap:wrap;gap:2px 6px;font-size:.66rem;font-weight:650;color:var(--mute);margin-top:auto;padding-top:calc(3 * var(--bar-step))}
.vc .vc-cell-tags .is-clash{color:var(--bad-text)}
.vc .vc-cell.is-past{background:var(--soft);color:var(--dim)}
.vc .vc-cell.is-closed{background:repeating-linear-gradient(135deg,var(--soft) 0 6px,transparent 6px 12px)}
.vc .vc-cell.is-cleaning{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--soft) 70%,transparent) 0 3px,transparent 3px 9px)}
.vc .vc-cell.is-clash{box-shadow:inset 0 0 0 2px var(--bad)}
.vc .vc-cell.is-selected{box-shadow:inset 0 0 0 2px var(--fg)}
.vc .vc-cell.is-in-range{box-shadow:inset 0 0 0 2px var(--accent);background:var(--accent-soft)}
.vc .vc-cell.is-loading{background:var(--soft);animation:vc-pulse 1.2s ease-in-out infinite alternate}
.vc .vc-more{font-size:.68rem;font-weight:700;color:var(--mute)}
.vc .vc-bar{position:absolute;height:var(--bar-h);z-index:1;display:flex;align-items:center;gap:4px;min-width:0;padding:0 7px;margin:0 2px;
  border:0;border-radius:7px;font-size:.72rem;font-weight:650;text-align:left;color:var(--fg);overflow:hidden;white-space:nowrap;
  background:color-mix(in srgb,var(--place) 22%,var(--card));box-shadow:inset 3px 0 0 var(--place)}
.vc .vc-bar:hover{background:color-mix(in srgb,var(--place) 32%,var(--card))}
.vc .vc-bar.is-request{background:color-mix(in srgb,var(--place) 8%,var(--card));box-shadow:none;border:1.5px dashed var(--place)}
.vc .vc-bar.is-offline{background:color-mix(in srgb,var(--place) 36%,var(--card))}
.vc .vc-bar.is-other{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--place) 28%,var(--card)) 0 5px,color-mix(in srgb,var(--place) 14%,var(--card)) 5px 10px)}
.vc .vc-bar:is(.is-viewing,.is-note,.is-table,.is-move-in,.is-lease-end,.is-outcome){background:color-mix(in srgb,var(--place) 12%,var(--card));box-shadow:none}
.vc .vc-bar:is(.is-viewing,.is-note,.is-table,.is-move-in,.is-lease-end,.is-outcome)::before{content:"";width:6px;height:6px;border-radius:999px;background:var(--place);flex:none}
.vc .vc-bar.is-cut-left{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0}
.vc .vc-bar.is-cut-right{border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0}
.vc .vc-bar.is-selected{outline:2px solid var(--fg);outline-offset:1px}
.vc .vc-bar-time{font-variant-numeric:tabular-nums;color:var(--mute);flex:none}
.vc .vc-bar-title{overflow:hidden;text-overflow:ellipsis}
.vc .vc-month-grid.is-selecting .vc-bar{pointer-events:none;opacity:.6}

/* ---------- week and day ---------- */
.vc .vc-tg{display:flex;flex-direction:column;gap:0;border:1px solid var(--hair);border-radius:14px;overflow:hidden}
.vc .vc-tg-head,.vc .vc-tg-allday{display:grid;border-bottom:1px solid var(--hair);background:var(--card)}
.vc .vc-tg-day{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 2px;border:0;border-left:1px solid var(--hair);background:transparent;color:var(--fg)}
.vc .vc-tg-day:hover{background:var(--soft)}
.vc .vc-tg-day span{font-size:.7rem;font-weight:650;color:var(--mute);text-transform:uppercase;letter-spacing:.04em}
.vc .vc-tg-day strong{font-size:1.05rem;font-variant-numeric:tabular-nums;display:inline-grid;place-items:center;min-width:30px;height:30px;border-radius:999px}
.vc .vc-tg-day.is-today strong{background:var(--accent);color:#fff}
.vc .vc-tg-day.is-selected strong{box-shadow:0 0 0 2px var(--fg)}
.vc .vc-tg-label{font-size:.66rem;font-weight:650;color:var(--dim);text-transform:uppercase;padding:8px 4px 0 6px;letter-spacing:.03em}
.vc .vc-tg-lanes{position:relative;min-height:30px}
.vc .vc-tg-allcell{position:absolute;top:0;bottom:0;border:0;border-left:1px solid var(--hair);background:transparent;padding:0;display:flex;align-items:flex-end;justify-content:flex-end}
.vc .vc-tg-allcell.is-closed{background:repeating-linear-gradient(135deg,var(--soft) 0 6px,transparent 6px 12px)}
.vc .vc-tg-allcell.is-cleaning{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--soft) 70%,transparent) 0 3px,transparent 3px 9px)}
.vc .vc-tg-allcell.is-clash{box-shadow:inset 0 0 0 2px var(--bad)}
.vc .vc-tg-allcell .vc-more{padding:0 4px 2px}
.vc .vc-tg-scroll{max-height:min(68vh,760px);overflow-y:auto;position:relative}
.vc .vc-tg-body{display:grid;position:relative}
.vc .vc-tg-gutter{position:relative;border-right:1px solid var(--hair)}
.vc .vc-tg-gutter span{position:absolute;right:6px;transform:translateY(-50%);font-size:.68rem;font-weight:600;color:var(--dim);font-variant-numeric:tabular-nums}
.vc .vc-tg-gutter span:first-child{transform:none;top:2px!important}
.vc .vc-tg-col{position:relative;border-left:1px solid var(--hair);background:repeating-linear-gradient(to bottom,var(--hair) 0 1px,transparent 1px var(--hour))}
.vc .vc-tg-col.is-today{background-color:color-mix(in srgb,var(--accent) 5%,var(--card))}
.vc .vc-tg-col.is-past{background-color:var(--soft)}
.vc .vc-tg-slot{position:absolute;inset:0;border:0;background:transparent;padding:0;cursor:pointer}
.vc .vc-block{position:absolute;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:1px;overflow:hidden;padding:4px 7px;border:0;border-radius:9px;text-align:left;color:var(--fg);
  font-size:.74rem;background:color-mix(in srgb,var(--place) 20%,var(--card));box-shadow:inset 3px 0 0 var(--place)}
.vc .vc-block:hover{background:color-mix(in srgb,var(--place) 30%,var(--card))}
.vc .vc-block strong{font-size:.78rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vc .vc-block span{color:var(--mute);font-variant-numeric:tabular-nums;white-space:nowrap}
.vc .vc-block.is-request{background:color-mix(in srgb,var(--place) 8%,var(--card));box-shadow:none;border:1.5px dashed var(--place)}
.vc .vc-block.is-offline{background:color-mix(in srgb,var(--place) 34%,var(--card))}
.vc .vc-block.is-other{background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--place) 26%,var(--card)) 0 5px,color-mix(in srgb,var(--place) 12%,var(--card)) 5px 10px)}
.vc .vc-block.is-selected{outline:2px solid var(--fg);outline-offset:1px}
.vc .vc-block.is-rich{padding:8px 12px;gap:3px;font-size:.82rem}
.vc .vc-block.is-rich strong{font-size:.9rem;white-space:normal}
.vc .vc-block-kind{font-size:.72rem;font-weight:650;color:var(--mute)}
.vc .vc-now{position:absolute;left:0;right:0;height:2px;background:var(--fg);z-index:2;pointer-events:none}
.vc .vc-now span{position:absolute;left:4px;top:-10px;padding:2px 7px;border-radius:999px;background:var(--fg);color:var(--canvas);font-size:.66rem;font-weight:700;font-variant-numeric:tabular-nums}
.vc .vc-tg.is-day{border:0;border-radius:0;overflow:visible;gap:12px}
.vc .vc-tg.is-day .vc-tg-scroll{border:1px solid var(--hair);border-radius:14px}
.vc .vc-day-flags{display:flex;gap:8px;flex-wrap:wrap;margin:0;font-size:.78rem;font-weight:650;color:var(--mute)}
.vc .vc-day-flags span{padding:3px 10px;border-radius:999px;background:var(--soft)}
.vc .vc-day-flags .is-clash{color:var(--bad-text);background:var(--bad-soft)}
.vc .vc-day-cards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.vc .vc-day-card{width:100%;display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border:1px solid var(--line);border-left:4px solid var(--place);border-radius:14px;background:color-mix(in srgb,var(--place) 8%,var(--card));color:var(--fg)}
.vc .vc-day-card:hover{background:color-mix(in srgb,var(--place) 16%,var(--card))}
.vc .vc-day-card.is-request{border-left-style:dashed}
.vc .vc-day-card.is-selected{outline:2px solid var(--fg);outline-offset:1px}
.vc .vc-day-card strong{font-size:.92rem}
.vc .vc-day-empty{text-align:center;padding:4px 0}

/* ---------- right column ---------- */
.vc .vc-panel-head{display:flex;align-items:center;gap:8px}
.vc .vc-panel-head h2{flex:1;display:flex;align-items:center;min-width:0}
.vc .vc-card-body{display:flex;flex-direction:column;gap:14px}
.vc .vc-person{display:flex;align-items:center;gap:12px}
.vc .vc-person > div{display:flex;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.vc .vc-person strong{font-size:1.02rem}
.vc .vc-avatar{width:46px;height:46px;border-radius:999px;object-fit:cover;flex:none;display:inline-grid;place-items:center;background:var(--soft);font-weight:700;color:var(--fg)}
.vc .vc-avatar.is-event{width:14px;height:46px;border-radius:7px}
.vc .vc-place{display:flex;align-items:center;font-size:.86rem;font-weight:600;margin:0}
.vc .vc-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;margin:0;font-size:.86rem}
.vc .vc-facts dt{color:var(--mute);font-weight:550}
.vc .vc-facts dd{margin:0;font-weight:600}
.vc .vc-facts a,.vc .vc-links a{color:var(--accent);font-weight:600;text-decoration:none}
.vc .vc-links{display:flex;gap:14px;flex-wrap:wrap;font-size:.84rem}
.vc .vc-notes{font-size:.86rem;white-space:pre-wrap;margin:0;padding:10px 12px;border-radius:12px;background:var(--soft)}
.vc .vc-badge{display:inline-flex;font-size:.7rem;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--soft);color:var(--fg)}
.vc .vc-badge.is-booking,.vc .vc-badge.is-move-in{background:var(--good-soft);color:var(--good-text)}
.vc .vc-badge.is-request{background:var(--accent-soft);color:var(--accent)}
.vc .vc-places{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vc .vc-places li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--soft);flex-wrap:wrap}
.vc .vc-places li > div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.vc .vc-places strong{font-size:.86rem;display:flex;align-items:center}
.vc .vc-state{font-size:.76rem;font-weight:600;color:var(--good-text)}
.vc .vc-state.is-closed{color:var(--mute)}
.vc .vc-item-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vc .vc-item-row{width:100%;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;text-align:left;padding:9px 12px;border:1px solid var(--line);border-left:3px solid var(--place);border-radius:12px;background:var(--card);color:var(--fg);font-size:.86rem}
.vc .vc-item-row:hover{background:var(--soft)}
.vc .vc-item-row strong{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.vc .vc-item-row.is-request{border-left-style:dashed}
.vc .vc-item-kind{font-size:.72rem;font-weight:700;color:var(--mute);white-space:nowrap}
.vc .vc-request{display:flex;flex-direction:column;gap:6px}
.vc .vc-widget{display:flex;flex-direction:column;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--hair)}
.vc .vc-widget:last-child{border-bottom:0;padding-bottom:0}
.vc .vc-meter{height:8px;border-radius:999px;background:var(--soft);overflow:hidden}
.vc .vc-meter span{display:block;height:100%;border-radius:999px;background:var(--good)}
.vc .vc-notices{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vc .vc-notices li{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:14px;background:var(--accent-soft);font-size:.84rem;font-weight:550}
.vc .vc-notices a,.vc .vc-notices button{border:0;background:var(--accent);color:#fff;border-radius:999px;padding:6px 12px;font-size:.8rem;font-weight:650;text-decoration:none;white-space:nowrap}

/* ---------- sections and forms ---------- */
.vc .vc-section{display:flex;flex-direction:column;gap:8px}
.vc .vc-form{display:flex;flex-direction:column;gap:10px}
.vc .vc-field{display:flex;flex-direction:column;gap:5px;font-size:.8rem;font-weight:600;color:var(--mute);flex:1;min-width:0}
.vc .vc-field :is(input,select,textarea){font:inherit;font-size:.9rem;font-weight:500;color:var(--fg);background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:9px 11px;width:100%}
.vc .vc-field textarea{resize:vertical}
.vc .vc-row{display:flex;gap:10px;flex-wrap:wrap}
.vc .vc-check{display:flex;align-items:center;gap:8px;font-size:.86rem;font-weight:550}
.vc .vc-weekdays{display:flex;gap:6px;flex-wrap:wrap}
.vc .vc-weekdays button{width:40px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--card);font-size:.8rem;font-weight:650;color:var(--fg)}
.vc .vc-weekdays button[aria-pressed="true"]{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
.vc .vc-hours-bar{position:relative;height:28px;border-radius:10px;background:var(--soft);overflow:hidden}
.vc .vc-hours-bar span{position:absolute;top:3px;bottom:3px;border-radius:7px;background:var(--place);min-width:3px}
.vc .vc-hours-bar span.is-request{background:transparent;border:1.5px dashed var(--place)}
.vc .vc-hours-bar span.is-note{opacity:.45}
.vc .vc-hours-scale{display:flex;justify-content:space-between;font-size:.72rem;color:var(--dim);font-variant-numeric:tabular-nums}

/* ---------- sync ---------- */
.vc .vc-sync{gap:10px}
.vc .vc-copy{display:flex;gap:6px;align-items:center}
.vc .vc-copy input{flex:1;min-width:0;font:inherit;font-size:.78rem;color:var(--fg);background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px 10px}
.vc .vc-copy .vc-btn{flex:none}
.vc .vc-feeds{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.vc .vc-feeds li{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;background:var(--soft);flex-wrap:wrap}
.vc .vc-feeds li > div:first-child{display:flex;flex-direction:column;gap:2px;min-width:0}
.vc .vc-feeds .vc-error,.vc .vc-feeds .vc-muted{font-size:.76rem}
.vc .vc-feed-form{display:flex;flex-direction:column;gap:8px}
.vc .vc-feed-form .vc-btn{align-self:flex-start}
.vc .vc-place-actions{display:flex;gap:6px;flex-wrap:wrap}

/* ---------- place settings drawer ---------- */
.vc .vc-drawer-backdrop{position:fixed;inset:0;z-index:65;background:rgba(0,0,0,.42);display:flex;justify-content:flex-end}
.vc .vc-drawer{width:min(440px,100%);height:100%;overflow-y:auto;background:var(--card);color:var(--fg);padding:20px;display:flex;flex-direction:column;gap:16px;box-shadow:-24px 0 60px -30px rgba(0,0,0,.5);outline:0;animation:vc-slide-in .22s cubic-bezier(.2,.8,.2,1)}
.vc .vc-tabs{align-self:flex-start}
@keyframes vc-slide-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}

/* ---------- the event dialog ---------- */
.vc .vc-dialog-backdrop{position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.42);display:grid;place-items:center;padding:16px}
.vc .vc-dialog{width:min(560px,100%);max-height:calc(100vh - 32px);overflow-y:auto;background:var(--card);color:var(--fg);border-radius:22px;padding:20px;display:flex;flex-direction:column;gap:12px;box-shadow:0 30px 60px -20px rgba(0,0,0,.45)}
.vc .vc-kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.vc .vc-kinds button{display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border-radius:14px;border:1.5px solid var(--line);background:var(--card);color:var(--fg)}
.vc .vc-kinds button span{font-size:.76rem;color:var(--mute)}
.vc .vc-kinds.is-three{grid-template-columns:repeat(3,minmax(0,1fr))}
.vc .vc-kinds button[aria-checked="true"]{border-color:var(--accent);background:var(--accent-soft)}
.vc{--ev-red:#e5484d;--ev-orange:#f76b15;--ev-yellow:#e2b203;--ev-green:#30a46c;--ev-blue:#0090ff;--ev-purple:#8e4ec6}
.vc .vc-colors{display:flex;gap:8px}
.vc .vc-color{width:28px;height:28px;border-radius:999px;border:2px solid transparent;background:var(--c)}
.vc .vc-color.is-red{--c:var(--ev-red)}.vc .vc-color.is-orange{--c:var(--ev-orange)}.vc .vc-color.is-yellow{--c:var(--ev-yellow)}
.vc .vc-color.is-green{--c:var(--ev-green)}.vc .vc-color.is-blue{--c:var(--ev-blue)}.vc .vc-color.is-purple{--c:var(--ev-purple)}
.vc .vc-color[aria-checked="true"]{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--fg)}
.vc .vc-dialog .vc-actions{justify-content:flex-end}

/* ---------- the listings timeline ---------- */
.vc .vc-timeline{overflow-x:auto;display:flex;flex-direction:column;gap:4px;padding-bottom:4px}
.vc .vc-tl-row{display:grid;grid-template-columns:160px repeat(var(--days,31),minmax(26px,1fr));gap:3px;min-width:max-content}
.vc .vc-timeline{--days:31}
.vc .vc-tl-name{position:sticky;left:0;z-index:1;background:var(--card);font-size:.82rem;font-weight:600;padding:6px 8px 6px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vc .vc-tl-head .vc-tl-name{color:var(--dim);font-size:.72rem;text-transform:uppercase;letter-spacing:.04em}
.vc .vc-tl-day{font-size:.7rem;font-weight:650;color:var(--dim);text-align:center;padding:6px 0}
.vc .vc-tl-day.is-today{color:var(--accent)}
.vc .vc-tl-cell{height:32px;border-radius:7px;border:1px solid var(--hair);background:var(--card);padding:0}
.vc .vc-tl-cell.is-booked{background:var(--good);border-color:var(--good)}
.vc .vc-tl-cell.is-request{background:var(--accent);border-color:var(--accent)}
.vc .vc-tl-cell.is-closed{background:repeating-linear-gradient(135deg,var(--soft) 0 4px,transparent 4px 8px)}
.vc :is(.is-ev).is-red{--ev:var(--ev-red)}.vc :is(.is-ev).is-orange{--ev:var(--ev-orange)}.vc :is(.is-ev).is-yellow{--ev:var(--ev-yellow)}
.vc :is(.is-ev).is-green{--ev:var(--ev-green)}.vc :is(.is-ev).is-blue{--ev:var(--ev-blue)}.vc :is(.is-ev).is-purple{--ev:var(--ev-purple)}
.vc .vc-tl-cell.has-event{box-shadow:inset 0 -4px 0 var(--ev)}
.vc .vc-tl-cell.is-offline{background:var(--ev);border-color:var(--ev)}
.vc .vc-tl-cell.is-past{opacity:.45}
.vc .vc-tl-cell.is-selected{outline:2px solid var(--fg);outline-offset:1px}

/* ---------- select days, toast ---------- */
.vc .vc-rangebar{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;
  padding:10px 12px 10px 18px;border-radius:999px;background:var(--fg);color:var(--canvas);box-shadow:0 18px 40px -16px rgba(0,0,0,.45);font-size:.86rem;font-weight:600;max-width:calc(100vw - 24px)}
.vc .vc-rangebar div{display:flex;gap:6px;flex-wrap:wrap}
.vc .vc-range-price{width:110px;font:inherit;font-size:.84rem;padding:8px 12px;border-radius:999px;border:0;background:var(--canvas);color:var(--fg)}
.vc .toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%) translateY(12px);background:var(--fg);color:var(--canvas);padding:.8rem 1.4rem;border-radius:100px;font-size:.88rem;font-weight:600;z-index:80;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}
.vc .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@keyframes vc-pulse{from{opacity:.55}to{opacity:1}}

/* ---------- narrower screens: the side columns slide over ---------- */
@media (max-width:1279px){
  .vc .vc-only-narrow{display:inline-flex !important}
  .vc .vc-scrim.vc-only-narrow{display:block !important}
  .vc .vc-shell{grid-template-columns:minmax(0,1fr)}
  .vc .vc-side,.vc .vc-details{position:fixed;top:0;bottom:0;z-index:60;max-height:none;border-radius:0;width:min(360px,92vw);transition:transform .25s cubic-bezier(.2,.8,.2,1)}
  .vc .vc-side{left:0;transform:translateX(-105%)}
  .vc .vc-details{right:0;transform:translateX(105%)}
  .vc .vc-side.is-open,.vc .vc-details.is-open{transform:none}
}
@media (max-width:760px){
  .vc{--bar-top:24px;--bar-step:9px;--bar-h:7px}
  .vc .vc-main{padding:8px;border-radius:16px}
  .vc .vc-week{gap:2px}
  .vc .vc-cell{min-height:60px;padding:4px;border-radius:8px}
  .vc .vc-cell-price,.vc .vc-cell-tags,.vc .vc-legend,.vc .vc-bar-title,.vc .vc-bar-time,.vc .vc-more{display:none}
  .vc .vc-bar{padding:0;border-radius:4px}
  .vc .vc-dow{padding:0 2px;font-size:.64rem;text-align:center}
  .vc .vc-details{top:auto;left:0;width:100%;max-height:82vh;border-radius:22px 22px 0 0;transform:translateY(105%)}
  .vc .vc-kinds.is-three{grid-template-columns:1fr}
  .vc .vc-rangebar{border-radius:20px;bottom:calc(76px + env(safe-area-inset-bottom,0px))}
}
@media (max-width:760px){
  .vc .vc-tg-day{padding:6px 0}
  .vc .vc-tg-day strong{min-width:24px;height:24px;font-size:.9rem}
  .vc .vc-block:not(.is-rich) span{display:none}
  .vc .vc-block:not(.is-rich){padding:2px 3px;font-size:.66rem}
}
@media (prefers-reduced-motion:reduce){.vc .vc-side,.vc .vc-details,.vc .vc-drawer,.vc .vc-cell.is-loading,.vc .toast{transition:none;animation:none}}
`;
