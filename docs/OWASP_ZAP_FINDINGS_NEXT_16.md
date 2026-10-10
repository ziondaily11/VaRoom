# OWASP ZAP findings after the Next.js 16.4.0 upgrade

## Scope and evidence

This investigation covers ZAP alerts 10038, 10020, 10021, 10037, 10015,
10049, 10050, 10031, 10098, and 10027. The original ZAP report and its
request/response samples were not present in the repository, so findings that
depend on a specific scanned URL or response are identified as requiring
preview confirmation.

The frontend is served through Vercel. `client/vercel.json` contains rewrites
and redirects but no response-header rules. `client/next.config.js` also has
no response-header rules and does not disable Next.js's default
`X-Powered-By` header. Separately, the Express service in `server/server.js`
already disables Express's `X-Powered-By` and sets `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, and a limited CSP. Those Express
headers do not configure responses served directly by the Vercel frontend.

## Findings, causes, and proposed treatment

| Alert | Finding and cause | Proposed treatment / compatibility |
| --- | --- | --- |
| 10038 — Missing Content Security Policy | No CSP is configured for the Vercel-served frontend. Express has only `frame-ancestors` and `object-src`, not a full script/style/connect policy. | Add a CSP to frontend responses only after allowing the integrations evidenced in the app: inline legacy/Next scripts and styles, jsDelivr Supabase client, Supabase REST/realtime/storage, Google Maps, Google Fonts, and the Elie service. Keep external images/media usable. Do not add COEP. Validate the actual policy in preview before production. Paystack checkout is initiated server-side and returns a hosted URL; CSP must not block navigation or any checkout frame used by preview-tested flows. |
| 10020 — Missing anti-clickjacking header | The Vercel frontend has no `X-Frame-Options`. Express currently sets `DENY`, but that response path does not cover Vercel pages. VaRoom embeds `/chat-settings` in a same-origin iframe in `client/public/js/chat-data.js`. | Set `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'self'` on frontend responses, preserving the evidenced settings iframe while denying cross-origin framing. Change Express's incompatible `DENY`/`'none'` policy to same-origin if Express-served pages are in preview scope. |
| 10021 — Missing X-Content-Type-Options | `client/vercel.json` has no response headers; Express does set `nosniff`, but that does not protect Vercel's separately served pages. | Set `X-Content-Type-Options: nosniff` on frontend responses; preserve the existing Express header. |
| 10037 — X-Powered-By disclosure | Next.js's powered-by header remains enabled because `client/next.config.js` does not set `poweredByHeader: false`. Express already disables its own header. | Disable Next.js's powered-by header and confirm both frontend and backend responses in preview. |
| 10015, 10049, 10050 — Cache controls | Sensitive chat, billing, and admin endpoints return user/session-specific data but do not set an explicit no-store policy in their route handlers. Public property-news and photo responses intentionally have distinct public/revalidation or short-lived caching policies. | Set `Cache-Control: no-store` for the sensitive chat, billing, and admin route groups (including their auth/error responses). Retain public caching for property news and photos; do not apply no-store to all application routes. Confirm exact URLs against the ZAP report during preview. |
| 10031 — Potential XSS | `client/legacy-pages/chat-settings.html` reads the attacker-controlled `returnTo` query parameter and passes it directly to `window.location.assign()` on Back. A `javascript:` value can execute when the user activates that control. This is exploitable DOM-based XSS requiring user interaction, not a static-markup false positive. | Resolve the value against the current origin and accept only HTTP(S) destinations with the same origin; fall back to `/chat` for invalid or cross-origin input. Preserve legitimate internal return paths. |
| 10098 — Cross-domain misconfiguration | No permissive CORS setup, `crossdomain.xml`, or `clientaccesspolicy.xml` was found in the repository. The finding cannot be attributed to VaRoom from source alone. | Do not add or alter cross-domain policy speculatively. In preview, retrieve the alert URL/response and verify whether it is an external dependency, a generated policy, or a false positive. |
| 10027 — Suspicious comments | The identified comment is a normal implementation TODO (including a Paystack integration note), not a credential or bypass. | No code change. Recheck the exact ZAP evidence if the alert points to a different comment. |

