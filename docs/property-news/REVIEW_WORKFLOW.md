# Review Workflow

The Phase 1 review system is an isolated protected API rather than a change to the current VaRoom frontend. `GET /api/admin/news/pending` returns the source, extracted text/evidence held in the private item, editorial fields, status, risk, confidence, and queued reason/event. Actions are:

- Approve and publish.
- Reject with a reason.
- Edit safe editorial fields, then keep the item pending review.
- Request more evidence.

Every action produces a `news_reviews` record and `news_events` audit event. The API requires a Bearer `NEWS_ADMIN_API_KEY` in Phase 1 and fails closed if it is absent. The reviewer ID is captured through `X-News-Reviewer-Id` where available; Phase 2 should replace this transitional key gate with an authenticated Supabase user whose `app_metadata.news_admin` is true.

No public endpoint can create, edit, approve, reject, or view review data.
