# Draft media lifecycle operations

## Lifecycle and privacy

`listings.publication_state` is the publication authority. `availability_status`
continues to represent business availability (`available`, `booked`, `unavailable`,
`paused`, or `draft`) and is not used to infer whether legacy paused listings
were published. New submissions remain `draft`; listing-fee checkout uses
`payment_pending`; publication is set only by the authenticated server flow
after the required payment/entitlement and media checks. `discarded`,
`cleanup_pending`, and `expired` are terminal for publication and media access.

Draft photo and video uploads use the private `drafts/` prefix in the existing
private R2 bucket. The listing-photo Supabase Storage bucket is made private by
the migration. Listing photo URLs (including legacy Supabase paths) are issued
through the server only after checking the associated listing. The owner can
access an eligible draft; every other viewer receives an unavailable response.

On publication, the server copies draft R2 media to its published namespace,
verifies the copy, updates the database reference, and only then transitions
the listing to `published`. A failed copy or database update leaves the listing
private; retrying publication safely repeats verified copies.

## Expiry and scheduler

Expiry is `listings.created_at + 5 days` in PostgreSQL UTC. Edits and uploads
do not change the timestamp. Access is denied at the expiry boundary even if
cleanup has not run yet. The VaRoom Node service invokes cleanup at startup and
every `VIDEO_CLEANUP_INTERVAL_HOURS` (default: six hours); physical cleanup is
therefore the first successful scheduled run after expiry. The durable
`draft_media_cleanup_jobs` table and `SKIP LOCKED` claim function support
multiple Render web instances, process restarts, bounded batches, and retries
with capped exponential backoff. Discard revokes access immediately and queues
the same worker. The worker waits until signed upload URLs expire plus a
two-hour settle grace for in-flight PUTs,
deletes database-referenced objects plus all objects under the listing's
dedicated draft prefixes, then removes media references while retaining listing
and payment/audit records.

Configure the R2 token with only the bucket-level permissions needed to
list objects, read/copy source objects, write destinations, and delete objects
in the VaRoom media bucket. No R2 credentials are sent to clients. No additional
environment variables are introduced.

## Deployment and recovery

1. Back up the database and ensure the R2 service token has list/read/write/
   copy/delete access to this bucket.
2. Apply `server/migrations/20261018_000040_draft_media_lifecycle.sql` before
   deploying the new server and client. It adds lifecycle/job tables, safely
   classifies existing drafts and unresolved listing payments, and disables
   public access to legacy listing photos.
3. Deploy the server and client together so legacy listing-photo URLs resolve
   through the authenticated server endpoint. Confirm the API process reports
   cleanup failures in structured logs and that R2 can list/delete under
   `drafts/`.
4. To recover from a partially completed promotion, keep the listing private
   and retry the owner publication request. Copies are verified before database
   references change; source objects are retained until their reference update.
   To recover cleanup failures, inspect `draft_media_cleanup_jobs.last_error`;
   the leased job returns to the queue automatically using backoff. Never
   manually delete the last referenced object.

The database migration is additive and intentionally keeps expired/discarded
listing and payment rows for auditability. Existing R2 keys remain valid and
continue to be authorized by listing state. Old public URLs already cached
outside VaRoom cannot be revoked retroactively; making the Supabase listing
photos bucket private prevents continued direct access to legacy bucket URLs.