Other HTML sinks inspected in the legacy chat settings helper use fixed inline
SVG constants. The catch-all Next page renders repository HTML templates loaded
at build time; its `dangerouslySetInnerHTML` does not receive a request
parameter or user-generated content. These are not evidence of an additional
exploitable XSS path in the checked code.

## Cache classification

- Public property news sets `public, max-age=0, must-revalidate` for successful
  responses and `no-store` on failures in `server/server.js`.
- Public photos use `public, max-age=300` in `server/routes/photoRoutes.js`.
- Chat responses contain participant-specific conversations/messages; billing
  responses contain a host's subscription/payment state; admin responses
  contain privileged data. These should not be stored by browser or shared
  caches.
- No global cache disablement is proposed.

## Implemented changes and CSP compatibility constraints

The current branch applies the proposed fixes: Vercel sets a response CSP,
same-origin frame protection, and `nosniff`; Next.js powered-by disclosure is
disabled; Express uses same-origin framing instead of denying the embedded
settings page; sensitive chat/billing/admin routes receive `Cache-Control:
no-store`; and chat-settings only accepts same-origin HTTP(S) return
destinations.

The CSP permits current legacy inline scripts and styles, the observed
Supabase/Google Maps/Google Fonts/Elie origins, Supabase realtime, external
images and media, blob-backed workers, and same-origin frames. It allows
Paystack checkout frames/forms without permitting Paystack scripts because the
current checkout flow is server-initialized hosted checkout. The image/media
source permits HTTPS broadly to avoid breaking property/chat assets hosted
outside the known Supabase host; this is a residual policy-hardening tradeoff.

- Legacy pages and the Next.js document/app emit inline script/style content,
  so a policy that omits inline allowances would break existing pages unless
  the app is migrated to nonce/hash-based CSP.
- Supabase is used for authentication, REST/realtime, and media upload/storage;
  the deployed Supabase origin and websocket connection must be allowed.
- Google Maps is dynamically loaded from `maps.googleapis.com` and uses Google
  static/map resources. Google Fonts are loaded from `fonts.googleapis.com`
  and `fonts.gstatic.com`.
- The chat settings page is intentionally embedded same-origin.
- Paystack uses hosted checkout initiated by the backend. Preview must verify
  checkout navigation (and any iframe integration) rather than permitting
  unnecessary broad script origins.
- Media is served from external URLs, including Supabase storage; a restrictive
  image/media allowlist must be tested against real listing and chat media.

## Preview-deployment verification plan

1. Inspect response headers for Next-rendered pages, legacy pages, rewritten
   API responses, `/admin`, and the Express host: CSP, frame, nosniff,
   powered-by, and cache controls must match the response type.
2. Confirm the same-origin chat settings iframe still loads and closes; verify
   direct and embedded chat-settings Back behavior.
3. Exercise sign-in, sign-out, password recovery, Supabase realtime chat,
   authenticated chat data, photo/media upload and playback, Google Maps, and
   hosted Paystack checkout. Check browser console CSP violations and network
   failures.
4. Confirm public property news still revalidates and public photo responses
   retain their intended caching while chat, billing, and admin responses
   return `Cache-Control: no-store`, including unauthorized/error cases.
5. Re-run ZAP against preview and compare each exact alert URL and response to
   the original report; confirm 10098/10027 disposition from scanner evidence.
6. Run the frontend production build and available repository tests locally.

## Local validation and remaining risks

- `npm run build --prefix client` completed successfully. Next.js emitted
  existing React 18 deprecation and large static-page-data warnings; neither
  failed the build.
- `node --test` in `server` passed all 59 tests with placeholder
  `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values needed to initialize
  the mocked billing module.
- The actual `safeReturnTo` function was exercised against `javascript:`,
  protocol-relative, and external URLs (all fall back to `/chat`) and valid
  same-origin paths (preserved).
- CSP compatibility is not fully verified until the specified preview flows
  run. In particular, inline script/style allowances and broad HTTPS image
  and media sources reduce policy strictness; review CSP violations and
  consider a later nonce/hash migration and explicit media host allowlist.
- The original ZAP request/response report was unavailable. Exact alert URLs,
  10098 attribution, and 10027 attribution remain to be confirmed against
  preview scan output.

No production, deployment, commit, or push is part of this investigation.
