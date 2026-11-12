// Analytics page styles, scoped to .va-analytics. A bento layout of rounded
// cards on a soft canvas; one red hero card leads. Light and dark tokens
// follow the OS setting, [data-theme] or .dark, like the rest of VaRoom.
// Chart colours were checked with the dataviz palette validator: the contact
// channels use the reference categorical slots 1-3 (light and dark steps);
// the requests chart is brand red against a neutral, with a 2px gap and legend.

const LIGHT = `--canvas:#f3f3f5;--card:#fff;--line:#e9e9ee;--hair:#efeff3;--fg:#0b0b0f;--mute:#6b6b76;--dim:#9a9aa5;--soft:#f4f4f7;
  --accent:#C41E3A;--accent-hi:#e0425e;--accent-lo:#8F1229;--accent-soft:rgba(196,30,58,.08);--rest:#3f3f46;
  --good:#0ca30c;--good-text:#13753b;--good-soft:rgba(12,163,12,.1);--bad:#d03b3b;--bad-text:#b42332;--bad-soft:rgba(208,59,59,.1);--warn:#fab219;
  --c1:#2a78d6;--c2:#eb6834;--c3:#1baf7a;--shadow:0 1px 2px rgba(16,16,24,.04),0 10px 30px -18px rgba(16,16,24,.18);--tip-bg:#0b0b0f;--tip-fg:#fff`;
const DARK = `--canvas:#000;--card:#0e0e10;--line:#1f1f24;--hair:#1b1b20;--fg:#f4f4f5;--mute:#8b8b95;--dim:#5f5f69;--soft:#17171b;
  --accent:#e0425e;--accent-hi:#ef5a74;--accent-lo:#9c1530;--accent-soft:rgba(224,66,94,.14);--rest:#8b8f97;
  --good-text:#4cc38a;--good-soft:rgba(76,195,138,.12);--bad-text:#f07a8a;--bad-soft:rgba(240,122,138,.12);
  --c1:#3987e5;--c2:#d95926;--c3:#199e70;--shadow:none;--tip-bg:#f4f4f5;--tip-fg:#0b0b0f`;

