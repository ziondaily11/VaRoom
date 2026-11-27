import { ANALYTICS_CSS } from '../analytics/analyticsStyles';

// Calendar styles. The page wears the analytics look (.va-analytics: tokens,
// light and dark, the listing picker), plus its own rules scoped to .vc.
// Wide screens: the month and the day panel side by side. Below 1100px the
// day panel is a sheet that rises when a day is tapped; below 640px days show
// dots instead of names. CSS only: no resize listeners.

export const CALENDAR_CSS = `${ANALYTICS_CSS}
.vc .vc-wrap{max-width:1480px;margin:0 auto;padding:28px clamp(16px,3vw,40px) 96px;display:flex;flex-direction:column;gap:16px}
.vc .vc-top{display:flex;flex-wrap:wrap;gap:14px 20px;justify-content:space-between;align-items:flex-end}
.vc h1{font-size:clamp(1.5rem,2.4vw,2rem);font-weight:700;letter-spacing:-.025em}
.vc h2{font-size:1rem;font-weight:650;letter-spacing:-.01em}
.vc .vc-sub,.vc .vc-muted{color:var(--mute);font-size:.86rem}
.vc .vc-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.vc .vc-pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:.84rem;font-weight:600;color:var(--fg);text-decoration:none;white-space:nowrap}
.vc .vc-pill:hover:not(:disabled){border-color:var(--fg)}
.vc .vc-pill.is-on{background:var(--fg);color:var(--canvas);border-color:var(--fg)}
.vc button:disabled{opacity:.5;cursor:default}
.vc .vc-card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:18px}
.vc .vc-error{color:var(--bad-text);font-weight:550}
.vc .vc-empty{text-align:center;padding:48px 16px;display:flex;flex-direction:column;align-items:center;gap:10px}

.vc .vc-notices{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vc .vc-notices li{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;border-radius:16px;background:var(--accent-soft);font-size:.88rem;font-weight:550}
.vc .vc-notices a,.vc .vc-notices button{border:0;background:var(--accent);color:#fff;border-radius:999px;padding:7px 14px;font-size:.82rem;font-weight:650;text-decoration:none}

.vc .vc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.vc .vc-stats div{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.vc .vc-stats span{color:var(--mute);font-size:.78rem;font-weight:600}
.vc .vc-stats strong{font-size:1.4rem;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.vc .vc-stats .is-alert strong{color:var(--accent)}

.vc .vc-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.vc .vc-month-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.vc .vc-nav{display:flex;gap:6px}
.vc .vc-nav button{min-width:36px;height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-weight:600}
.vc .vc-nav button:hover{border-color:var(--fg)}
.vc .vc-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
.vc .vc-dow{font-size:.72rem;font-weight:650;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;padding:0 6px 4px}
.vc .vc-day{position:relative;min-height:96px;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:8px;border-radius:14px;border:1px solid var(--hair);background:var(--card);text-align:left;overflow:hidden}
.vc .vc-day.is-blank{border:0;background:transparent}
.vc .vc-day:hover:not(:disabled){border-color:var(--line);box-shadow:inset 0 0 0 1px var(--line)}
.vc .vc-num{font-size:.84rem;font-weight:650;font-variant-numeric:tabular-nums}
.vc .vc-day.is-today .vc-num{display:inline-grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:var(--accent);color:#fff}
.vc .vc-day.is-past{background:var(--soft);color:var(--dim)}
.vc .vc-day.is-closed{background:repeating-linear-gradient(135deg,var(--soft) 0 6px,transparent 6px 12px);color:var(--mute)}
.vc .vc-day.is-booked{background:var(--good-soft)}
.vc .vc-day.is-requested{background:var(--accent-soft)}
.vc .vc-day.is-loading{background:var(--soft);animation:vc-pulse 1.2s ease-in-out infinite alternate}
.vc .vc-day.is-selected{box-shadow:inset 0 0 0 2px var(--fg)}
.vc .vc-day.is-in-range{box-shadow:inset 0 0 0 2px var(--accent);background:var(--accent-soft)}
.vc .vc-tag{font-size:.68rem;font-weight:650;color:var(--mute)}
.vc .vc-chips{display:flex;flex-direction:column;gap:3px;width:100%}
.vc .vc-chip{display:block;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:.72rem;font-weight:600;padding:2px 7px;border-radius:7px}
.vc .vc-chip.is-booked,.vc .vc-badge.is-booked,.vc .vc-legend .is-booked{background:var(--good);color:#fff}
.vc .vc-chip.is-request,.vc .vc-badge.is-request,.vc .vc-legend .is-request{background:var(--accent);color:#fff}
.vc .vc-more{font-size:.7rem;font-weight:650;color:var(--mute)}
.vc .vc-legend{display:flex;gap:16px;margin-top:12px;font-size:.78rem;color:var(--mute)}
.vc .vc-legend span{display:inline-flex;align-items:center;gap:6px}
.vc .vc-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
.vc .vc-legend .is-closed{background:repeating-linear-gradient(135deg,var(--dim) 0 2px,transparent 2px 4px);border:1px solid var(--line)}

.vc .vc-panel{position:sticky;top:16px;display:flex;flex-direction:column;gap:14px}
.vc .vc-panel-head{display:flex;justify-content:space-between;align-items:center}
.vc .vc-close{display:none;border:0;background:var(--soft);width:32px;height:32px;border-radius:999px;font-size:1.2rem;line-height:1}
.vc .vc-places,.vc .vc-bookings,.vc .vc-agenda ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.vc .vc-places li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--soft)}
.vc .vc-places li div{display:flex;flex-direction:column;gap:2px;min-width:0}
.vc .vc-places strong{font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vc .vc-state{font-size:.76rem;font-weight:600;color:var(--good-text)}
.vc .vc-state.is-closed{color:var(--mute)}
.vc .vc-bookings li{display:flex;flex-direction:column;gap:4px;padding:12px;border:1px solid var(--line);border-radius:14px}
.vc .vc-booking-top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.vc .vc-badge{font-size:.7rem;font-weight:650;padding:2px 8px;border-radius:999px}
.vc .vc-actions{display:flex;gap:8px;margin-top:6px}
.vc .vc-btn{flex:1;padding:9px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-weight:650;font-size:.84rem}
.vc .vc-btn.is-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.vc .vc-nothing{padding:4px 2px}
.vc .vc-link{font-size:.84rem;font-weight:600;color:var(--accent);text-decoration:none}

.vc .vc-agenda h2{margin-bottom:12px}
.vc .vc-agenda button{width:100%;display:grid;grid-template-columns:90px auto minmax(0,1fr);gap:12px;align-items:center;padding:10px 12px;border:0;border-radius:12px;background:var(--soft);text-align:left;font-size:.86rem}
.vc .vc-agenda button:hover{background:var(--hair)}
.vc .vc-agenda-day{font-weight:650;font-variant-numeric:tabular-nums}
.vc .vc-agenda-who{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

.vc .vc-rangebar{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:center;
  padding:10px 12px 10px 18px;border-radius:999px;background:var(--fg);color:var(--canvas);box-shadow:0 18px 40px -16px rgba(0,0,0,.45);font-size:.86rem;font-weight:600;max-width:calc(100vw - 24px)}
.vc .vc-rangebar div{display:flex;gap:6px}
.vc .vc-rangebar .vc-btn{flex:none}
.vc .toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%) translateY(12px);background:var(--fg);color:var(--canvas);padding:.8rem 1.4rem;border-radius:100px;font-size:.88rem;font-weight:600;z-index:60;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s}
.vc .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
@keyframes vc-pulse{from{opacity:.55}to{opacity:1}}

@media (max-width:1099px){
  .vc .vc-layout{grid-template-columns:minmax(0,1fr)}
  .vc .vc-panel{position:fixed;left:0;right:0;bottom:0;top:auto;z-index:50;max-height:80vh;overflow-y:auto;border-radius:22px 22px 0 0;
    transform:translateY(105%);transition:transform .25s cubic-bezier(.2,.8,.2,1);box-shadow:0 -18px 40px -16px rgba(0,0,0,.35)}
  .vc .vc-panel.is-open{transform:none}
  .vc .vc-close{display:inline-grid;place-items:center}
}
@media (max-width:760px){
  .vc .vc-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .vc .vc-card{padding:12px;border-radius:18px}
  .vc .vc-grid{gap:3px}
  .vc .vc-day{min-height:52px;padding:5px;border-radius:10px;align-items:center}
  .vc .vc-tag{display:none}
  .vc .vc-chips{flex-direction:row;justify-content:center;gap:3px}
  .vc .vc-chip{width:7px;height:7px;padding:0;border-radius:999px;font-size:0}
  .vc .vc-chip:nth-child(n+3),.vc .vc-more{display:none}
  .vc .vc-rangebar{border-radius:20px;bottom:calc(76px + env(safe-area-inset-bottom,0px))}
}
@media (prefers-reduced-motion:reduce){.vc .vc-panel,.vc .vc-day.is-loading,.vc .toast{transition:none;animation:none}}
`;
