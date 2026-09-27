# R2 photo storage

New listing photos, profile avatars, and VaRoom post images are now stored in
the configured Cloudflare R2 bucket. Supabase remains the database and auth
provider; it is no longer used for newly uploaded photo binaries.

## Configuration

Set the existing R2 variables in `server/.env`:

```dotenv
R2_ACCOUNT_ID=your-account-id
R2_BUCKET_NAME=your-bucket-name
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
```

The bucket can remain private. The app generates short-lived signed URLs from
`/api/photos/...` for public image rendering, while browser uploads use
short-lived signed PUT URLs. Configure the bucket CORS policy to allow `PUT`
from the VaRoom web origin and allow the `Content-Type` request header.

Existing Supabase Storage paths continue to render and be deleted from
Supabase. New uploads use the `photos/{environment}/{category}/...` key
layout. Objects migrated by the earlier migration tooling retain their
category-specific layout (`listing-photos/{environment}/...`,
`avatars/{environment}/...`, or `updates/{environment}/...`); all of these
R2 keys are resolved through `/api/photos/...`. Listing-photo and avatar
cleanup routes classify these keys as R2 objects. Keep those prefixes distinct
from ordinary Supabase object paths and do not delete the Supabase buckets
until the migrated objects and references have been verified.

## Object layout

New keys use this layout:

```
photos/{environment}/{category}/{user-id}/{photo-id}/original.{extension}
```

`category` is one of `listing-photos`, `avatars`, or `update-images`.