export const ANALYTICS_CSS = `
.va-analytics{${LIGHT};width:100%;min-height:100%;background:var(--canvas);color:var(--fg);font-family:inherit;line-height:1.45}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .va-analytics{${DARK}}}
:root[data-theme="dark"] .va-analytics,.dark .va-analytics{${DARK}}
:root:has(.va-analytics) body{margin:0}
.va-analytics *{box-sizing:border-box}
.va-analytics h1,.va-analytics h2,.va-analytics h3,.va-analytics p{margin:0}
.va-analytics button,.va-analytics select{font:inherit;color:inherit}
.va-analytics button{cursor:pointer}
.va-analytics :is(button,select,a,svg,[tabindex]):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.va-wrap{max-width:1480px;margin:0 auto;padding:28px clamp(16px,3vw,40px) 64px}

/* ---------- top bar ---------- */
.va-top{display:flex;flex-wrap:wrap;gap:14px 20px;justify-content:space-between;align-items:center;margin-bottom:22px}
.va-hello{display:flex;flex-direction:column;gap:6px}
.va-hello h1{font-size:clamp(1.5rem,2.4vw,2rem);font-weight:700;letter-spacing:-.025em;line-height:1.15}
.va-chip{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;padding:3px 10px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:.74rem;font-weight:650;letter-spacing:.02em}
.va-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.va-segctl{display:inline-flex;padding:4px;gap:2px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.va-segctl button{border:0;background:transparent;padding:7px 14px;border-radius:999px;font-size:.84rem;font-weight:550;color:var(--mute);transition:background .15s,color .15s}
.va-segctl button:hover{color:var(--fg)}
.va-segctl button[aria-pressed="true"]{background:var(--fg);color:var(--card)}
.va-select{font-size:.84rem;font-weight:550;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 34px 9px 14px;max-width:240px;appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,var(--mute) 50%),linear-gradient(135deg,var(--mute) 50%,transparent 50%);background-position:calc(100% - 17px) 52%,calc(100% - 12px) 52%;background-size:5px 5px;background-repeat:no-repeat}
.va-picker{position:relative}
.va-picker .va-select{cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg)}
.va-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:30;min-width:100%;width:max-content;max-width:300px;max-height:320px;overflow-y:auto;padding:6px;
  display:flex;flex-direction:column;gap:2px;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 18px 40px -16px rgba(0,0,0,.28);
  transform-origin:var(--origin-x,50%) -8px}
.va-menu[data-state="open"]{animation:va-menu-in 200ms cubic-bezier(.2,.8,.2,1) both}
.va-menu[data-state="closing"]{animation:va-menu-out 150ms cubic-bezier(.4,0,1,1) both;pointer-events:none}
.va-menu button{border:0;background:transparent;text-align:left;padding:9px 12px;border-radius:10px;font-size:.84rem;font-weight:550;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.va-menu button:hover,.va-menu button:focus-visible{background:var(--soft);color:var(--fg);outline:none}
.va-menu button[aria-selected="true"]{color:var(--fg);background:var(--accent-soft)}
.va-menu[data-state="open"] button{animation:va-row-in 200ms cubic-bezier(.2,.8,.2,1) both}
@keyframes va-menu-in{from{opacity:0;transform:translateY(-6px) scale(.92)}to{opacity:1;transform:none}}
@keyframes va-menu-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-6px) scale(.92)}}
@keyframes va-row-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.va-menu,.va-menu button{animation-duration:1ms!important;animation-delay:0ms!important}}
.va-iconbtn{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
.va-iconbtn:hover{border-color:var(--fg)}

/* ---------- bento ---------- */
.va-bento{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px}
.va-bento>*{min-width:0}
.va-card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px 22px;box-shadow:var(--shadow);min-width:0;position:relative}
.s3{grid-column:span 3}.s4{grid-column:span 4}.s5{grid-column:span 5}.s6{grid-column:span 6}.s7{grid-column:span 7}.s8{grid-column:span 8}.s12{grid-column:span 12}
@media (max-width:1180px){.s3,.s4,.s5{grid-column:span 6}.s7,.s8{grid-column:span 12}}
@media (max-width:760px){.va-bento>*{grid-column:1/-1}}
.va-stale{opacity:.5;transition:opacity .2s}
.va-card-h{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px 14px;margin-bottom:16px}
.va-card-h h2{font-size:1rem;font-weight:650;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
.va-card-h h2 .va-ico{width:30px;height:30px;border-radius:10px}
.va-kicker{font-size:.78rem;color:var(--mute)}
.va-empty{display:grid;place-items:center;min-height:140px;color:var(--dim);font-size:.88rem;text-align:center}

/* ---------- hero ---------- */
.va-hero{grid-column:span 4;color:#fff;border:0;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;gap:18px;min-height:268px;
  background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.24),transparent 55%),linear-gradient(145deg,var(--accent-hi) 0%,var(--accent) 48%,var(--accent-lo) 100%);
  box-shadow:0 18px 40px -22px rgba(196,30,58,.75)}
.va-hero::before,.va-hero::after{content:'';position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.14);pointer-events:none}
.va-hero::before{width:260px;height:260px;right:-90px;top:-110px}
.va-hero::after{width:180px;height:180px;right:-40px;top:-60px}
.va-hero-top{display:flex;justify-content:space-between;align-items:center;gap:10px;position:relative}
.va-hero-label{font-size:.9rem;font-weight:550;opacity:.92}
.va-hero .va-ico{background:rgba(255,255,255,.18);color:#fff}
.va-hero-value{font-size:clamp(2.2rem,3.6vw,3.2rem);font-weight:750;letter-spacing:-.035em;line-height:1;position:relative}
.va-hero-foot{display:flex;align-items:center;gap:8px;position:relative}
.va-hero .va-delta.va-delta{background:rgba(255,255,255,.2);color:#fff}
.va-hero .va-vs{color:rgba(255,255,255,.75)}
.va-hero-spark{position:relative;margin:0 -22px -20px;height:76px}
.va-hero-spark svg{display:block;width:100%;height:100%}
@media (max-width:1180px){.va-hero{grid-column:span 12;min-height:220px}}

/* ---------- tiles ---------- */
.va-tiles{grid-column:span 8;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
@media (max-width:1180px){.va-tiles{grid-column:span 12}}
@media (max-width:640px){.va-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}}
.va-tile{display:flex;flex-direction:column;gap:10px;padding:18px 18px 16px}
.va-tile-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.va-ico{width:36px;height:36px;flex:0 0 auto;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center}
.va-tile-label{font-size:.82rem;color:var(--mute);font-weight:500}
.va-tile-value{font-size:clamp(1.3rem,2vw,1.65rem);font-weight:700;letter-spacing:-.025em;line-height:1.1}
.va-tile-value.none{color:var(--dim);font-weight:600}
.va-tile-foot{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:6px 8px;min-height:26px;margin-top:auto}
.va-delta{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;font-size:.72rem;font-weight:650;white-space:nowrap}
.va-delta.up{color:var(--good-text);background:var(--good-soft)}
.va-delta.down{color:var(--bad-text);background:var(--bad-soft)}
.va-delta.flat{color:var(--mute);background:var(--soft)}
.va-vs{font-size:.7rem;color:var(--dim);white-space:nowrap}
.va-spark{width:76px;height:26px;flex:0 0 auto}
.va-spark path.l{fill:none;stroke:var(--dim);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.va-spark circle{fill:var(--accent);stroke:var(--card);stroke-width:2}
.va-meter{height:6px;border-radius:999px;background:var(--soft);overflow:hidden;width:100%}
.va-meter i{display:block;height:100%;border-radius:999px;background:var(--accent)}

/* ---------- charts ---------- */
.va-readout{font-size:1.45rem;font-weight:700;letter-spacing:-.02em}
.va-readout small{display:block;font-size:.74rem;font-weight:500;color:var(--mute);letter-spacing:0}
.va-tabs{display:inline-flex;flex-wrap:wrap;gap:4px;padding:3px;border-radius:12px;background:var(--soft)}
.va-tabs button{border:0;background:transparent;padding:6px 11px;border-radius:9px;font-size:.8rem;font-weight:550;color:var(--mute)}
.va-tabs button[aria-pressed="true"]{background:var(--card);color:var(--fg);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.va-chart{position:relative;touch-action:pan-y}
.va-chart svg{display:block;overflow:visible}
.va-gridline{stroke:var(--hair);stroke-width:1}
.va-axis{fill:var(--dim);font-size:.6875rem;font-variant-numeric:tabular-nums}
.va-line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.va-cross{stroke:var(--line);stroke-width:1}
.va-dot{fill:var(--accent);stroke:var(--card);stroke-width:2}
.va-tip{position:absolute;top:0;left:0;pointer-events:none;background:var(--tip-bg);color:var(--tip-fg);padding:8px 11px;border-radius:12px;font-size:.76rem;line-height:1.35;white-space:nowrap;box-shadow:0 10px 24px -10px rgba(0,0,0,.4);z-index:2}
.va-tip b{display:block;font-size:.92rem;font-weight:700}
.va-tip .k{display:flex;align-items:center;gap:6px}
.va-tip .k i{display:inline-block;width:10px;height:2px;border-radius:2px}
.va-legend{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;margin:0;padding:0;font-size:.8rem;color:var(--mute)}
.va-legend li{display:inline-flex;align-items:center;gap:7px}
.va-legend i{display:inline-block;width:10px;height:10px;border-radius:3px}
.va-legend b{color:var(--fg);font-weight:650}
.va-col-approved{fill:var(--accent)}.va-col-rest{fill:var(--rest)}
.va-col:hover rect,.va-col:focus rect{filter:brightness(1.12)}
.sw-approved{background:var(--accent)}.sw-rest{background:var(--rest)}
.sw-c1{background:var(--c1)}.sw-c2{background:var(--c2)}.sw-c3{background:var(--c3)}
.st-good{background:var(--good)}.st-warn{background:var(--warn)}.st-bad{background:var(--bad)}.st-mute{background:var(--dim)}
.va-thinbar{display:flex;gap:2px;height:8px;margin:18px 0 10px}
.va-thinbar span{border-radius:999px;min-width:4px}

/* ---------- funnel ---------- */
.va-funnel{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.va-funnel li{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:baseline}
.va-funnel .lbl{font-size:.84rem;color:var(--mute)}
.va-funnel .val{font-size:1.2rem;font-weight:700;letter-spacing:-.02em}
.va-funnel .bar{grid-column:1/-1;height:10px;border-radius:999px;background:var(--soft);overflow:hidden}
.va-funnel .bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--accent-hi),var(--accent))}
.va-funnel .rate{grid-column:1/-1;font-size:.72rem;color:var(--dim);padding:6px 0 4px;display:flex;align-items:center;gap:6px}
.va-funnel .rate b{color:var(--accent);font-weight:700}

/* ---------- gauge, mix, reviews ---------- */
.va-gauge{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.va-gauge svg{flex:0 0 auto}
.va-gauge-track{fill:none;stroke:var(--soft);stroke-width:12}
.va-gauge-fill{fill:none;stroke:var(--accent);stroke-width:12;stroke-linecap:round;transition:stroke-dasharray .6s ease}
.va-gauge-num{fill:var(--fg);font-size:1.75rem;font-weight:750;letter-spacing:-.03em}
.va-gauge-sub{fill:var(--mute);font-size:.6875rem}
.va-stats{display:grid;gap:14px;flex:1;min-width:170px}
.va-stat{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:var(--soft)}
.va-stat span{font-size:.8rem;color:var(--mute)}
.va-stat b{font-size:1.05rem;font-weight:700;letter-spacing:-.01em}
.va-stat .va-delta{margin-left:6px}
.va-mix{display:flex;gap:2px;height:28px;margin:4px 0 14px}
.va-mix span{border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:.74rem;font-weight:650;color:#fff;min-width:0;overflow:hidden;white-space:nowrap}
.va-mix span.dark-ink{color:#0b0b0f}
.va-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}
.va-mini div{padding:12px;border-radius:14px;background:var(--soft)}
.va-mini span{display:flex;align-items:center;gap:6px;font-size:.76rem;color:var(--mute)}
.va-mini b{display:block;margin-top:4px;font-size:1.15rem;font-weight:700}
.va-rating{display:flex;align-items:flex-end;gap:14px;margin-bottom:14px}
.va-rating b{font-size:3rem;font-weight:750;letter-spacing:-.04em;line-height:.9}
.va-stars{display:flex;gap:2px;color:var(--accent)}
.va-stars .off{color:var(--line)}
.va-rating small{display:block;font-size:.78rem;color:var(--mute);margin-top:4px}
.va-dist{display:grid;grid-template-columns:14px 1fr 26px;gap:10px;align-items:center;font-size:.8rem;color:var(--mute);margin-top:7px;font-variant-numeric:tabular-nums}
.va-dist .t{height:8px;border-radius:999px;background:var(--soft);overflow:hidden}
.va-dist .t i{display:block;height:100%;border-radius:999px;background:var(--accent)}
.va-dist .n{text-align:right;color:var(--fg)}

/* ---------- tables ---------- */
.va-scroll{overflow-x:auto;margin:0 -6px;padding:0 6px}
.va-analytics table{width:100%;border-collapse:separate;border-spacing:0;font-size:.86rem;min-width:520px}
.va-analytics th,.va-analytics td{padding:12px 10px;text-align:left;font-weight:500;border-bottom:1px solid var(--hair);white-space:nowrap}
.va-analytics thead th{color:var(--dim);font-size:.74rem;font-weight:600;border-bottom:1px solid var(--line);padding-top:0}
.va-analytics tbody tr:last-child :is(th,td){border-bottom:0}
.va-analytics .num{text-align:right;font-variant-numeric:tabular-nums}
.va-analytics thead th button{border:0;background:none;padding:0;color:inherit;font:inherit}
.va-analytics thead th button.on{color:var(--fg)}
.va-analytics thead th button.on::after{content:' \\2193';color:var(--accent)}
.va-row{cursor:pointer}
.va-row:hover :is(th,td){background:var(--soft)}
.va-row:hover th:first-child{border-radius:12px 0 0 12px}.va-row:hover td:last-child{border-radius:0 12px 12px 0}
.va-listing{display:flex;align-items:center;gap:12px;white-space:normal;min-width:200px}
.va-rank{flex:0 0 auto;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:.76rem;font-weight:700;background:var(--soft);color:var(--mute)}
.va-row:first-child .va-rank{background:var(--accent);color:#fff}
.va-listing button{border:0;background:none;padding:0;text-align:left;font-weight:650;color:var(--fg)}
.va-tag{display:inline-block;margin-left:8px;font-size:.68rem;font-weight:600;color:var(--mute);background:var(--soft);border-radius:999px;padding:1px 8px;vertical-align:middle}
.va-cellbar{display:block;height:3px;border-radius:999px;background:var(--accent);margin:5px 0 0 auto;opacity:.85}
.va-pill{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;color:var(--mute)}
.va-pill i{width:7px;height:7px;border-radius:50%}

/* ---------- dining ---------- */
.va-dining{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr);gap:22px;align-items:end}
@media (max-width:1000px){.va-dining{grid-template-columns:1fr}}
.va-dining .va-mini{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:0}
.va-dining h3{font-size:.8rem;font-weight:600;color:var(--mute);margin-bottom:8px}

/* ---------- states ---------- */
.va-skel{border-radius:22px;background:linear-gradient(90deg,var(--card),var(--soft),var(--card));background-size:200% 100%;animation:va-sh 1.4s linear infinite;border:1px solid var(--line)}
@keyframes va-sh{to{background-position:-200% 0}}
@media (prefers-reduced-motion:reduce){.va-skel{animation:none}.va-gauge-fill{transition:none}}
.va-banner{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:var(--bad-soft);color:var(--bad-text);font-size:.84rem;margin-bottom:14px}
.va-banner button,.va-retry{border:0;background:var(--fg);color:var(--card);border-radius:999px;padding:6px 14px;font-size:.8rem;font-weight:600}
.va-locked{position:relative;min-height:560px}
.va-locked .va-bento{filter:blur(3px);opacity:.55;pointer-events:none;user-select:none}
.va-lock{position:absolute;inset:0;display:grid;place-items:center;padding:16px}
.va-lock .va-card{max-width:520px;width:100%;padding:30px;border:0;color:#fff;overflow:hidden;
  background:radial-gradient(120% 90% at 100% 0%,rgba(255,255,255,.24),transparent 55%),linear-gradient(145deg,var(--accent-hi) 0%,var(--accent) 48%,var(--accent-lo) 100%);box-shadow:0 30px 60px -30px rgba(196,30,58,.8)}
.va-lock h2{font-size:1.6rem;font-weight:750;letter-spacing:-.03em;margin:16px 0 18px}
.va-lock ul{list-style:none;margin:0 0 24px;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.va-lock li{padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);font-size:.8rem;font-weight:550}
.va-lock .va-ico{background:rgba(255,255,255,.18);color:#fff;width:46px;height:46px;border-radius:15px}
.va-cta{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:999px;background:#fff;color:var(--accent);font-weight:700;text-decoration:none}
.va-cta:hover{background:#fff4f6}
`;
