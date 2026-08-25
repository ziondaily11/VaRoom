# VaRoom Google Maps — go-live checklist

Everything below is already built and merged (or on branches awaiting
review — see PRs). This file is the *only* thing left to work through
once GOOGLE_MAPS_API_KEY is ready. Nothing here requires new code.

## 1. Run the database migration
`server/migrations/20260825_000001_location.sql` on the live Supabase
project (Supabase SQL editor, or `supabase db push` if that's the
workflow in use). Additive only — safe to run any time, doesn't need
to wait for the API key. **Can be done today**, independent of the key.

## 2. Set the environment variable
Add `GOOGLE_MAPS_API_KEY=<the real key>` to the server's environment
(Render, or wherever `server/` is deployed) and to Vercel's environment
if `client/` needs it (it doesn't currently — the key is only ever
served from `/api/maps-config`, never embedded in a static file).

Restart/redeploy the server after adding it.

## 3. Restrict the key by HTTP referrer
When the key was first created, "Application restrictions" was
deliberately left at "None" for local testing. Once the production
domain is known:
- Go to Google Cloud Console → APIs & Services → Credentials → the key
- Set Application restrictions → HTTP referrers
- Add the production domain(s), e.g. `https://varoom.app/*` and
  `https://*.vercel.app/*` if using preview deployments

## 4. Smoke-test, in this order
1. `list.html` — the location picker should load a real interactive
   map instead of the "map not available" placeholder. Search for an
   area, confirm a location, publish a listing.
2. `map.html?listing=<id>` — open it for a listing with a confirmed
   location. Should show either an approximate circle (not logged in /
   no booking) or an exact pin (if you're the host).
3. Feed cards on `client-home.html` / `host-home.html` / `elie.html` —
   "Show distance" button should return a real number after granting
   location permission.
4. Approve a test booking (`bookings.html`) and confirm
   `bookings.location_snapshot` gets populated automatically (the DB
   trigger from the migration handles this — no manual step).
5. `booking-approved.html` → "View map & directions" should show the
   exact pin and a working Get Directions button.

## 5. Budget alert
Confirm the budget alert set during billing setup is still active
(e.g. alert at $5 or $10). Given the ~10K free calls/month per product
(Maps JS, Places, Geocoding), this shouldn't trigger for a long while
at VaRoom's current scale — but worth leaving on.

## Known gaps — not built, deliberately out of scope so far
- **Host "Edit Location" flow.** There's no My Properties / edit-listing
  page anywhere in the repo yet — hosts can only create listings, not
  edit them — so section 12 of the spec (edit location with
  re-confirmation) has nothing to attach to. This needs a real
  "manage my listings" feature built first, which is bigger than a
  Maps task on its own. Flag when that page exists, or if it should be
  scoped as a bigger workstream.
- **Map Discovery** (spec section 8 — browsing properties directly on
  a map with filters). Explicitly listed as a "future version" in the
  spec, not attempted here.
- **Elie location-aware search** (spec section 18). Elie can already
  show a listing's general location + map link in its results (added),
  but doesn't yet reason about location in its own search logic (e.g.
  "find me something near Westlands"). Separate, larger piece of work.
