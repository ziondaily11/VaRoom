// Styles for the legal documents (Terms of Service, Privacy Policy), under
// the pp- class prefix. Rendered only while a legal page is open (formerly
// styles/privacy.css, loaded for every page). Above 900 px the sections scroll
// in their own pane; below it the window scrolls and the section menu stays
// at the top of the screen.

export const LEGAL_STYLES = `
.pp-root {
  --pp-bg: #faf7f2;
  --pp-text: #181513;
  --pp-muted: #4a443f;
  background: var(--pp-bg);
  color: var(--pp-text);
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.7;
}

/* Base Hero: black, curved into the page background */
.pp-hero {
  position: relative;
  z-index: 10;
  background: #000;
  color: #fff;
  text-align: center;
}

.pp-hero::after {
  content: "";
  position: absolute;
  left: -10%;
  right: -10%;
  background: #000;
  border-radius: 0 0 50% 50% / 0 0 100% 100%;
  pointer-events: none;
}

.pp-brand {
  position: absolute;
  top: 16px;
  left: 20px;
  display: inline-flex;
  font-family: 'Fraunces', Georgia, serif;
  font-size: 1.75rem;
  font-weight: 900;
  letter-spacing: -1px;
  color: #fff;
  text-decoration: none;
}

.pp-brand span:first-child {
  color: #bd2337;
}

.pp-brand span:last-child {
  color: #fff;
}

.pp-hero h1 {
  margin: 0;
  font-family: inherit;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -1.5px;
}

.pp-hero .pp-updated {
  margin: 10px 0 0;
  color: #d4d0cc;
  font-size: 0.9063rem;
}

/* Table of contents shared styles */
.pp-toc-toggle {
  display: none;
}

.pp-toc {
  position: relative;
}

.pp-toc ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.pp-toc a {
  display: block;
  padding: 8px 0;
  font-size: 0.9375rem;
  line-height: 1.4;
  color: var(--pp-muted);
  text-decoration: none;
  transition: color var(--motion-micro, 150ms) var(--ease-out, ease-out);
}

.pp-toc--dense a {
  padding: 5px 0;
  font-size: 0.875rem;
  line-height: 1.35;
}

.pp-toc a:hover {
  color: var(--pp-text);
}

.pp-toc a[aria-current="true"] {
  color: var(--pp-text);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: var(--pp-text);
  text-decoration-thickness: 2px;
  text-underline-offset: 6px;
}

.pp-toc a:focus-visible,
.pp-toc-toggle:focus-visible {
  outline: 2px solid var(--pp-text);
  outline-offset: 3px;
}

/* Policy text shared styles */
.pp-content {
  max-width: 680px;
}

.pp-content section {
  margin-top: 44px;
  scroll-margin-top: 24px;
}

.pp-content h2 {
  margin: 0 0 12px;
  font-family: inherit;
  font-size: 1.625rem;
  line-height: 1.25;
  letter-spacing: -0.5px;
}

.pp-content h3 {
  margin: 24px 0 6px;
  font-family: inherit;
  font-size: 1.125rem;
  line-height: 1.3;
}

.pp-content p,
.pp-content li {
  font-size: 1rem;
}

.pp-content ul {
  padding-left: 24px;
}

.pp-content a {
  color: var(--pp-text);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
}

.pp-notice {
  margin: 24px 0;
  padding: 16px 20px;
  background: rgba(189, 35, 55, 0.06);
  border-left: 3px solid #bd2337;
  border-radius: 4px;
}

.pp-notice p {
  margin: 0;
  font-size: 0.9375rem;
}

.pp-contact {
  margin-top: 20px;
}

.pp-contact strong {
  display: block;
  margin-bottom: 4px;
}

/* Wordmark under both columns: faint at rest. On hover (or tap) it slowly
   grows and soft pastel colour blooms in patch by patch, then flows gently;
   on leaving, the patches dissolve in a different order. The glow layer sits
   exactly over the base and scales with it. Each patch is a mask blob whose
   radius (--pp-b1..5) transitions with its own delay. */
@property --pp-b1 { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
@property --pp-b2 { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
@property --pp-b3 { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
@property --pp-b4 { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
@property --pp-b5 { syntax: '<percentage>'; inherits: false; initial-value: 0%; }

.pp-wordmark {
  container-type: inline-size;
  position: relative;
  margin-top: 72px;
  font-family: 'Fraunces', Georgia, serif;
  font-weight: 900;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}

/* Sized to the column (cqw) so the word spans the text width at any size. */
.pp-wordmark-base,
.pp-wordmark-glow {
  display: block;
  font-size: clamp(64px, 14vw, 180px);
  font-size: 25cqw;
  line-height: 1;
  letter-spacing: -0.04em;
  padding-bottom: 0.08em;
  white-space: nowrap;
  transition: transform 1600ms cubic-bezier(0.22, 1, 0.36, 1);
}

.pp-wordmark:hover .pp-wordmark-base,
.pp-wordmark:hover .pp-wordmark-glow,
.pp-wordmark:active .pp-wordmark-base,
.pp-wordmark:active .pp-wordmark-glow {
  transform: scale(1.06);
}

.pp-wordmark-base {
  color: rgba(24, 21, 19, 0.06);
}

.pp-wordmark-glow {
  position: absolute;
  inset: 0;
  /* Pastel mesh: butter, periwinkle, teal and a VaRoom rose. Layers differ in
     size, so the shared position animation moves each by a different amount. */
  background-image:
    radial-gradient(closest-side, #fdd38a 35%, rgba(253, 211, 138, 0)),
    radial-gradient(closest-side, #7c8bd6 35%, rgba(124, 139, 214, 0)),
    radial-gradient(closest-side, #46b4cc 35%, rgba(70, 180, 204, 0)),
    radial-gradient(closest-side, #f08a99 30%, rgba(240, 138, 153, 0)),
    radial-gradient(closest-side, #fdd38a 35%, rgba(253, 211, 138, 0)),
    radial-gradient(closest-side, #7c8bd6 35%, rgba(124, 139, 214, 0)),
    linear-gradient(90deg, #5fb9cf, #7f8fd6);
  background-size: 55% 140%, 45% 150%, 60% 160%, 40% 120%, 50% 150%, 55% 140%, 100% 100%;
  background-position: -10% 0%, 20% 100%, 45% 50%, 62% 0%, 80% 100%, 110% 20%, 0 0;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  --pp-mask:
    radial-gradient(circle at 8% 35%, #000 calc(var(--pp-b1) - 20%), transparent var(--pp-b1)),
    radial-gradient(circle at 30% 70%, #000 calc(var(--pp-b2) - 20%), transparent var(--pp-b2)),
    radial-gradient(circle at 52% 30%, #000 calc(var(--pp-b3) - 20%), transparent var(--pp-b3)),
    radial-gradient(circle at 72% 75%, #000 calc(var(--pp-b4) - 20%), transparent var(--pp-b4)),
    radial-gradient(circle at 92% 40%, #000 calc(var(--pp-b5) - 20%), transparent var(--pp-b5));
  -webkit-mask-image: var(--pp-mask);
  mask-image: var(--pp-mask);
  opacity: 0;
  animation: pp-wordmark-flow 12s ease-in-out infinite alternate paused;
  /* Leaving: the middle goes first, the left and right edges last. */
  transition:
    opacity 1300ms cubic-bezier(0.45, 0, 0.55, 1),
    --pp-b3 900ms cubic-bezier(0.55, 0, 0.75, 0.6),
    --pp-b4 900ms cubic-bezier(0.55, 0, 0.75, 0.6) 100ms,
    --pp-b1 900ms cubic-bezier(0.55, 0, 0.75, 0.6) 220ms,
    --pp-b5 900ms cubic-bezier(0.55, 0, 0.75, 0.6) 340ms,
    --pp-b2 900ms cubic-bezier(0.55, 0, 0.75, 0.6) 420ms,
    transform 1600ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Arriving: the colour opens from the second letter outward. */
.pp-wordmark:hover .pp-wordmark-glow,
.pp-wordmark:active .pp-wordmark-glow {
  --pp-b1: 100%;
  --pp-b2: 100%;
  --pp-b3: 100%;
  --pp-b4: 100%;
  --pp-b5: 100%;
  opacity: 1;
  animation-play-state: running;
  transition:
    opacity 900ms cubic-bezier(0.25, 0.1, 0.25, 1),
    --pp-b2 1200ms cubic-bezier(0.25, 0.4, 0.45, 1),
    --pp-b5 1200ms cubic-bezier(0.25, 0.4, 0.45, 1) 140ms,
    --pp-b1 1200ms cubic-bezier(0.25, 0.4, 0.45, 1) 280ms,
    --pp-b4 1200ms cubic-bezier(0.25, 0.4, 0.45, 1) 400ms,
    --pp-b3 1200ms cubic-bezier(0.25, 0.4, 0.45, 1) 500ms,
    transform 1600ms cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes pp-wordmark-flow {
  to { background-position: 15% 100%, -5% 0%, 70% 0%, 35% 100%, 100% 0%, 85% 100%, 0 0; }
}

.pp-footer {
  color: var(--pp-muted);
  text-align: center;
  padding: 40px 20px 28px;
  font-size: 0.875rem;
}

/* Desktop Independent Scrolling Layout */
@media (min-width: 901px) {
  html:has(.pp-root),
  body:has(.pp-root),
  html.has-legal-page,
  body.has-legal-page {
    height: 100%;
    overflow: hidden;
  }

  .pp-root {
    height: 100vh;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pp-hero {
    flex-shrink: 0;
    padding: clamp(32px, 4.5vh, 48px) 20px clamp(24px, 3.5vh, 36px);
  }

  .pp-hero::after {
    height: 56px;
    bottom: -28px;
  }

  .pp-hero h1 {
    font-size: clamp(32px, 3.2vw, 48px);
  }

  /* One scroll area under the hero. The section list sticks at its top and,
     at the end of .pp-columns, rises with the text so both columns finish on
     the same line; the wordmark and footer sit centred below them. */
  .pp-content-pane {
    container-type: size;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
    scroll-behavior: smooth;
  }

  .pp-content-pane::-webkit-scrollbar {
    display: none;
  }

  .pp-body {
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 24px;
  }

  .pp-columns {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    column-gap: 48px;
    align-items: start;
  }

  .pp-content {
    padding: 36px 16px 0 0;
  }

  .pp-toc {
    position: sticky;
    top: 0;
    max-height: 100cqh;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    padding: 36px 12px 0 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .pp-toc::-webkit-scrollbar {
    display: none;
  }

}

/* Mobile & Tablet Layout (natural document scrolling without awkward nested scrollbars) */
@media (max-width: 900px) {
  .pp-root {
    min-height: 100vh;
    display: block;
    overflow-x: clip;
  }

  .pp-hero {
    padding: 100px 20px 76px;
  }

  .pp-hero::after {
    height: 72px;
    bottom: -36px;
  }

  .pp-hero h1 {
    font-size: clamp(38px, 6vw, 56px);
  }

  .pp-brand {
    left: 16px;
  }

  .pp-body {
    display: block;
    grid-template-columns: none;
    max-width: 100%;
    margin: 0 auto;
    padding: 48px 20px 60px;
  }

  /* The app clips sideways overflow with overflow-x: hidden on html and body
     (pages/_app.tsx), which turns body into its own scroll box and stops the
     sticky section menu. clip hides the same overflow without that. */
  html.has-legal-page,
  body.has-legal-page {
    overflow-x: clip;
  }

  /* A section's heading lands below the sticky section menu. */
  .pp-content section {
    scroll-margin-top: 84px;
  }

  /* The section menu stays at the top of the screen while the reader scrolls. */
  .pp-toc {
    position: sticky;
    top: 0;
    z-index: 20;
    height: auto;
    overflow: visible;
    margin: 0 -20px;
    padding: 10px 20px;
    background: var(--pp-bg);
    border-bottom: 1px solid rgba(24, 21, 19, 0.08);
  }

  .pp-toc-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 16px;
    background: #fff;
    border: 1px solid rgba(24, 21, 19, 0.16);
    border-radius: 999px;
    color: var(--pp-text);
    font: inherit;
    font-size: 0.9375rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: transform var(--motion-press, 120ms) var(--ease-out, ease-out), background var(--motion-micro, 150ms) var(--ease-out, ease-out);
  }

  .pp-toc-toggle:active {
    transform: scale(var(--press-scale, 0.97));
  }

  .pp-toc-toggle-current {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pp-toc-chevron {
    flex: 0 0 auto;
    transition: transform var(--motion-quick, 200ms) var(--ease-out, ease-out);
  }

  .pp-toc-toggle[aria-expanded="true"] .pp-toc-chevron {
    transform: rotate(180deg);
  }

  .pp-toc-list {
    display: none;
  }

  .pp-toc-list.is-open,
  .pp-toc-list.is-closing {
    display: block;
    position: absolute;
    left: 20px;
    right: 20px;
    top: calc(100% - 4px);
    max-height: min(60vh, 480px);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 18px;
    background: #fff;
    border: 1px solid rgba(24, 21, 19, 0.12);
    border-radius: 16px;
    box-shadow: 0 16px 40px rgba(24, 21, 19, 0.16);
    transform-origin: top center;
    animation: pp-menu-in var(--motion-quick, 200ms) var(--ease-out, ease-out) both;
  }

  .pp-toc-list.is-closing {
    pointer-events: none;
    animation: pp-menu-out 160ms var(--ease-in, ease-in) both;
  }

  @keyframes pp-menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.95); } }
  @keyframes pp-menu-out { to { opacity: 0; transform: translateY(-6px) scale(0.95); } }

  .pp-content-pane {
    height: auto;
    overflow: visible;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pp-content-pane {
    scroll-behavior: auto !important;
  }

  .pp-toc-list.is-open,
  .pp-toc-list.is-closing {
    animation-name: pp-menu-fade-in;
  }

  .pp-toc-list.is-closing {
    animation-name: pp-menu-fade-out;
  }

  .pp-toc-chevron {
    transition: none;
  }

  /* Reduced motion: no growth or flow; the colour simply fades in and out. */
  .pp-wordmark-glow,
  .pp-wordmark:hover .pp-wordmark-base,
  .pp-wordmark:hover .pp-wordmark-glow,
  .pp-wordmark:active .pp-wordmark-base,
  .pp-wordmark:active .pp-wordmark-glow {
    animation: none;
    transform: none;
    transition: opacity 600ms ease;
  }

  .pp-wordmark-glow {
    --pp-b1: 100%;
    --pp-b2: 100%;
    --pp-b3: 100%;
    --pp-b4: 100%;
    --pp-b5: 100%;
  }

  @keyframes pp-menu-fade-in { from { opacity: 0; } }
  @keyframes pp-menu-fade-out { to { opacity: 0; } }
}
`;
