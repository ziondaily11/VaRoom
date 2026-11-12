// Styles for Chat Settings, ported from legacy-pages/chat-settings.html. The
// legacy tokens aliased app variables (var(--bg, …)); none were defined where
// it ran, so the fallbacks applied. They are set directly here so the panel
// inside Chats (whose own --bg / --text differ) looks exactly as before.

export const CHAT_SETTINGS_STYLES = `
.cs, .cs-page {
  --cs-bg: #ffffff;
  --cs-text: #14161a;
  --cs-muted: #6b7280;
  --cs-divider: rgba(20, 22, 26, 0.09);
  --cs-hover: rgba(20, 22, 26, 0.04);
  --cs-accent: #C41E3A;
  --cs-switch-off: #c9ccd3;
  --cs-thumb: #ffffff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
html[data-theme="dark"] .cs, html[data-theme="dark"] .cs-page {
  --cs-bg: #000000;
  --cs-text: #FFFFFF;
  --cs-muted: #71767b;
  --cs-divider: rgba(255, 255, 255, 0.12);
  --cs-hover: rgba(255, 255, 255, 0.05);
  --cs-switch-off: #3a3e46;
}

/* Theme: each preview carries its theme's light (-l) and dark (-d) colours. */
.cs-theme {
  --bubble-out: var(--bubble-out-l); --bubble-in: var(--bubble-in-l);
}
html[data-theme="dark"] .cs-theme {
  --bubble-out: var(--bubble-out-d); --bubble-in: var(--bubble-in-d);
}
.cs-themes { display:grid; grid-template-columns:repeat(auto-fill, minmax(118px, 1fr)); gap:10px; padding:10px 0 4px; }
.cs-theme {
  display:flex; flex-direction:column; align-items:stretch; gap:8px; padding:10px;
  border:1px solid var(--cs-divider); border-radius:14px; background:transparent;
  color:var(--cs-text); font:inherit; text-align:center; cursor:pointer;
}
.cs-theme:hover { background:var(--cs-hover); }
.cs-theme.is-selected { border-color:var(--cs-accent); box-shadow:0 0 0 1px var(--cs-accent); }
.cs-theme:focus-visible { outline:2px solid var(--cs-accent); outline-offset:2px; }
.cs-theme__bubbles { display:flex; flex-direction:column; gap:5px; }
.cs-theme__out, .cs-theme__in { display:block; height:16px; border-radius:8px; }
.cs-theme__out { width:72%; align-self:flex-end; background:var(--bubble-out); border-bottom-right-radius:3px; }
.cs-theme__in { width:72%; align-self:flex-start; background:var(--bubble-in); border-bottom-left-radius:3px; }
.cs-theme__label { font-size:.72rem; font-weight:600; line-height:1.25; }

/* A setting with a few choices (email timing). */
.cs-row--choice { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.cs-choice { position:relative; flex-shrink:0; }
.cs-select { display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 10px; border:1px solid var(--cs-divider); border-radius:8px; background:var(--cs-bg); color:var(--cs-text); font:inherit; font-size:.8125rem; cursor:pointer; }
.cs-select:focus-visible { outline:2px solid var(--cs-accent); outline-offset:2px; }
.cs-select__chevron { transition:transform 200ms ease; }
.cs-select[aria-expanded="true"] .cs-select__chevron { transform:rotate(180deg); }
.cs-choice-menu { min-width:100%; padding:4px; background:var(--cs-bg); border:1px solid var(--cs-divider); border-radius:10px; box-shadow:0 12px 28px rgba(24,21,19,.16); }
.cs-choice-option { display:block; width:100%; padding:8px 12px; border:0; border-radius:7px; background:transparent; color:var(--cs-text); font:inherit; font-size:.8125rem; text-align:left; white-space:nowrap; cursor:pointer; }
.cs-choice-option:hover, .cs-choice-option:focus-visible { background:var(--cs-hover); outline:none; }
.cs-choice-option[aria-selected="true"] { font-weight:700; color:var(--cs-accent); }
@media (prefers-reduced-motion: reduce) { .cs-select__chevron { transition:none; } }

/* Quick replies */
.cs-qr { display:flex; flex-direction:column; gap:8px; padding:6px 0 4px; }
.cs-qr-item { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--cs-divider); }
.cs-qr-snippet { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.cs-qr-form { display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--cs-divider); border-radius:10px; }
.cs-qr-input { width:100%; box-sizing:border-box; padding:8px 10px; border:1px solid var(--cs-divider); border-radius:8px; background:var(--cs-bg); color:var(--cs-text); font:inherit; font-size:.8125rem; resize:vertical; }
.cs-qr-input:focus { outline:none; border-color:var(--cs-accent); }
.cs-qr-actions { display:flex; justify-content:flex-end; gap:8px; }
.cs-qr-btn { flex-shrink:0; padding:6px 10px; border:1px solid var(--cs-divider); border-radius:7px; background:transparent; color:var(--cs-text); font:inherit; font-size:.75rem; font-weight:600; cursor:pointer; }
.cs-qr-btn:hover { background:var(--cs-hover); }
.cs-qr-btn--primary { border-color:var(--cs-text); background:var(--cs-text); color:var(--cs-bg); }
.cs-qr-btn--primary:hover { background:var(--cs-text); opacity:.88; }
.cs-qr-btn--danger { color:var(--cs-accent); }
.cs-qr-btn:disabled { opacity:.5; cursor:default; }
.cs-qr-add { align-self:flex-start; padding:6px 0; border:0; background:none; color:var(--cs-accent); font:inherit; font-size:.8125rem; font-weight:700; cursor:pointer; }
.cs-qr-error { margin:0; font-size:.75rem; color:var(--cs-accent); }

/* Inside desktop Chats: the information column supplies the shell. */
.cs-embedded { flex:1; min-height:0; width:100%; overflow-y:auto; background:transparent; }
.cs-embedded .cs { padding:0 18px 22px; }
.cs-embedded .cs-section { padding-top:18px; }
.cs-embedded .cs-section:first-child { padding-top:10px; }
.cs-embedded .cs-row { min-height:52px; padding:11px 0; gap:12px; }
.cs-embedded .cs-row__label { font-size:.875rem; font-weight:600; }
.cs-embedded .cs-row__desc { font-size:.75rem; line-height:1.42; }
.cs-embedded .cs-section__title { font-size:.68rem; }
.cs-embedded .cs-switch { width:42px; height:25px; }
.cs-embedded .cs-switch::before { width:19px; height:19px; }
.cs-embedded .cs-switch[aria-checked="true"]::before { transform:translateX(17px); }

/* Phone page */
.cs-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--cs-bg);
  color: var(--cs-text);
  -webkit-text-size-adjust: 100%;
}
.cs-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: 4px;
  min-height: 56px;
  padding: env(safe-area-inset-top, 0px) 8px 0 8px;
  background: var(--cs-bg);
  border-bottom: 1px solid var(--cs-divider);
}
.cs-header__back {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border: 0; border-radius: 999px;
  background: transparent; color: var(--cs-text); cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.cs-header__back:hover { background: var(--cs-hover); }
.cs-header__title { margin: 0; font-size: 1.0625rem; font-weight: 600; line-height: 1.2; color: var(--cs-text); }
.cs-page__body { width: 100%; max-width: 640px; margin: 0 auto; padding-bottom: env(safe-area-inset-bottom, 0px); }

/* The settings */
.cs { color: var(--cs-text); padding: 8px 20px 40px; }
.cs-section { padding-top: 24px; }
.cs-section:first-child { padding-top: 16px; }
.cs-section__title { margin: 0 0 4px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.06em; line-height: 1.3; color: var(--cs-muted); }
.cs-section__list { border-top: 1px solid var(--cs-divider); }
.cs-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  width: 100%; min-height: 56px; padding: 14px 0; box-sizing: border-box;
  background: none; border: 0; text-align: left; color: inherit; font: inherit;
}
.cs-row + .cs-row { border-top: 1px solid var(--cs-divider); }
.cs-row__text { min-width: 0; flex: 1; }
.cs-row__label { display: block; font-size: 1rem; font-weight: 500; line-height: 1.35; color: var(--cs-text); }
.cs-row__desc { margin: 3px 0 0; font-size: 0.875rem; font-weight: 400; line-height: 1.45; color: var(--cs-muted); }
.cs-row--toggle { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cs-row--nav { cursor: pointer; -webkit-tap-highlight-color: transparent; border-radius: 8px; }
.cs-row--nav:hover { background: var(--cs-hover); }
.cs-row__chevron { flex: none; display: inline-flex; color: var(--cs-muted); }
.cs-switch {
  position: relative; flex: none; width: 48px; height: 28px; padding: 0; border: 0; border-radius: 999px;
  background: var(--cs-switch-off); cursor: pointer; transition: background-color 0.18s ease;
  -webkit-tap-highlight-color: transparent;
}
.cs-switch::before {
  content: ""; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%;
  background: var(--cs-thumb); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25); transition: transform 0.18s ease;
}
.cs-switch::after { content: ""; position: absolute; inset: -8px -4px; }
.cs-switch[aria-checked="true"] { background: var(--cs-accent); }
.cs-switch[aria-checked="true"]::before { transform: translateX(20px); }
.cs-switch:focus-visible, .cs-row--nav:focus-visible, .cs-header__back:focus-visible { outline: 2px solid var(--cs-accent); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .cs-switch, .cs-switch::before { transition: none; } }
@media (min-width: 768px) { .cs { padding: 12px 24px 48px; } }
`;
