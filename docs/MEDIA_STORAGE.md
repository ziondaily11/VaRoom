# VaRoom media storage

All new VaRoom-managed uploads use the shared Cloudflare R2 service in
`server/lib/mediaStorageService.js`. Supabase remains the metadata database.
Listing photos, profile photos, and update-post images are uploaded with a
server-authorized, short-lived R2 PUT URL; listing videos and chat attachments
continue using their existing R2 flows.

## Storage references and access

Database records keep R2 object keys, not signed URLs:

- `listing_photos.storage_path` with `storage_provider = 'r2'`
- `profiles.avatar_url` with `avatar_storage_provider = 'r2'`
- `varoom_updates.image_url` / `image_urls` entries containing object keys
- `property_media` and `message_attachments` keep their existing
  `storage_provider`, `storage_bucket`, and key fields

Public listing photos, avatars, and update images are served through
`GET /api/media/public?key=...`. The route accepts only the public image key
layouts, then streams the object from the private R2 bucket. Video and chat
media retain their existing access-controlled signed-URL routes. Old Supabase
references continue to display and can be deleted during the migration window;
they are not used for new uploads.

New image uploads accept JPEG, PNG, or WebP up to 5 MiB. Image signatures are
decoded and checked server-side after R2 upload and before a database reference
is written. Listing uploads require listing ownership; profile uploads require
the authenticated profile; update-post uploads require an administrator
account.

## Configuration

The Node service uses the existing server-only R2 configuration:

- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`

No R2 credentials are sent to the browser. The `chatbot` service also needs
`VAROOM_MEDIA_BASE_URL` set to the public base URL of the VaRoom API so it can
render listing images returned from search results. See
[`chatbot/.env.example`](../chatbot/.env.example).

## Migration and verification

Apply `server/migrations/20260926_000028_media_storage_r2.sql` using the
project's normal Supabase migration process before running the migration
scripts. Back up the database and confirm R2 configuration before applying
copies.

From `server/`, first run a read-only report:

```powershell
npm run migrate:media
```

The command is dry-run by default. Run the copy and reference update only after
reviewing the report:

```powershell
npm run migrate:media -- --apply
```

The migration processes one object at a time, uses deterministic destination
keys, verifies the R2 object before updating its database reference, and never
deletes source objects. Failed items retain their original references and are
safe to retry by rerunning the command. `--limit=N` processes at most N records
per media category in a run.

After migration and application smoke tests, run:

```powershell
npm run verify:media
```

The verifier reports legacy references, invalid references, missing objects,
duplicate object references, and unreferenced R2 objects across listing photos,
profiles, update posts, listing media, and chat attachments. It does not delete
anything. Do not remove old Supabase objects until this report is clean and the
rollback window has been explicitly closed.

## Migration boundaries

Supabase-hosted listing photos, avatars, update images, and any legacy
`property_media` objects are eligible for migration. External profile-photo
URLs (for example identity-provider avatars) are not VaRoom-uploaded objects
and remain external. Scraped Property News images are also external source
media, not user uploads, and remain unchanged. The migration scripts require
valid production credentials and were not run against a live database as part
of a source-code change.
