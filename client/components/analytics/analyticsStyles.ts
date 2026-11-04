// Analytics page styles, scoped to .va-analytics. Light and dark tokens follow
// the OS setting, [data-theme] or .dark, like the rest of VaRoom.

export const ANALYTICS_CSS = `
.va-analytics{--bg:#fff;--fg:#000;--mute:#5c5c5c;--line:#dcdcdc;--soft:#f3f3f3;--accent:#C41E3A;--good:#1f7a4d;--warn:#a66300;--bad:#C41E3A;--info:#2a5db0;--dim:#8a8a8a;
  width:100%;min-height:100vh;background:var(--bg);color:var(--fg);font-family:inherit;line-height:1.5;font-variant-numeric:tabular-nums}
:root:has(.va-analytics) body{margin:0}
.va-wrap{max-width:1680px;margin:0 auto;padding:clamp(16px,3.5vw,56px)}
.va-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));column-gap:48px}
.va-grid>.va-block{grid-column:1/-1}
@media (min-width:1100px){.va-grid>.va-s7{grid-column:span 7}.va-grid>.va-s5{grid-column:span 5}}
.va-row3{grid-column:1/-1;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));column-gap:48px}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .va-analytics{--bg:#000;--fg:#fff;--mute:#71767b;--line:#2f3336;--soft:#16181c;--accent:#e0425e;--good:#4cc38a;--warn:#e0a23b;--bad:#ef6a80;--info:#7aa5f2;--dim:#6d6d6d}}
:root[data-theme="dark"] .va-analytics,.dark .va-analytics{--bg:#000;--fg:#fff;--mute:#71767b;--line:#2f3336;--soft:#16181c;--accent:#e0425e;--good:#4cc38a;--warn:#e0a23b;--bad:#ef6a80;--info:#7aa5f2;--dim:#6d6d6d}
.va-analytics *{box-sizing:border-box}
.va-analytics h1{font-size:clamp(1.6rem,4vw,2.2rem);line-height:1.15;margin:0;font-weight:700;letter-spacing:-.02em}
.va-analytics h2{font-size:1.15rem;margin:0 0 4px;font-weight:650}
.va-analytics p{margin:0}
.va-analytics button{font:inherit;color:inherit;cursor:pointer}
.va-analytics :is(button,svg):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-head{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-end;padding-bottom:20px}
.va-note{color:var(--mute);font-size:.9rem;max-width:62ch}
.va-badge{display:inline-block;margin-top:10px;padding:2px 10px;border:1px solid var(--accent);color:var(--accent);border-radius:999px;font-size:.85rem}
.va-block{border-top:1px solid var(--line);padding:24px 0}
.va-block>.va-note{margin-bottom:14px}
.va-tabs{display:inline-flex;flex-wrap:wrap;gap:4px}
.va-tabs button{padding:6px 12px;border:1px solid var(--line);background:transparent;border-radius:999px;font-size:.88rem}
.va-tabs button[aria-pressed="true"]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.va-row{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:space-between;align-items:center;margin-bottom:8px}
.va-readout{font-weight:600}
.va-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin:0 0 20px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.va-kpis>div{padding:16px 16px 16px 0}
.va-kpis dt{color:var(--mute);font-size:.88rem}
.va-kpis dd{margin:2px 0;font-size:clamp(1.4rem,3.4vw,1.95rem);font-weight:700;letter-spacing:-.02em}
.va-kpis small{color:var(--mute);font-size:.8rem;display:block}
.va-kpis.small{grid-template-columns:repeat(3,1fr)}
.va-kpis.small dd{font-size:1.4rem}
.va-seg{display:flex;gap:2px;height:12px;margin-bottom:10px}
.va-seg span{border-radius:2px;background:var(--c,var(--dim))}
.va-legend{display:flex;flex-wrap:wrap;gap:6px 18px;list-style:none;margin:0 0 12px;padding:0;font-size:.9rem}
.va-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;background:var(--c,var(--dim))}
.t-good{--c:var(--good)}.t-warn{--c:var(--warn)}.t-bad{--c:var(--bad)}.t-info{--c:var(--info)}.t-mute{--c:var(--dim)}
.va-grid{stroke:var(--line);stroke-width:1}
.va-axis{fill:var(--mute);font-size:11px}
.va-line{fill:none;stroke:var(--accent);stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}
.va-area{fill:var(--accent);opacity:.1}
.va-dot{fill:var(--bg);stroke:var(--accent);stroke-width:2.5}
.va-scroll{overflow-x:auto}
.va-analytics .va-plan table{min-width:340px}
.va-analytics table{width:100%;border-collapse:collapse;font-size:.92rem;min-width:460px}
.va-analytics th,.va-analytics td{padding:10px 8px 10px 0;border-bottom:1px solid var(--line);text-align:left;font-weight:400}
.va-analytics thead th{color:var(--mute);font-weight:500}
.va-analytics tbody th{font-weight:600}
.va-analytics .num{text-align:right;padding-right:0;padding-left:8px}
.va-analytics th button{background:none;border:0;padding:0;color:inherit}
.va-analytics th button.on{color:var(--fg);font-weight:700;text-decoration:underline;text-underline-offset:4px;text-decoration-color:var(--accent)}
td .va-bar{display:block;height:4px;margin:0 0 4px auto;background:var(--accent);border-radius:2px;opacity:.8}
.va-pill{padding:2px 10px;border-radius:999px;font-size:.82rem;border:1px solid var(--c,var(--dim));color:var(--c,var(--mute))}
.va-days{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;height:110px;align-items:end;margin-top:12px}
.va-days div{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.va-days span{width:100%;background:var(--accent);border-radius:3px 3px 0 0;min-height:2px}
.va-days small{color:var(--mute);font-size:.78rem}
.va-avg b{font-size:2.3rem;letter-spacing:-.02em;margin-right:4px}
.va-avg small{color:var(--mute);margin-left:6px}
.va-dist{display:grid;grid-template-columns:52px 1fr 28px;gap:10px;align-items:center;font-size:.88rem;margin-top:6px}
.va-track{height:8px;background:var(--soft);border-radius:4px;overflow:hidden}
.va-track i{display:block;height:100%;background:var(--accent)}
.va-skel{height:120px;border-radius:6px;background:linear-gradient(90deg,var(--soft),var(--line),var(--soft));background-size:200% 100%;animation:va-sh 1.4s linear infinite}
@keyframes va-sh{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.va-skel{animation:none}}
.va-msg{padding:16px;border:1px dashed var(--line);border-radius:6px;color:var(--mute)}
.va-msg button{margin-top:10px;padding:6px 14px;border:1px solid var(--fg);background:transparent;border-radius:999px}
/* ---------- v2 additions ---------- */
.va-head-actions{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:flex-end}
.va-select{font:inherit;font-size:.88rem;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:6px 30px 6px 12px;max-width:260px;appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mute) 50%),linear-gradient(135deg,var(--mute) 50%,transparent 50%);background-position:calc(100% - 15px) 52%,calc(100% - 10px) 52%;background-size:5px 5px;background-repeat:no-repeat}
.va-select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-link{background:none;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:.88rem;text-decoration:none;color:var(--fg)}
.va-link:hover{border-color:var(--fg)}
.va-eyebrow{color:var(--accent);font-size:.8rem;font-weight:650;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px}
.va-status{min-height:1.4em;font-size:.82rem;color:var(--mute)}
.va-stale{opacity:.55;transition:opacity .2s}
.va-banner{padding:10px 14px;border:1px solid var(--line);border-left:3px solid var(--warn);border-radius:6px;font-size:.88rem;color:var(--mute);margin:0 0 12px}
.va-banner button{background:none;border:0;padding:0;margin-left:8px;text-decoration:underline;color:var(--fg)}
.va-delta{display:inline-block;font-size:.78rem;font-weight:600;margin-left:2px}
.va-delta.up{color:var(--good)}.va-delta.down{color:var(--bad)}.va-delta.flat{color:var(--mute)}
.va-kpis dd .va-delta{font-size:.78rem;letter-spacing:0;vertical-align:middle;margin-left:8px}
.va-kpis.secondary{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));border-top:0}
.va-kpis.secondary dd{font-size:1.25rem}
.va-funnel{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.va-funnel li{display:grid;grid-template-columns:minmax(150px,1.1fr) 3fr minmax(70px,auto);gap:12px;align-items:center;font-size:.9rem}
.va-funnel .va-track{height:12px}
.va-funnel .num b{font-weight:700}
.va-funnel small{display:block;color:var(--mute);font-size:.76rem}
.va-hours{display:grid;grid-template-columns:repeat(auto-fit,minmax(34px,1fr));gap:6px;height:90px;align-items:end;margin-top:12px}
.va-hours div{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:4px}
.va-hours span{width:100%;background:var(--info);border-radius:3px 3px 0 0;min-height:2px}
.va-hours small{color:var(--mute);font-size:.72rem}
.va-sub{font-size:.95rem;font-weight:650;margin:18px 0 0}
.va-analytics tbody tr.va-click{cursor:pointer}
.va-analytics tbody tr.va-click:hover th,.va-analytics tbody tr.va-click:hover td{background:var(--soft)}
.va-analytics tbody tr.va-click th button{font-weight:600;text-align:left}
.va-tag{display:inline-block;margin-left:8px;font-size:.72rem;font-weight:500;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:0 7px;vertical-align:middle}
.va-lock{border-top:1px solid var(--line);padding:32px 0;display:grid;gap:18px;max-width:720px}
.va-lock h2{font-size:1.5rem}
.va-lock ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.va-lock li{display:flex;gap:10px;align-items:flex-start}
.va-lock li::before{content:'';flex:0 0 8px;height:8px;margin-top:.55em;border-radius:50%;background:var(--accent)}
.va-cta{display:inline-block;justify-self:start;padding:10px 22px;border-radius:999px;background:var(--accent);color:#fff;font-weight:650;text-decoration:none}
.va-cta:hover{filter:brightness(.92)}
@media (max-width:640px){.va-funnel li{grid-template-columns:1fr auto}.va-funnel li .va-track{grid-column:1/-1;grid-row:2}}
`;
