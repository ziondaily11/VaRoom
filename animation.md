# animation.md — VaRoom Motion and Animation Standard

> **Status:** permanent, project-wide standard. Created 18 Nov 2026.
> **Scope:** every UI file in `client/` (pages, components, scoped style modules, CSS modules, Tailwind classes) and every future UI file.
> **Companion documents:** `CLAUDE.md` (engineering and performance constitution) and `docs/migration/ROADMAP.md` (order of work). Where this file and `CLAUDE.md` disagree, `CLAUDE.md` wins; performance and "preserve the existing UI" always come first.

This document is a reference and a rule book. It does **not** change application code by itself. It describes:

1. Why VaRoom uses motion, and the rule that every UI task must consider it (§1–§2).
2. What motion already exists in the codebase, and where it is inconsistent (§3).
3. The VaRoom motion tokens: durations, easings, distances and scales (§4).
4. All 50 reference principles and techniques, each mapped to VaRoom (§5–§7).
5. Recipes for each kind of component (§8).
6. Mobile gestures, themes, performance, accessibility and when **not** to animate (§9–§13).
7. A checklist for every UI pull request (§14) and a one-page quick reference (§15).

---

## Table of contents

1. [The rule: animation is part of every UI task](#1-the-rule-animation-is-part-of-every-ui-task)
2. [Motion philosophy for VaRoom](#2-motion-philosophy-for-varoom)
3. [What exists today (codebase audit)](#3-what-exists-today-codebase-audit)
4. [Motion tokens](#4-motion-tokens)
5. [Part A — Foundational principles and UX laws (20)](#5-part-a--foundational-principles-and-ux-laws-20)
6. [Part B — Motion and transition techniques (20)](#6-part-b--motion-and-transition-techniques-20)
7. [Part C — Micro-interactions (10)](#7-part-c--micro-interactions-10)
8. [Component recipes](#8-component-recipes)
9. [Page transitions and navigation](#9-page-transitions-and-navigation)
10. [Mobile gestures and touch](#10-mobile-gestures-and-touch)
11. [Light and dark themes](#11-light-and-dark-themes)
12. [Performance rules](#12-performance-rules)
13. [Accessibility and `prefers-reduced-motion`](#13-accessibility-and-prefers-reduced-motion)
14. [When NOT to animate](#14-when-not-to-animate)
15. [Libraries and tools policy](#15-libraries-and-tools-policy)
16. [Known inconsistencies and consolidation backlog](#16-known-inconsistencies-and-consolidation-backlog)
17. [Motion checklist for every UI pull request](#17-motion-checklist-for-every-ui-pull-request)
18. [Quick reference card](#18-quick-reference-card)

---

## 1. The rule: animation is part of every UI task

Animation is a **first-class part of VaRoom's UI development process**, in the same way as types, caching and responsive layout.

### 1.1 Mandatory step for every UI change

Whenever a task **creates or modifies a UI file** (a `.tsx` component or page, a `*Styles.ts` style module, a `*.module.css` file, a file in `client/styles/`, or Tailwind classes), the developer or coding agent **must**:

1. **Read this file** (at least §4, §8 and §17) before writing the UI code.
2. **List the interactions** the change creates or touches: open/close, press, hover, enter/exit, load, success, error, reorder, resize, drag, theme.
3. **For each interaction, decide** which principles in §5–§7 apply. Use the "Applies when" lines.
4. **Apply the chosen principles fully**, not partially. A dropdown that animates open but disappears instantly on close is a partial implementation and is not accepted. A menu with a 200 ms open must also have its 150 ms close, its transform origin at the trigger, and its reduced-motion rule.
5. **Decide what must not move** (§14) and leave it still on purpose.
6. **Add the reduced-motion behaviour** (§13) in the same change.
7. **Report the decision** in the PR description under a "Motion" heading (template in §17.2). "No motion needed, because …" is a valid answer. Silence is not.

During investigation (CLAUDE.md §3), the existing motion of a page is part of its feature inventory. A migration that drops a legacy animation is a regression unless the change is approved. A migration that copies a legacy animation that breaks this standard should keep the visual result and fix the technique (for example, `left` → `transform`), and must say so in the PR.

### 1.2 Required examples

| New element | Required motion |
|---|---|
| Dropdown / menu / popover | Enters from its trigger at `scale(.95)` + fade, 200 ms ease-out; exits to the trigger in 150 ms ease-in; rows stagger 30 ms; reduced motion → near-instant (§8.2). |
| Button | Press feedback `scale(.97)` on `:active`, 120 ms; hover colour change 150 ms; disabled has no press (§8.1). |
| Modal / dialog / sheet | Scrim fades; panel scales from `.95` (desktop) or slides from the bottom (phone); exit 20% shorter; focus moves in and back (§8.3). |
| Listing card | Hover lift or image zoom on pointer devices only; press scale on touch; no layout shift; stagger only on first reveal (§8.6). |
| Notification / toast | Slides in from the edge it lives on, ease-out; leaves faster; success pulse or error shake when the state matters (§8.5). |
| Theme switch | **Instant.** No colour cross-fade (§11). |

### 1.3 What "do not animate blindly" means

Motion must serve one of four purposes: **feedback** (the app heard you), **continuity** (where did this come from, where did it go), **hierarchy** (look here first) or **state** (it worked, it failed, it is loading). If an animation serves none of these, remove it.

---

## 2. Motion philosophy for VaRoom

VaRoom is being rebuilt for speed (CLAUDE.md §1). Motion must make the app **feel** faster, never **be** slower.

1. **Fast by default.** Most UI motion is 120–250 ms. Nothing that blocks the user may last longer than 300 ms. Long animations (400 ms+) are only for things the user is waiting for anyway (sending a booking request, counting a metric).
2. **Never block input.** The user can always click, type, scroll or navigate during an animation. An exiting element gets `pointer-events: none`; the next element is usable at once.
3. **Content first.** Data that is already cached (CLAUDE.md §5.3) renders immediately. Do not delay cached content to play an entrance. Do not re-play an entrance when the user comes back to a page.
4. **The shell does not move.** `AppShell`, the sidebars and the mobile nav persist across routes (CLAUDE.md §4). They never play route-level enter/exit animations.
5. **Calm, not playful.** VaRoom is a property and booking product used to make money decisions. No bounce on everyday UI. Expressive motion is reserved for rare moments: a booking request sent, a success screen, the landing page.
6. **Origin and direction mean something.** Things grow from what opened them, slide in the direction of travel, and go back where they came from.
7. **Respect the user's settings.** `prefers-reduced-motion: reduce` is always honoured (§13).
8. **CSS first.** Use CSS transitions and keyframes on `transform` and `opacity`. Use JavaScript only when the motion depends on live input (drag, velocity) or on a value that CSS cannot read (count-up, progress tied to a request).

---

## 3. What exists today (codebase audit)

This audit was made on 18 Nov 2026 from `client/`. It describes the current state so that future work reuses what exists.

### 3.1 Architecture that affects motion

| Area | Current state | Consequence for motion |
|---|---|---|
| Framework | Next.js 16 (Pages Router, `client/pages/`), React 18.3, TypeScript. | No React 19 / `<ViewTransition>` APIs. Route changes are client-side via `next/link`. |
| Persistent shell | `components/shell/AppShell.tsx`, chosen in `pages/_app.tsx`; the icon rail is a class on the same `AppShell`, so the sidebar is not remounted. | Do not wrap pages in keyed animated containers that remount the shell. |
| Styling | Mostly **scoped CSS strings** in `components/**/*Styles.ts` (for example `shellStyles.ts`, `bookingStyles.ts`, `analyticsStyles.ts`, `settingsStyles.ts`), injected with `<style>`; some **CSS modules** (`pages/ClientHome.module.css`, `components/clientHome/NextTripCard.module.css`, `components/landing/SpacesSection.module.css`); global files in `client/styles/`; legacy chat styles in `client/public/js/chats.css`. | Motion values must work inside template strings. Prefer exported TypeScript constants interpolated into the CSS string, as `AnimatedMenu.tsx` already does. |
| Tailwind | Tailwind 3.4, `preflight: false`, `darkMode: ['selector', '[data-theme="dark"]']`. No motion tokens in `tailwind.config.js`. | Tailwind's default `transition`, `duration-*` and `ease-*` utilities exist but are not the VaRoom tokens. Use them only if they match §4 values exactly. |
| Theme | `lib/theme.ts` is the one place that decides the theme. A pre-paint script in `_document` sets `data-theme` and `color-scheme` before first paint; `_app` re-applies it on route changes and only writes when it changes. User controls: `pages/settings.tsx`, `components/profile/ProfileTopbar.tsx`; key `varoom_theme` (`lib/settings/settings.ts`). | Theme switching is already instant. Keep it that way (§11). |
| Animation libraries | **None** for general UI motion (no Framer Motion, React Spring, GSAP). Decorative packages used only by Elie / chat: `border-beam` (`ElieComposerBeam.tsx`, `ElieThread.tsx`, `ChatComposerActions.tsx`), `thinking-orbs`, `liquid-gooey`. Charts use `recharts`. | Do not add an animation library (§15). The Elie packages stay scoped to Elie. |

### 3.2 Existing motion building blocks (reuse these)

| Building block | File | What it does | Status vs this standard |
|---|---|---|---|
| `AnimatedMenu`, `useMenuPresence`, `menuItemStyle`, `MENU_OPEN_MS = 200`, `MENU_CLOSE_MS = 150`, `MENU_STAGGER_MS = 30` | `components/chat/AnimatedMenu.tsx` | Menu grows from its trigger, shrinks back, rows stagger 30 ms, keeps the node mounted through the exit, reduced-motion rule. Used by Chat Settings and quick replies. | **Reference implementation.** Closest to this standard. Only deviation: starts at `scale(.9)` instead of `.95`. Candidate to move to a shared `components/motion/` folder (§16). |
| `.va-menu[data-state="open" / "closing"]` | `components/analytics/analyticsStyles.ts`, `ListingPicker.tsx` | Same pattern for the analytics listing picker, `scale(.92)`, 200 / 150 ms. | Duplicate of `AnimatedMenu`. Consolidate later. |
| `SeenSection`, `useSeen`, `useCountUp`, `Count` | `components/analytics/motion.tsx` | Plays card animations the first time a card is 25% on screen (IntersectionObserver); counts numbers with ease-out cubic; reduced motion shows the final value. | Good. Reuse for any "reveal once on scroll" or count-up. |
| `SendingButton` | `components/booking/SendingButton.tsx` | Booking request button: progress fill + paper plane (ease-in-out to 85% over 1800 ms, creep to 95% while waiting), finish, fade, success text; reverses on error; reduced motion → static "Sending…". | Good. This is the pattern for long, important submits. |
| Auth panel slides | `components/landing/AuthPanel.tsx`, `PasswordRecovery.tsx` | Directional content slides: exit 140 ms ease-in, enter 180 ms ease-out, left/right by direction; reduced motion → 1 ms. | Good. Pattern for step-to-step content (§7.4). |
| Shell drawer and mobile nav | `components/shell/shellStyles.ts` | Mobile sidebar `translateX(-100%)` → `0` in 250 ms; mobile nav hides on scroll with `translateY(110%)` in 220 ms; reduced motion → none. | Good technique (transform). Easing is plain `ease`; align to tokens later. |
| Start-page toast | `components/shell/StartPagePin.tsx`, `shellStyles.ts` | Toast rises 12 px + fades in 200 ms; reduced motion → none. | Good. |
| Success pop and ring | `components/support/supportStyles.ts` | Support success icon `scale(.72 → 1)` + ring pulse `scale(.7 → 1.25)` fade. | Good "pulse to confirm" example. **Missing reduced-motion rule.** |
| Settings search hit | `components/settings/settingsStyles.ts` | Highlights the matched setting (1.8 s); reduced-motion rule present. | Good "staging the focus" example. |
| Reply target highlight | `public/js/chats.css` (`reply-target-highlight`, 1.6 s) | Highlights the message a reply points to after scroll. | Good "staging the focus" example. |
| Skeleton shimmer / pulse | Many: `ClientHome.module.css`, `notifications.tsx`, `property-news.tsx`, `profileStyles.ts`, `marketplaceStyles.ts`, `settingsStyles.ts`, `HostProfile.tsx`, `chats.css` | Several near-identical keyframes (`skeleton-shimmer`, `skel-shimmer`, `skeletonPulse`, `chat-skeleton-pulse`, …). | Works, but duplicated (§16). |
| Spinners | `styles/spinner.css` (`varoom-spinner-turn`) and page-specific spinners | Loading indicators. | Prefer `styles/spinner.css`. |
| Press scale | `pages/ClientHome.module.css` (`.marketplaceSwitch:active`, `.tab:active` → `.97`; `.action:active` → `.96`) and other files (`.99`) | Press feedback. | Standardise on `.97` (§7.1). |
| Switch | `components/chat/chatSettingsStyles.ts` (`.cs-switch`) | Thumb `transform` 180 ms, reduced-motion rule. | Good base; add knob stretch (§6.5). |
| Account modal | `components/AddAccountModal.tsx` | Backdrop fade 200 ms, card pop 220 ms `cubic-bezier(0.16, 1, 0.3, 1)`. | Good entrance. **No exit animation and no reduced-motion rule.** |

### 3.3 Conflicts and inconsistencies found

These are recorded here so that new work does **not** copy them. Fixing them is separate work (§16), not part of a feature task unless the task touches that file.

1. **No shared motion tokens.** At least nine different easing curves are in use, for example `cubic-bezier(0.22, 1, 0.36, 1)` (13 uses), `cubic-bezier(0.16, 1, 0.3, 1)` (5), `cubic-bezier(.2,.8,.2,1)` (5), `cubic-bezier(.45,0,.2,1)`, `cubic-bezier(.4,0,1,1)`, `cubic-bezier(.2,.9,.3,1)`, `cubic-bezier(0.25, 0.1, 0.25, 1)` (as `--home-ease`), plus plain `ease`.
2. **Three press scales**: `.96`, `.97`, `.99`.
3. **Popover start scales** of `.9` and `.92`, not `.95`.
4. **`transition: all`** in three places (`bookingStyles.ts` `.gallery-dot`, two in `hostHomeStyles.ts`). This animates properties nobody intended, including colours on theme switch.
5. **Three private copies** of a `reducedMotion()` helper (`SendingButton.tsx`, `analytics/motion.tsx`, `landing/SpacesSection.tsx`).
6. **Two menu systems** (`vr-menu` and `va-menu`) doing the same job.
7. **Reduced-motion gaps**: Support success pop/ring, `AddAccountModal`, and some skeletons.
8. **Missing exits**: `AddAccountModal` and several dialogs unmount instantly.

---

## 4. Motion tokens

These are the VaRoom values. Use them by name in new code. Do not invent new numbers without a reason written in the PR.

### 4.1 Durations

| Token | Value | Use |
|---|---|---|
| `instant` | 0 ms | Theme switch, focus ring, text selection, values while dragging. |
| `press` | 120 ms | `:active` scale, press-and-release. |
| `micro` | 150 ms | Hover colour, icon swap, tooltip, small exits (menu close). |
| `quick` | 200 ms | Dropdown / popover / menu open, toast in, chevron rotate, switch. |
| `standard` | 250 ms | Modal / sheet open, drawer, tab content, height change. |
| `emphasis` | 300 ms | Large panels, page-level overlay, shared-element move. **Upper limit for blocking UI.** |
| `slow` | 400–600 ms | Success celebration, count-up start, image zoom on hover. Never blocks input. |
| `exit` | entrance × 0.8 | All exits are about 20% shorter (§6.15). |
| `stagger` | 30 ms per item | List rows, menu items. Cap total stagger at 300 ms (10 items); later items appear with the 10th. |
| `tooltipDelay` | 500 ms first, 0 ms while moving between tooltips for 300 ms after one closes | §7.8. |
| `longPress` | 500 ms | Chat message menu (decided in the Chats track). |

### 4.2 Easings

| Token | Curve | Use |
|---|---|---|
| `easeOut` (entrances) | `cubic-bezier(0.22, 1, 0.36, 1)` | Anything entering or reacting to the user: menus, modals, toasts, hover. Already the most used curve in VaRoom. |
| `easeIn` (exits) | `cubic-bezier(0.4, 0, 1, 1)` | Anything leaving the screen. Already used by `AnimatedMenu` close. |
| `easeInOut` (moves) | `cubic-bezier(0.65, 0, 0.35, 1)` | Something visible moving from A to B: switch knob, tab indicator, shared element, carousel slide. |
| `linear` | `linear` | Only for spinners, progress that tracks real progress, and shimmer loops. |
| `spring` (gesture release only) | JS spring: stiffness 400, damping 40, mass 1 (critically damped, no overshoot) | Releasing a dragged sheet, carousel or knob, using the release velocity (§7.9). |

`cubic-bezier(0.16, 1, 0.3, 1)` (used by `AddAccountModal`) is close enough to `easeOut` to keep. Do not add new curves.

### 4.3 Distances and scales

| Token | Value | Use |
|---|---|---|
| `pressScale` | `0.97` | Buttons, cards, chips, tabs on `:active`. |
| `popoverFromScale` | `0.95` | Menus, popovers, dialogs on desktop. |
| `shiftSm` | 4–6 px | Menu/popover travel toward the trigger; list rows rising. |
| `shiftMd` | 12–16 px | Toasts, step content, cards entering. |
| `shiftLg` | 100% of own size | Drawers and bottom sheets (off-screen). |
| `hoverLift` | `translateY(-2px)` | Cards on pointer devices. |
| `knobStretch` | 12% | Switch knob width while travelling (§6.5). |
| `shakeDistance` | 6 px, 3 cycles, 300–400 ms | Error shake (§7.3). |

### 4.4 Where tokens should live (future implementation)

There is no token file yet. When the first task needs them, create **one** module and import it everywhere; do not create several. The recommended shape, consistent with the current `*Styles.ts` architecture:

```ts
// client/lib/motion/tokens.ts  (example — not created by this document)
export const DURATION = {
  instant: 0, press: 120, micro: 150, quick: 200, standard: 250, emphasis: 300,
} as const;

export const EASE = {
  out: 'cubic-bezier(0.22, 1, 0.36, 1)',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
} as const;

export const STAGGER_MS = 30;
export const STAGGER_MAX_ITEMS = 10;
export const PRESS_SCALE = 0.97;
export const POPOVER_FROM_SCALE = 0.95;

/** Exits are about 20% shorter than entrances. */
export const exitMs = (enterMs: number) => Math.round(enterMs * 0.8);
```

For CSS modules and global CSS, mirror the same values as custom properties on `:root` (one global file, for example `client/styles/motion.css` imported once in `_app.tsx`):

```css
/* example — not created by this document */
:root {
  --motion-press: 120ms;
  --motion-micro: 150ms;
  --motion-quick: 200ms;
  --motion-standard: 250ms;
  --motion-emphasis: 300ms;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --press-scale: 0.97;
}
```

Keep `AnimatedMenu`'s `MENU_OPEN_MS` / `MENU_CLOSE_MS` / `MENU_STAGGER_MS` names working (tests in `client/test/chat-quick-replies.test.js` read `MENU_STYLES`), and re-export them from the token values when consolidating.

---

## 5. Part A — Foundational principles and UX laws (20)

Each entry gives: **what it is**, **applies when**, **VaRoom examples**, **values**, and **don't**.

### A1. Squash & stretch
- **What:** An object changes shape as it moves or hits something, which shows weight and speed.
- **Applies when:** A small, solid object moves under the user's control: a switch knob, a slider thumb, a pull-to-refresh indicator.
- **VaRoom:** Settings and Chat Settings switches (`.cs-switch`); calendar range handles in `BookingCalendar.tsx` / `listWizard/AvailabilityCalendar.tsx` if made draggable; the mobile sheet grab handle.
- **Values:** Max 12% stretch along the direction of travel (see B5); return to normal at the end of the move.
- **Don't:** Squash text, cards, images, modals or icons with meaning.

### A2. Anticipation wind-up
- **What:** A small movement before the main action that prepares the eye.
- **Applies when:** An action is large or important and the user started it: sending a booking request, deleting, a drawer about to slide.
- **VaRoom:** `SendingButton` already does this (the button locks and the fill begins before the request result). Press scale (`.97`) is the everyday form of anticipation: the button "winds up" before the action.
- **Values:** 80–120 ms, small (press scale or 2–4 px pull back).
- **Don't:** Delay the real action to play a wind-up. The request starts at the same moment.

### A3. Staging the focus
- **What:** Direct attention to the one thing that matters now.
- **Applies when:** After navigation to a specific item, after search, after an error, when something new arrives.
- **VaRoom:** Settings search highlight (`settings-search-hit`); chat reply target highlight (`reply-target-highlight`); scrolling to the first invalid field in onboarding or the list wizard; a new booking request on Host Home (`AttentionCard.tsx`); the red hero card in Analytics.
- **Values:** One highlight at a time; a fade of background tint 1.2–1.8 s ease-out; or a single pulse (C-success).
- **Don't:** Highlight several things at once. Don't loop a highlight.

### A4. Pose to pose
- **What:** Define the key states (poses) first, then animate between them.
- **Applies when:** Any component with more than two states.
- **VaRoom:** `SendingButton` has explicit phases `idle → sending → sent` and `sending → idle` on error. Booking request states, payment (`PayDialog.tsx`), upload (`MediaPicker.tsx`), and the chat composer (empty → typing → sending → sent / failed) should be designed the same way.
- **Values:** Write the state list as a TypeScript union (`type Phase = 'idle' | 'sending' | 'sent'`) and drive classes / `data-state` from it.
- **Don't:** Animate with ad-hoc timeouts and boolean flags that can disagree.

### A5. Follow through
- **What:** Parts of an object keep moving a little after the main body stops, and settle.
- **Applies when:** A container arrives and its contents settle after it.
- **VaRoom:** Menu rows arriving 30 ms apart after the menu (`AnimatedMenu`); modal content fading in 40–60 ms after the panel; a toast's icon finishing after the toast stops.
- **Values:** Child delay 30–60 ms; child travel ≤ 6 px.
- **Don't:** Use overshoot/bounce as follow-through on everyday UI (B13).

### A6. Slow in & slow out
- **What:** Real objects accelerate and decelerate; nothing starts or stops at full speed.
- **Applies when:** Always, except spinners and linear progress.
- **VaRoom:** Use `easeOut` for entrances, `easeIn` for exits, `easeInOut` for moves (§4.2). `useCountUp` and `SendingButton` already use cubic ease functions.
- **Don't:** Use `linear` for UI movement. Don't use plain `ease` in new code; use a token.

### A7. Moving in arcs
- **What:** Natural movement follows curves, not straight diagonal lines.
- **Applies when:** An object travels a long distance on two axes: a listing image flying into the saved/bookmark target, a media thumbnail expanding to full screen.
- **VaRoom:** Save-to-bookmarks feedback (`lib/bookmarks`, `SavedListings.tsx`), a shared listing card dropping into a chat (`ShareListingSheet.tsx`).
- **Values:** Animate X and Y with different easings (X `easeInOut`, Y `easeOut`), or use a two-keyframe path; 300–400 ms.
- **Don't:** Use arcs for short moves (< 100 px) or for menus, which must move straight to/from the trigger.

### A8. Secondary action
- **What:** A smaller action that supports the main one without competing.
- **Applies when:** The main action has a result that can be shown on a second element.
- **VaRoom:** After "Save", the heart fills (main) and the Saved count in the sidebar ticks (secondary); after sending a message, the inbox row moves to the top and its preview updates (secondary, already done in CH2 without animation); notification badge appears in the shell after a realtime event.
- **Values:** Secondary motion is smaller, shorter (≤ 200 ms) and starts at the same time or just after.
- **Don't:** Let the secondary action be larger or louder than the primary.

### A9. Snappy timing
- **What:** Short durations make the interface feel responsive.
- **Applies when:** Always for direct-manipulation UI.
- **VaRoom:** Hover 150 ms, press 120 ms, menus 200/150 ms, modals 250/200 ms. Matches the existing `AnimatedMenu` and Auth slides (140 / 180 ms).
- **Don't:** Exceed 300 ms for anything that blocks the user. Don't slow an animation down to "make it visible"; make it clearer instead.

### A10. Exaggerated feedback
- **What:** Make important results slightly larger than life so they are noticed.
- **Applies when:** A rare, important result: booking request sent, payment confirmed, listing published, support ticket sent.
- **VaRoom:** Support success pop + ring; `SendingButton` success; `booking-approved` page; listing wizard publish (`ReviewStep.tsx`).
- **Values:** Scale from `.72` to `1` with ring to `1.25` over 350–650 ms (existing support values).
- **Don't:** Exaggerate everyday actions (saving a setting, sending a chat message, toggling a filter).

### A11. Solid drawing in 3D
- **What:** Objects keep consistent volume, light and depth as they move.
- **Applies when:** An element changes elevation: card hover, modal over scrim, dragged item.
- **VaRoom:** Use the shared shadow tokens (`--shadow-sm/md/lg`, exposed in `tailwind.config.js`). A lifted card goes from `shadow-sm` to `shadow-md`; a modal sits at `shadow-lg`. Light comes from above: shadows fall downward.
- **Values:** Animate elevation by fading a pre-made shadow on a pseudo-element (`opacity`), not by transitioning `box-shadow` on many cards (§12).
- **Don't:** Use 3D rotations, perspective flips or parallax on product UI. In dark theme, analytics sets `--shadow:none`; rely on surface colour steps instead of shadows.

### A12. Overall appeal
- **What:** Motion as a whole feels coherent, pleasant and on-brand.
- **Applies when:** Reviewing any page.
- **VaRoom:** One set of tokens; the brand red (`--color-primary`) used for focus and success states only where already used; consistent direction rules. The page should feel like one product.
- **Don't:** Mix bouncy and calm styles on one page; don't use different durations for the same kind of element.

### A13. Fitts's law
- **What:** Time to hit a target depends on its distance and size. Big, near targets are faster.
- **Applies when:** Placing primary actions and sizing controls.
- **VaRoom:** Booking CTA in `BookingWidget.tsx` / `BookingSidebar.tsx` stays large and near the price; mobile nav (`MobileNav.tsx`) puts the five main destinations at the bottom, near the thumb; menus open next to their trigger (B11), so the first item is close to the pointer.
- **Motion link:** Popovers that open at the trigger keep the distance short. Don't animate a menu from a far corner.

### A14. Bigger hit areas
- **What:** The clickable area can be larger than the visible element.
- **Applies when:** Icon buttons, close buttons, chips, small links, message "⋯" buttons, carousel dots.
- **VaRoom:** Minimum 44 × 44 px on touch, 32 × 32 px on desktop. Gallery dots in `bookingStyles.ts` are 6 px visually; give them a larger invisible hit area with padding or a `::before`.
- **Values:** Expand with padding or `::before { content:''; position:absolute; inset:-8px; }`.
- **Don't:** Scale the visible element to grow the hit area; that causes layout shift.

### A15. Hick's law
- **What:** More choices mean slower decisions.
- **Applies when:** Menus, filters, settings, onboarding steps.
- **VaRoom:** Keep menus short; the account and "More" popovers in the sidebars (`useShellChrome.ts`) should show the main actions first. Filters in Marketplace and Discover: show the common filters, put the rest behind "More filters".
- **Motion link:** Stagger reveals the first options first, which guides the eye; cap the stagger (10 items).

### A16. Miller's law
- **What:** People hold about 7 (± 2) items in working memory.
- **Applies when:** Grouping content, steps and navigation.
- **VaRoom:** List wizard (`WizardChrome.tsx`, `StepFrame.tsx`) shows steps in small groups; settings sections (`SettingsSections.tsx`) are grouped boxes.
- **Motion link:** Animate groups, not every item: a section enters as a block, not 30 separate items.

### A17. Doherty threshold
- **What:** Productivity rises when the system responds in under 400 ms.
- **Applies when:** Every interaction.
- **VaRoom:** Visual feedback within 100 ms of input (press state, optimistic UI). If the result takes longer than 400 ms, show progress: skeleton for content, spinner or `SendingButton` progress for actions. Cached data renders at once (CLAUDE.md §5.3).
- **Values:** Feedback ≤ 100 ms; show a loader only if the wait passes ~300 ms (avoid loader flashes); keep it at least ~400 ms once shown so it does not flicker.
- **Don't:** Use an animation to hide a slow request. Fix the request first.

### A18. Postel's law
- **What:** Be liberal in what you accept, conservative in what you send.
- **Applies when:** Forms, inputs, gestures.
- **VaRoom:** Phone, price and date inputs in onboarding, booking and the list wizard accept common formats; gestures accept small, imprecise drags (use thresholds); OTP input (`OtpCodeInput.tsx`) accepts paste.
- **Motion link:** Do not shake for input you could have accepted. Shake only for a real error after submit (C3).

### A19. Jakob's law
- **What:** Users expect your product to work like the other products they use.
- **Applies when:** Choosing standard patterns.
- **VaRoom:** Bottom sheets slide up on phones; drawers slide from the side they live on; modals scale from the centre on desktop; pull/rubber-band at scroll ends; long-press opens a message menu; swiping a gallery moves photos.
- **Don't:** Invent new motion meanings (for example a menu that slides in from the bottom on desktop).

### A20. Frequency of use
- **What:** The more often something is used, the less animation it should have.
- **Applies when:** Choosing how much motion to give an element.
- **VaRoom:**
  - **Very frequent** (sidebar links, chat send, tab switches, inbox rows, typing): press feedback and colour only; no entrance animations.
  - **Frequent** (menus, filters, tooltips): short, standard motion (§4).
  - **Rare** (booking sent, listing published, onboarding complete, first visit to Analytics): richer motion allowed (A10).
- **Don't:** Make the user watch the same animation hundreds of times a day.

---

## 6. Part B — Motion and transition techniques (20)

### B1. Ease-out for entrances
- **Rule:** Elements entering the screen use `easeOut` (`cubic-bezier(0.22, 1, 0.36, 1)`): fast start, gentle stop.
- **VaRoom:** Menus, modals, toasts, drawers opening, step content (`auth-content-enter-*` already uses `ease-out`).
- **Code:**
  ```css
  .x-enter { animation: x-in var(--motion-quick) var(--ease-out) both; }
  ```

### B2. Dropdowns at 150–250 ms
- **Rule:** Dropdowns, selects, menus and popovers open in 150–250 ms (VaRoom default 200 ms) and close in 150 ms.
- **VaRoom:** `AnimatedMenu` (200 / 150), analytics `va-menu` (200 / 150), sidebar "More" and account popovers (`useShellChrome.ts`), `HostListingMenu.tsx`, `MessageActionMenu.tsx`, `QuickReplyPicker.tsx`, chat settings selects.

### B3. Stagger list rows by 30 ms
- **Rule:** When a short list appears as a unit, each row starts 30 ms after the previous.
- **VaRoom:** Menu rows (`menuItemStyle(index)` sets `--i`), notification list on first load, search suggestions, quick replies.
- **Values:** 30 ms; cap at 10 items (300 ms); rows travel 4–6 px.
- **Don't:** Stagger long lists, infinite feeds, chat messages, table rows, or lists the user returns to.

### B4. Scale to 0.97 on press
- **Rule:** Pressable elements scale to `0.97` on `:active`, 120 ms, and return on release.
- **VaRoom:** All buttons, tabs, chips, listing cards on touch, mobile nav items. Already used by `.marketplaceSwitch` and `.tab` in `ClientHome.module.css`. See C1/C2.

### B5. Stretch moving knobs 12%
- **Rule:** A knob that travels (switch thumb, segmented-control indicator) grows about 12% along its path during the move, then returns.
- **VaRoom:** `.cs-switch::before` in `chatSettingsStyles.ts`; settings toggles; analytics segmented control (`.va-segctl`).
- **Code:**
  ```css
  .switch::before { transition: transform 200ms var(--ease-in-out), width 200ms var(--ease-in-out); }
  .switch:active::before { width: calc(var(--knob) * 1.12); } /* stretch while pressed */
  ```
  Prefer `transform: scaleX(1.12)` with the right `transform-origin` when possible, to avoid animating `width`.

### B6. Stagger as details settle
- **Rule:** Inside a container that just arrived, secondary details (meta text, badges, actions) arrive slightly after the main content.
- **VaRoom:** Booking detail panel (`BookingDetail.tsx`): title first, then dates/price, then actions; conversation info panel (`ConversationInfo.tsx`); listing details on `booking.tsx`.
- **Values:** 2–3 groups, 40–60 ms apart, opacity + 4 px rise.
- **Don't:** Delay the primary action button by more than 100 ms.

### B7. Arcs for object movement
- **Rule:** An object travelling a long distance on two axes follows a curve (see A7).
- **VaRoom:** Save-to-bookmarks fly-to-target; media item opening from a grid into a viewer.

### B8. Pulse to confirm success
- **Rule:** A single, soft pulse confirms a completed action.
- **VaRoom:** Support success ring (`success-ring`); "Copied" note after Copy in the chat message menu; saved settings; "Pinned" start page (`StartPagePin.tsx`).
- **Values:** One pulse, 400–650 ms, scale ≤ 1.25 on a ring or ≤ 1.06 on the element, ease-out, no loop.

### B9. Ease-in-out for moves
- **Rule:** An element already on screen that moves from A to B uses `easeInOut`.
- **VaRoom:** Switch knob, tab underline / active pill, carousel slide in `BookingGallery.tsx` and Client Home destinations, reordering categories in `CategoryManager.tsx`.

### B10. Start popovers at 0.95
- **Rule:** Popovers, menus and desktop dialogs start at `scale(0.95)` + `opacity: 0`, not at `0` and not at `0.9`.
- **VaRoom:** New code uses `.95`. Existing `.9` (`AnimatedMenu`) and `.92` (`va-menu`) are aligned when those files are next touched (§16).

### B11. Enter from the trigger
- **Rule:** Set `transform-origin` to the side of the popover that touches its trigger, and travel 4–6 px from the trigger.
- **VaRoom:** `AnimatedMenu` does this (`below-end` → `top right`, `above-start` → `bottom left`). The sidebar account popover opens **above** its button (`positionPopover` in `useShellChrome.ts` sets `bottom`), so its origin is `bottom center`.
- **Code:**
  ```css
  .menu--below-end  { transform-origin: top right;   --from-y: -6px; }
  .menu--above-start{ transform-origin: bottom left; --from-y:  6px; }
  @keyframes menu-in { from { opacity:0; transform: translateY(var(--from-y)) scale(.95); } to { opacity:1; transform:none; } }
  ```

### B12. Exit to the trigger
- **Rule:** On close, the popover returns the way it came: same origin, reverse transform, `easeIn`.
- **VaRoom:** `vr-menu-out` and `va-menu-out` already do this. Every new popover must too.

### B13. No bounce on everyday UI
- **Rule:** No overshoot, elastic or bounce easings on menus, modals, buttons, lists, toasts, drawers or tabs.
- **VaRoom:** Allowed only for rare celebrations (A10) and the landing page hero (`HeroSection.tsx`, `SpacesSection`). The Elie typing dots (`elie-bounce`) are a loading indicator, not a UI transition, and stay.

### B14. Don't tween while held
- **Rule:** While the user's finger or pointer is dragging, the element follows the input directly with no transition. Animate only after release.
- **VaRoom:** Bottom sheets, gallery swipes, calendar range drag, mobile drawer swipe, map pan (`LocationMap.tsx`).
- **Code:** set `transition: none` during `pointermove`; restore the transition on `pointerup` (§10).

### B15. Make exits 20% shorter
- **Rule:** Exit duration ≈ entrance × 0.8. Users have already decided; don't make them wait.
- **VaRoom:** Menu 200 → 150 (`AnimatedMenu`, close to 0.75); Auth 180 → 140; modal 250 → 200; toast 200 → 160.

### B16. Overlap old & new states
- **Rule:** When content A is replaced by content B, start B before A has fully gone (a short overlap or crossfade), so there is never an empty frame.
- **VaRoom:** Auth step slides (exit 140 ms, enter 180 ms) — next time it is touched, overlap them; tab content in Bookings (`ClientBookingsView.tsx` / `HostBookingsView.tsx`); Discover category switch; skeleton → content (fade content in over the skeleton, ≤ 150 ms).
- **Values:** Overlap 50–100 ms. Use absolute positioning for the outgoing layer so layout does not jump.

### B17. Masks for reveals & colour
- **Rule:** Use `clip-path` or masks to reveal content or wipe colour, instead of moving or resizing the element.
- **VaRoom:** `SendingButton` progress uses `scaleX` (a mask-like fill); good candidates: the red success fill on CTAs, image reveal on media load (`VideoMedia.tsx`), analytics bar/line draw (`va-draw` already uses a draw effect).
- **Code:**
  ```css
  .reveal { clip-path: inset(0 100% 0 0); transition: clip-path var(--motion-standard) var(--ease-out); }
  .reveal.is-shown { clip-path: inset(0 0 0 0); }
  ```
- **Don't:** Use masks on large scrolling areas (paint cost).

### B18. Crossfade icons + blur
- **Rule:** When one icon replaces another in the same place, crossfade them with a short blur and a small scale, rather than a hard swap.
- **VaRoom:** Send ↔ microphone in the chat composer (`ChatComposerActions.tsx`); copy → check; heart outline → filled; play ↔ pause in `VideoPlayer.tsx`; menu ↔ close on mobile.
- **Code:**
  ```css
  .icon-swap > * { grid-area: 1/1; transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out), filter 150ms var(--ease-out); }
  .icon-swap > [data-hidden] { opacity: 0; transform: scale(.8); filter: blur(2px); }
  ```
  Keep `blur` ≤ 2 px and only on small icons.

### B19. Rubber band past bounds
- **Rule:** When a drag goes past the end, resist with decreasing movement, then spring back on release.
- **VaRoom:** Bottom sheets dragged up past full height; gallery swiped past first/last photo; horizontal rails (destinations, host rail). Native scroll containers on iOS already rubber-band; don't fight them. See C10 for the formula.

### B20. Reuse the same layout ID
- **Rule:** When the same object appears in two places (a card and its expanded view), animate one element between the two positions, so the user sees it is the same thing.
- **VaRoom:** Listing card → booking page hero image; media thumbnail → full-screen viewer; active tab pill moving between tabs; chat avatar → conversation info panel.
- **How (no new library):** Use a FLIP helper (measure First, Last, Invert, Play) with a shared string id (`data-layout-id="listing-123-photo"`) for in-page moves. For route-level shared elements, the browser View Transitions API may be used **only** with feature detection, only for the changing content area (never the shell), and only after a measured test that it does not delay navigation. See §9.3.

---

## 7. Part C — Micro-interactions (10)

### C1. Scale from 0.97
- **Rule:** Press state = `scale(0.97)`. One value across VaRoom. (Existing `.96` / `.99` are aligned when those files are touched.)
- **Code:**
  ```css
  .btn { transition: transform var(--motion-press) var(--ease-out); }
  .btn:active:not(:disabled) { transform: scale(var(--press-scale)); }
  ```
- **Don't:** Scale large surfaces (full-width panels, whole forms). For full-width list rows, use a background tint instead.

### C2. Press feedback
- **Rule:** Every pressable element responds within 100 ms: scale (C1), background tint, or both. Touch devices need it most, because there is no hover.
- **VaRoom:** Buttons, mobile nav items, inbox rows (tint), listing cards (scale), chips, calendar days.
- **Notes:** Use `:active`, and add `-webkit-tap-highlight-color: transparent` only when a custom press state exists. Keep `:focus-visible` outlines (the analytics pattern: `outline: 2px solid var(--accent)`).

### C3. Shake on error
- **Rule:** On a failed submit, shake the field or form horizontally once, **and** show the error text and colour. The shake is never the only signal.
- **VaRoom:** Login / signup (`AuthPanel.tsx`, `SignupForm.tsx`), OTP code (`OtpCodeInput.tsx`), password recovery, booking form validation, payment failure in `PayDialog.tsx`.
- **Code:**
  ```css
  @keyframes vr-shake { 0%,100%{transform:none} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
  .is-error-shake { animation: vr-shake 320ms var(--ease-in-out); }
  @media (prefers-reduced-motion: reduce) { .is-error-shake { animation: none; } }
  ```
  Re-trigger by removing the class on `animationend`. Move focus to the field and announce the error with `aria-live` / `aria-invalid`.
- **Don't:** Shake while the user is still typing (Postel's law, A18).

### C4. Directional slides
- **Rule:** Content slides in the direction of navigation: forward = from the right, back = from the left (reverse in RTL).
- **VaRoom:** Auth panel already does this (`exit-left` / `enter-right` and the reverse). Use the same for onboarding steps (`OnboardingSteps.tsx`), list wizard steps (`StepFrame.tsx`), booking steps, month change in calendars, phone conversation list ↔ thread in Chats.
- **Values:** 12–24 px travel + fade, enter 180–250 ms ease-out, exit 140–200 ms ease-in.

### C5. Smooth height auto
- **Rule:** When a container grows or shrinks (accordion, expanding text, error message appears, "show more"), animate the height smoothly instead of jumping.
- **VaRoom:** Settings sections (`SettingsBox.tsx`), policy sections (`PolicySections.tsx`), FAQ in Support, business hours editor (`BusinessHoursEditor.tsx`), composer reply preview, property-news excerpts.
- **Technique (preferred):** CSS grid rows, which animate without measuring:
  ```css
  .collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--motion-standard) var(--ease-out); }
  .collapse[data-open="true"] { grid-template-rows: 1fr; }
  .collapse > .inner { overflow: hidden; min-height: 0; }
  ```
  This animates layout, so use it only for single, user-triggered sections, not for lists of many items.
- **Don't:** Animate `height` on many items at once, or on content that changes while streaming (chat messages, Elie answers).

### C6. Transform, not left
- **Rule:** Move things with `transform: translate()` and fade with `opacity`. Never animate `left`, `top`, `right`, `bottom`, `margin`, `width` or `height` for movement.
- **VaRoom:** The shell drawer (`translateX(-100%)`) and the mobile nav hide (`translateY(110%)`) already follow this. `SendingButton` moves its plane with `translateX`. See §12.

### C7. Instant theme switch
- **Rule:** Changing light ↔ dark is instant. No global colour transition.
- **VaRoom:** `lib/theme.ts` writes `data-theme` and `color-scheme` at once; keep it. See §11 for how to stop component hover transitions from making the switch look slow.

### C8. Tooltip skip delay
- **Rule:** The first tooltip waits ~500 ms. If the user moves to another tooltip trigger within 300 ms of the last one closing, the next tooltip shows **at once**, with no fade-in.
- **VaRoom:** The icon-only rail in `ClientSidebar.tsx` / `HostSidebar.tsx` currently uses native `title` tooltips (`tip(...)`). Native tooltips cannot follow this rule. If custom tooltips are built for the rail, the analytics charts or icon buttons, they must implement the skip delay with one shared timer (a module-level "last closed at" timestamp), not one timer per tooltip.
- **Values:** Show delay 500 ms; skip window 300 ms; fade 100 ms (0 ms when skipping); exit 80 ms.
- **Don't:** Add tooltips on touch devices; they cannot hover.

### C9. Velocity springs
- **Rule:** When a drag is released, the follow-up animation starts at the finger's speed and settles with a critically damped spring (no overshoot), so the motion continues the gesture.
- **VaRoom:** Bottom sheets (Report and Share Listing sheets in chat, booking detail on phone), gallery swipe, mobile drawer, dismissible toasts.
- **Code:** see §10.3.

### C10. Rubber banding
- **Rule:** Past a limit, movement is reduced so the content feels attached by elastic.
- **Formula:** `offset = limit × (1 − 1 / (excess × 0.55 / limit + 1))`, where `excess` is how far past the bound the finger is and `limit` is the max visual overshoot (e.g. 80 px).
- **VaRoom:** Same places as B19.

---

## 8. Component recipes

Each recipe combines the principles above. "Exists in" points to code to reuse or align.

### 8.1 Buttons, chips, tabs, segmented controls

| State | Motion |
|---|---|
| Hover (pointer devices) | Background / border / colour, 150 ms `easeOut`. Wrap in `@media (hover: hover)` so touch devices don't get stuck hover. |
| Press | `scale(.97)`, 120 ms (C1, C2). |
| Focus | Instant `:focus-visible` outline. Never animate the focus ring in. |
| Disabled | No hover, no press scale, no transition. |
| Loading | Keep width (lock `min-width`/`min-height` like `SendingButton` locks `minHeight`); swap label for spinner with an icon crossfade (B18). Set `aria-busy`. |
| Success (important) | `SendingButton` pattern: fill → fade → success text (A2, A4, A10). |
| Error | Return to idle (reverse fill), show message, optional shake on the form (C3). |
| Tabs / segmented | Active pill moves between options with `easeInOut` 200–250 ms (B9, B20); knob stretch optional (B5). |

### 8.2 Dropdowns, menus, popovers, selects

- **Reuse** `AnimatedMenu` / `useMenuPresence` for any new menu. Do not create a third menu system.
- Open: 200 ms, `easeOut`, from `scale(.95)` + 4–6 px toward the trigger, `transform-origin` at the trigger (B2, B10, B11).
- Rows: stagger 30 ms, cap 10 (B3).
- Close: 150 ms, `easeIn`, back to the trigger (B12, B15); `pointer-events: none` while closing; rows don't animate on close (as `AnimatedMenu` already does).
- Close on outside click and Escape (pattern exists in `useShellChrome.ts`); return focus to the trigger.
- Chevron in the trigger rotates 180° in 200 ms (exists: `.cs-select__chevron`).
- Phone widths: a long menu becomes a bottom sheet (§8.3).
- Reduced motion: duration ≈ 1 ms, no delay (exists in `MENU_STYLES`).

```tsx
// Usage of the existing building block (example)
<AnimatedMenu open={open} placement="below-end" role="menu">
  {items.map((item, i) => (
    <button key={item.id} role="menuitem" className="vr-menu-item" style={menuItemStyle(i)}>{item.label}</button>
  ))}
</AnimatedMenu>
```

### 8.3 Modals, dialogs, bottom sheets, drawers

| Part | Desktop / tablet | Phone (≤ 760 px) |
|---|---|---|
| Scrim | Fade 0 → 1, 200 ms; exit 150 ms. | Same. |
| Panel enter | `scale(.95)` + fade → `none`, 250 ms `easeOut`. | Slide from bottom `translateY(100%)` → `0`, 250–300 ms `easeOut`. |
| Panel exit | Reverse, 200 ms `easeIn`. | Slide down, 200–240 ms `easeIn`, or follow the drag (§10). |
| Contents | Settle 40 ms after the panel (A5). | Same. |
| Focus | Move focus into the dialog on open; trap it; return it to the trigger on close. | Same. |
| Scroll | Lock background scroll; keep scroll position. | Same. |

- Use `useMenuPresence`-style presence (keep mounted during the exit) so dialogs **have** an exit. Applies to `AddAccountModal.tsx`, `ReservationDialogs.tsx`, `PayDialog.tsx`, `ReviewModal.tsx`, `HostHomeDialogs.tsx`, `LeaveDialog.tsx`, `SupportDialog.tsx`, `ReportSheet.tsx`, `ShareListingSheet.tsx`.
- Drawers (mobile sidebar) slide from the side they live on (`translateX(-100%)` → `0`, exists in `shellStyles.ts`).
- If a dialog opens from a specific element (a card, an image), consider B20 instead of a centre scale.
- Confirm dialogs for destructive actions (Delete for everyone) appear fast (200 ms) and have no celebratory motion.

### 8.4 Tooltips

See C8. Fade + 2–4 px travel away from the anchor, 100 ms in, 80 ms out. Use one shared timer for the skip delay. Never on touch.

### 8.5 Notifications, toasts, badges, banners

| Element | Motion |
|---|---|
| Toast | Enter from its edge (bottom-centre toast: rise 12 px + fade, 200 ms `easeOut`, as `.start-page-toast`). Exit 160 ms `easeIn`. Auto-dismiss pauses on hover/focus. Swipe to dismiss on phones (§10). Announce text with `aria-live="polite"`. |
| Success toast | Optional single icon pulse (B8). |
| Error toast | No shake on the toast itself; red icon; stays until dismissed if the user must act. |
| Badge count (sidebar, mobile nav, notifications) | When the number changes: a single `scale(1 → 1.15 → 1)` pulse, 200 ms. When it first appears: fade + `scale(.6 → 1)`, 150 ms. No looping pings except true "pending" states (`pending-ping` exists). |
| Notification list (`pages/notifications.tsx`) | First load: rows stagger 30 ms (cap 10). Realtime new item: slides down from the top with height animation (C5) and a brief tint (A3). Returning to the page with cache: no animation. |
| Banners (`WorkspaceBanner.tsx`, `AddAccountNotice.tsx`) | Height + fade in (C5), 250 ms; dismiss 200 ms. |

### 8.6 Listing cards, Discover feed, Marketplace grid, search and filters

- **Hover (pointer devices only):** card lifts `translateY(-2px)` and its shadow fades to `shadow-md` via pseudo-element opacity, 200 ms; or the image zooms `scale(1.03)` over 400–450 ms inside `overflow:hidden` (exists: `.destination:hover img`, 0.45 s). Choose one, not both.
- **Press:** `scale(.97)` (C1).
- **Save / heart:** icon crossfade (B18) + small pulse (B8); optional fly-to-saved arc (A7) on desktop; sidebar Saved count ticks (A8).
- **First reveal:** cards fade + rise 8–12 px when they enter the viewport the first time, stagger 30 ms per visible card, cap 10 (use the `SeenSection` / IntersectionObserver pattern). **Never** for cards rendered from cache on back-navigation.
- **Infinite scroll / pagination** (`lib/discover/feedCursor.ts`, `feedWindow.ts`): appended cards appear without stagger, or with one shared fade; no layout shift — reserve space with skeletons of the same size.
- **Skeleton → content:** crossfade ≤ 150 ms (B16). Skeleton sizes must match the real card (no jump).
- **Filters and search:** results update in place. Debounced search (CLAUDE.md §5.4) keeps old results visible, dimmed to `opacity:.5` while loading (exists: `.va-stale`), then swaps. Filter chips press (C1) and the active state changes colour in 150 ms. Removing a result: fade + collapse height (C5). Reordering results: FLIP (B20) only if ≤ 20 items move; otherwise swap instantly.
- **Video in feeds** (`VideoMedia.tsx`, `VideoPlayer.tsx`): poster → video crossfade 200 ms; play/pause icon crossfade (B18); no auto-animated controls while scrubbing (B14).

### 8.7 Forms, inputs and validation

- Focus: border colour 150 ms; focus ring instant.
- Floating labels (if used): move with `transform`, 150 ms `easeOut`.
- Inline validation: show the message with height + fade (C5), 200 ms; after submit only, not on every keystroke (A18).
- Failed submit: shake the form or first invalid field (C3), scroll it into view, focus it (A3).
- Password show/hide, copy-to-clipboard: icon crossfade (B18).
- OTP input: each box gets a press/fill state; wrong code → shake the group once and clear.
- Multi-step forms (onboarding, list wizard, booking): directional slides (C4), overlap states (B16), progress bar moves with `easeInOut` (B9) via `transform: scaleX()`.

### 8.8 Booking flow

| Step | Motion |
|---|---|
| Gallery (`BookingGallery.tsx`) | Swipe follows the finger (B14), releases with a velocity spring (C9), rubber-bands at ends (B19). Dots: colour/scale on `transform`, not `transition: all`. |
| Calendar (`BookingCalendar.tsx`) | Month change: directional slide (C4), 200 ms. Range selection fills instantly while dragging; release settles 150 ms. |
| Price / guests changes | Number swap with a short vertical crossfade (150 ms). No count-up for prices: the user needs the exact value now. |
| Request button | `SendingButton` (existing). Do not replace it. |
| Policy sections | Smooth height (C5). |
| `booking-approved` | Rare success: exaggerated feedback is allowed (A10), ≤ 650 ms, then still. |
| Payment (`PayDialog.tsx`, Paystack in pricing) | Modal recipe (§8.3); spinner while waiting on the provider; **no celebratory animation until payment is confirmed by the server.** |

### 8.9 Chats and messaging (`pages/chats.tsx`, `components/chat/*`, `public/js/chats.css`)

Chats is used constantly (A20). Motion must be minimal and must never delay messages.

| Interaction | Motion |
|---|---|
| Opening a conversation (desktop) | No animation; content swaps immediately (cached thread renders at once). |
| Inbox ↔ thread on phone | Directional slide (C4), 220 ms; back slides the other way. |
| Sending a message | Own bubble appears at once (optimistic), fade + 4 px rise, 120 ms. Pending → sent → read receipts: icon crossfade (B18). Failed: red state + retry; no shake. |
| Receiving a message | Fade + 4 px rise, 150 ms, only if the user is at the bottom. If not, show a "new messages" pill with a rise (8.5) instead of moving the scroll. |
| Typing indicator | Existing `elie-bounce` dots; reduced motion → static dots. |
| Reply reference click | Smooth scroll, then `reply-target-highlight` (A3). Reduced motion → instant scroll + highlight. |
| Message menu | `MessageActionMenu.tsx`: right-click, 500 ms long-press or "⋯". Opens from the message with the popover recipe (8.2). Long-press gives a press scale on the bubble at ~150 ms so the user knows the hold is working (A2). |
| Copy | "Copied" note: fade in 150 ms, out after ~1.2 s; or check-icon crossfade. |
| Composer | Send ↔ mic crossfade (B18); reply preview height (C5); attachment preview (`MediaPreviewComposer.tsx`) scale from `.95`. The Elie `border-beam` effect stays Elie-only. |
| Sheets (Report, Share Listing) | Bottom sheet recipe (8.3) and drag (§10). |
| Info panel (`ConversationInfo.tsx`) | Desktop right rail: no animation when it is part of the layout. Narrow widths, where it becomes an overlay (CLAUDE.md §7): slide from the right, 250 ms; scrim fade. |
| Elie | Streaming text appears as it arrives with no per-token animation. `thinking-orbs` / `liquid-gooey` only inside Elie. Result cards (listings, news) fade + rise once, stagger 30 ms, cap 4. |

### 8.10 Settings and Chat Settings

- Switches: knob `transform` (exists) with stretch (B5); track colour 180 ms.
- Section open/close: smooth height (C5).
- Saved: subtle success pulse on the control or a toast (B8). Not on every keystroke.
- Search in settings: highlight (exists, A3).
- Chat Settings inside the same-origin iframe from Chats: keep its own motion; closing via `postMessage` uses the host page's sheet/panel exit.

### 8.11 Navigation: sidebars, rail, mobile nav

- Active item: background tint 150 ms. No sliding indicator unless it already exists.
- Rail ↔ expanded sidebar: the rail is a class on the same `AppShell`. If this ever animates, animate `transform`/`opacity` of labels and width via a single `grid-template-columns` change, 200 ms, and never remount.
- Mobile drawer: existing `translateX` slide, 250 ms; swipe to close with B14/C9.
- Mobile nav hide on scroll: existing `translateY(110%)` in 220 ms; reveal on scroll up.
- "More" / account popovers: menu recipe (8.2), opening upward from the button (B11).

### 8.12 Loading states

| Situation | Use |
|---|---|
| Content with known shape | Skeleton matching the final layout; one shared shimmer (§16); crossfade to content ≤ 150 ms. |
| Action in a button | Spinner inside the button (width locked) or `SendingButton` for long, important actions. |
| Whole page, first ever visit, nothing cached | A local skeleton. Never a full-screen loader over a persistent shell (CLAUDE.md §5.5). |
| Refresh in background | Nothing visible, or `.va-stale` dimming if data is visibly old. |
| < 300 ms waits | Show nothing extra; avoid flashes (A17). |

### 8.13 Analytics and charts

Reuse `SeenSection`, `useCountUp`, `Count` and `va-draw`. Animate once per page view when a card is first seen; never re-animate on filter change except a value-to-value count (already implemented). Recharts animations should be short (≤ 600 ms) and disabled under reduced motion.

### 8.14 Landing, auth and marketing pages

The landing page (`pages/index.tsx`, `HeroSection.tsx`, `SpacesSection`) may use richer, expressive motion (hero fade-up, background drift, card deal), because it is visited rarely per user. Rules still apply: reduced motion (exists), no layout shift, no delay to the sign-in form.

---

## 9. Page transitions and navigation

### 9.1 Rules

1. **No full-page transitions.** VaRoom navigates with `next/link` inside a persistent `AppShell`. The shell never fades, slides or remounts on navigation.
2. **No keyed animated route wrappers.** Do not wrap `pageElement` in `_app.tsx` with a component keyed by route to play enter/exit; that remounts subtrees and breaks CLAUDE.md §4.3.
3. **Content appears immediately.** If data is cached, the new page renders fully on the first frame. If not, local skeletons appear in the content area only.
4. **Optional content fade.** A page's own content area may fade in from `opacity: .0 → 1` in ≤ 150 ms on first mount, **only** when it is not rendered from cache. Never delay interaction for it.
5. **Back / forward:** no entrance animation; restore scroll position (CLAUDE.md §5.3).
6. **Step flows inside a page** (auth, onboarding, wizard, booking): use directional slides (C4).
7. **Phone master → detail** (Chats inbox → thread, Bookings list → detail): directional slide, 220 ms, back reverses.

### 9.2 Active navigation feedback

When a link is pressed, the nav item shows its active state at once (optimistic), before the route finishes. Press scale on mobile nav items (C1).

### 9.3 Shared elements across routes (B20)

Allowed only when all are true:
- The browser supports `document.startViewTransition` (feature-detect; otherwise navigate normally).
- Only the changing element (for example a listing photo) gets a `view-transition-name`; the shell is excluded.
- Measured: navigation time is not increased and no extra requests or remounts happen.
- Reduced motion disables it.

Until such a test exists, prefer in-page FLIP (for example, card → expanded view on the same route) and plain navigation between routes.

---

## 10. Mobile gestures and touch

### 10.1 General rules

- Use Pointer Events (`pointerdown/move/up/cancel`) and `setPointerCapture`; one code path for mouse and touch.
- Set `touch-action` on the draggable element (`pan-y` for a horizontal swiper, `none` for a sheet handle) so the browser does not fight the gesture.
- Use a movement threshold (8–10 px) before a drag starts, so taps still work (Postel, A18).
- Decide direction once (horizontal vs vertical) after the threshold.
- While held: follow the finger 1:1 with `transform`, `transition: none` (B14).
- Past bounds: rubber band (C10).
- On release: decide by **position or velocity** (e.g. dismiss if dragged > 30% or velocity > 0.5 px/ms), then animate with a velocity spring (C9).
- Write position with `requestAnimationFrame`, not on every event.
- Clean up listeners and cancel frames on unmount (as `SendingButton` and `useCountUp` do).

### 10.2 Where gestures belong in VaRoom

| Gesture | Where |
|---|---|
| Swipe photos | `BookingGallery.tsx`, listing cards with multiple photos, media viewer. |
| Drag down to dismiss | Bottom sheets (Report, Share Listing, phone menus, booking detail on phone). |
| Swipe to close drawer | Mobile sidebar drawer. |
| Long-press | Chat message menu (500 ms). |
| Horizontal rails | Client Home destinations, host rail: native scroll with `scroll-snap`; no custom JS unless needed. |
| Pull to refresh | Not used today. Don't add without a product decision. |

### 10.3 Velocity spring example (no library)

```ts
// Example only — a critically damped spring that starts at the release velocity.
export function springTo(
  from: number, to: number, velocity: number,
  apply: (value: number) => void,
  { stiffness = 400, damping = 40, mass = 1 } = {},
): () => void {
  let x = from; let v = velocity; let last = performance.now(); let frame = 0;
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000); last = now;
    const force = -stiffness * (x - to) - damping * v;
    v += (force / mass) * dt; x += v * dt;
    apply(x);
    if (Math.abs(v) > 0.01 || Math.abs(x - to) > 0.5) frame = requestAnimationFrame(step);
    else apply(to);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame); // call on unmount or new drag
}
```

Under reduced motion, skip the spring and set the final position.

### 10.4 Hover vs touch

Wrap hover effects in `@media (hover: hover) and (pointer: fine)`. On touch, use press states. Never hide information behind hover only.

---

## 11. Light and dark themes

1. **Theme switching is instant** (C7). `lib/theme.ts` and the `_document` pre-paint script already do this. Do not add `transition` on `html`, `body`, `:root` or on theme custom properties.
2. **Don't let component transitions slow the switch.** Elements with `transition: background-color …` (for hover) will also fade when the theme changes. Rules:
   - Never use `transition: all` (it catches colours) — list properties explicitly.
   - Prefer transitioning colour only on interaction states where possible.
   - If a visible fade on switch remains, the theme control (Settings, `ProfileTopbar.tsx`) may set a short-lived attribute such as `data-theme-switching` on `<html>` for one frame, with `[data-theme-switching] * { transition: none !important; }`. This is a future implementation option, not done by this document.
3. **Motion is the same in both themes.** Only colours and shadows change. Dark theme uses fewer/no shadows (analytics sets `--shadow:none`), so elevation changes in dark mode use surface-colour steps (`--card` → `--soft`) instead of shadow fades.
4. **Highlights and pulses** must use theme tokens (for example `--accent-soft`) so they are visible in both themes.
5. **Forced-light routes** (`/`, `/payments`, `/property-news`, `/privacy`, `/terms`) and dark-first `/pricing` switch theme on navigation without any fade.

---

## 12. Performance rules

1. **Animate only `transform` and `opacity`** for anything that moves, scales or fades. These run on the compositor (GPU) and do not cause layout or paint.
2. **Never animate** `left/top/right/bottom`, `margin`, `padding`, `width/height` (except C5 single sections), `font-size`, or `box-shadow` on many elements. For shadows, fade a pseudo-element:
   ```css
   .card { position: relative; transition: transform 200ms var(--ease-out); }
   .card::after { content:''; position:absolute; inset:0; border-radius:inherit; box-shadow: var(--shadow-md); opacity:0; transition: opacity 200ms var(--ease-out); pointer-events:none; }
   @media (hover: hover) { .card:hover { transform: translateY(-2px); } .card:hover::after { opacity:1; } }
   ```
3. **No `transition: all`.** List properties.
4. **`will-change`** only on elements that are about to animate (set it on press/hover or just before a drag; remove after). Never on whole lists.
5. **Filters and blur** are expensive: blur ≤ 2 px on small icons only (B18). No animated `backdrop-filter` on large areas.
6. **Use CSS keyframes/transitions** over JS. Use `requestAnimationFrame` for JS animation and cancel it on unmount. Never use `setInterval` for animation.
7. **Use IntersectionObserver** (as `SeenSection` does) to start animations only when visible; disconnect after the first time.
8. **No animation on first paint of cached content** and none on back-navigation (CLAUDE.md §5.3).
9. **No layout shift.** Reserve space for content that loads (skeletons of the right size), for error messages (or animate height, C5), and for images (`aspect-ratio`).
10. **Infinite animations** (shimmer, spinner, pulse) only while something is truly loading; remove them as soon as it finishes. Pause off-screen loops when practical.
11. **Lists:** stagger caps (10 items); no per-row animation in long or virtualised lists (Discover feed window, chat thread).
12. **Do not re-inject style strings on every render** in hot components; follow the existing `*Styles.ts` pattern of a constant string.
13. **Don't add an animation library** for something CSS can do (§15).
14. **Measure** when in doubt: Chrome Performance panel, "Paint flashing" and "Layer borders"; target 60 fps on a mid-range phone.

---

## 13. Accessibility and `prefers-reduced-motion`

### 13.1 The rule

Every animation added to VaRoom must have a reduced-motion behaviour **in the same change**. This is not optional.

### 13.2 What "reduced" means in VaRoom

| Motion type | Under `prefers-reduced-motion: reduce` |
|---|---|
| Movement (slides, scale, arcs, parallax, shared elements) | Remove the movement. Keep a short opacity fade (≤ 150 ms) or make it instant. |
| Menus / popovers / dialogs | Near-instant (1 ms, no delay) — existing pattern in `MENU_STYLES` and `ANALYTICS_CSS`. |
| Stagger | No delay; everything appears together. |
| Shake on error | No shake; the red state, message and focus still happen. |
| Success pulse | No scale; show the final state (icon/colour). |
| Count-up | Show the final number (exists in `useCountUp`). |
| Long progress (`SendingButton`) | Static "Sending…" (exists). |
| Spinners | May keep turning slowly (existing spinners slow to 1.6–2 s), because they communicate state; or switch to a static indicator with text. |
| Skeleton shimmer | No shimmer (static block). |
| Smooth scroll | Instant scroll. |
| Gesture follow (drag) | Still follows the finger (the user is moving it), but release snaps to the end without a spring. |
| Video autoplay | Do not autoplay decorative video; show a poster. |

### 13.3 Implementation pattern

CSS (preferred):

```css
@media (prefers-reduced-motion: reduce) {
  .x-enter, .x-exit { animation-duration: 1ms; animation-delay: 0ms; }
  .x-move { transition: none; }
}
```

JS: VaRoom already has three private `reducedMotion()` helpers. When the next task needs one, create a single shared hook and replace the copies in the files that task touches (example):

```ts
// client/lib/motion/useReducedMotion.ts  (example — not created by this document)
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.(QUERY).matches);
}

/** Live value: updates if the user changes the OS setting. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false); // false on the server; corrected after mount
  useEffect(() => {
    const mql = window.matchMedia?.(QUERY);
    if (!mql) return undefined;
    const update = () => setReduced(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return reduced;
}
```

### 13.4 Other accessibility rules

- **Information never depends on motion alone.** Errors have text and colour; success has text or an icon; loading has `aria-busy` or text.
- **Announce changes** with `aria-live` (toasts, "Copied", sending state — `SendingButton` already uses `aria-live="polite"`).
- **Focus:** dialogs and menus move focus in and return it to the trigger; focus rings are instant and always visible on `:focus-visible`.
- **No flashing** more than 3 times per second. No large-area flashes.
- **No auto-moving content longer than 5 s** without a pause control (carousels, marquees).
- **Hidden ≠ gone:** elements that animate out must also leave the accessibility tree after the exit (unmount, `hidden`, or `aria-hidden`), and must not receive focus while closing.
- **Hit areas** stay large (A14); animations must not move a target away from the pointer during a press.

---

## 14. When NOT to animate

Do not add motion in these cases:

1. **Theme switch** (C7, §11).
2. **The persistent shell on navigation** (§9).
3. **Cached content** on first frame or back-navigation.
4. **High-frequency actions** (A20): typing, sending chat messages beyond the small fade, switching conversations on desktop, selecting text, sidebar link changes.
5. **While the user drags** (B14).
6. **Exact values the user must read now**: prices, totals, booking dates, payment amounts. No count-up, no rolling numbers.
7. **Large scrolling lists and virtualised feeds** (no per-row entrance).
8. **Focus rings, caret, selection, scrollbars.**
9. **Error states that need calm**: payment failure, account problems, security messages (no bounce, no celebration; a single shake is the maximum, on the form only).
10. **Before the server confirms** money or booking results: no success animation for optimistic payment states.
11. **To hide slowness** (A17). Fix the request instead.
12. **Decorative loops** in product UI (floating, wobbling, glowing). Exceptions: landing hero and Elie, already scoped.
13. **When reduced motion is on** — follow §13.2.
14. **If it costs frames.** If an animation drops below 60 fps on a mid-range phone, simplify or remove it.

---

## 15. Libraries and tools policy

- **Do not add an animation library** (Framer Motion / Motion, React Spring, GSAP, Anime.js, Lottie, AutoAnimate) without a written, measured need in the PR: what CSS + small hooks cannot do, the bundle cost, and the pages affected. Today there is no such need: menus, modals, height, stagger, FLIP, springs and reveals are all covered by CSS and the small helpers in this document.
- **Existing packages:** `border-beam`, `thinking-orbs`, `liquid-gooey` stay **scoped to Elie and the chat composer**. Do not use them for general UI. `recharts` animations follow §8.13.
- **Allowed platform tools:** CSS transitions/keyframes, Web Animations API (`element.animate`) for one-off JS-driven keyframes, `requestAnimationFrame`, IntersectionObserver, ResizeObserver (only when needed, one per component, cleaned up — CLAUDE.md §7), View Transitions (under §9.3 conditions).
- **Tailwind:** may be used for simple transitions if the values equal §4 tokens. If motion utilities are needed widely, add the tokens to `tailwind.config.js` `theme.extend` (`transitionDuration`, `transitionTimingFunction`) in a dedicated task — not inside a feature task.
- **One implementation per pattern.** Before writing motion code, search for an existing one (`AnimatedMenu`, `useMenuPresence`, `SeenSection`, `useCountUp`, `SendingButton`, `styles/spinner.css`).

---

## 16. Known inconsistencies and consolidation backlog

These items come from the audit in §3.3. They are **not** done by this document. Each should become a small, separate task (following CLAUDE.md §12.1), or be fixed when a task already modifies that file.

| # | Item | Suggested fix |
|---|---|---|
| M1 | No shared tokens | Create `lib/motion/tokens.ts` and one global CSS token file (§4.4); migrate files as they are touched. |
| M2 | Two menu systems (`vr-menu`, `va-menu`) | Move `AnimatedMenu` to a shared folder (e.g. `components/motion/`), set start scale `.95`, use it in `ListingPicker.tsx`; keep test expectations in `chat-quick-replies.test.js` and `host-analytics.test.js` passing or update them. |
| M3 | Three `reducedMotion()` copies | Shared `useReducedMotion` / `prefersReducedMotion` (§13.3). |
| M4 | Press scales `.96` / `.99` | Align to `.97`. |
| M5 | `transition: all` (3 places) | List properties. |
| M6 | Missing reduced-motion: Support success, `AddAccountModal` | Add rules. |
| M7 | Dialogs without exit animation | Presence pattern (§8.3). |
| M8 | Many skeleton keyframes | One shared skeleton style and keyframe. |
| M9 | Nine easing curves | Map to the three tokens (§4.2). |
| M10 | Rail tooltips are native `title` | Decide whether custom tooltips with skip delay (C8) are wanted. |

Add these to the Backlog in `docs/migration/ROADMAP.md` when they are scheduled, as CLAUDE.md requires for problems found along the way.

---

## 17. Motion checklist for every UI pull request

### 17.1 Checklist

Before committing a UI change, confirm each line:

- [ ] I read `animation.md` and listed the interactions this change creates or touches.
- [ ] Each interaction has a decision: which principles apply (§5–§7), or why no motion is needed (§14).
- [ ] I reused an existing building block where one exists (§3.2, §15).
- [ ] Durations and easings use the tokens (§4); exits are ~20% shorter than entrances.
- [ ] Popovers/menus enter from and exit to their trigger, start at `.95`, and have an exit.
- [ ] Pressable elements have press feedback (`.97`); hover is limited to `(hover: hover)`.
- [ ] Only `transform` and `opacity` animate (except a single C5 height section); no `transition: all`.
- [ ] Nothing blocks input; exiting elements have `pointer-events: none`.
- [ ] Cached content and back-navigation render without entrance animation; the shell does not animate or remount.
- [ ] `prefers-reduced-motion` behaviour is implemented and tested (§13).
- [ ] Information is never conveyed by motion alone; focus and `aria-live` are handled.
- [ ] Light and dark themes both look correct; theme switch stays instant.
- [ ] Tested on a phone width (≤ 760 px) and desktop; gestures follow the finger and release correctly.
- [ ] No new animation dependency (or a written, measured justification).
- [ ] Checked for dropped frames or layout shift on the affected page.

### 17.2 PR description template

```markdown
### Motion
- Interactions touched: [list]
- Principles applied: [e.g. B2, B10, B11, B12, B3, C1, §13]
- Reused: [e.g. AnimatedMenu / useMenuPresence]
- Values: [e.g. open 200 ms ease-out from .95, close 150 ms ease-in, stagger 30 ms]
- Not animated on purpose: [e.g. price total (§14.6)]
- Reduced motion: [what happens]
- Tested: [desktop / phone width / reduced motion on / light / dark]
```

### 17.3 How to test motion

- Chrome DevTools → Rendering → "Emulate CSS media feature prefers-reduced-motion: reduce".
- Rendering → "Paint flashing" and "Layout shift regions" while interacting.
- Performance panel with 4× CPU throttling: animations should stay near 60 fps.
- DevTools Animations panel: slow to 10% to check origin, direction and easing.
- Phone emulation (and a real phone where possible) for gestures and press states.
- Existing tests that read motion CSS: `client/test/chat-quick-replies.test.js`, `client/test/host-analytics.test.js`, `client/test/home-loading-state.test.js`. Update them in the same change if a motion string they check is changed on purpose.

---

## 18. Quick reference card

| Thing | Enter | Exit | Easing | From | Reduced motion |
|---|---|---|---|---|---|
| Press | 120 ms | 120 ms | easeOut | `scale(.97)` | keep (tiny) or tint only |
| Hover | 150 ms | 150 ms | easeOut | colour / `-2px` | colour only |
| Tooltip | 100 ms after 500 ms delay (0 when skipping) | 80 ms | easeOut | 2–4 px + fade | fade only |
| Menu / popover / dropdown | 200 ms | 150 ms | out / in | `.95` + 4–6 px from trigger | ~1 ms |
| Menu rows | +30 ms each, cap 10 | none | easeOut | 4–6 px | no stagger |
| Modal (desktop) | 250 ms | 200 ms | out / in | `.95` + fade | fade ≤ 150 ms |
| Bottom sheet (phone) | 250–300 ms | 200–240 ms | out / in, spring after drag | `translateY(100%)` | instant / fade |
| Drawer | 250 ms | 200 ms | out / in | `translateX(±100%)` | instant |
| Toast | 200 ms | 160 ms | out / in | 12 px from edge | fade |
| Step change | 180–250 ms | 140–200 ms | out / in | 12–24 px by direction | fade / instant |
| Height change | 250 ms | 200 ms | easeOut | `grid-template-rows 0fr→1fr` | instant |
| Move A→B (knob, tab pill) | 200–250 ms | — | easeInOut | — (knob stretch 12%) | instant |
| Success pulse | 400–650 ms, once | — | easeOut | ring `.7→1.25` | final state |
| Error shake | 320 ms, once | — | easeInOut | ±6 px | none (text + colour) |
| Badge change | 200 ms | — | easeOut | `1→1.15→1` | none |
| Theme switch | **0 ms** | **0 ms** | — | — | — |
| Route change | **none** for the shell; content ≤ 150 ms fade only if uncached | — | — | — | none |

**Remember:** motion in VaRoom exists to make the app feel faster and clearer. If an animation makes the user wait, hides content, ignores reduced motion, or moves the shell, it is wrong — remove it.
