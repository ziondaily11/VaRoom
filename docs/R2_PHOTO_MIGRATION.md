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

Existing Supabase Storage paths still render and are deleted from Supabase.
Only new uploads are written to R2. Migrate old objects separately after
verifying the new flow; do not delete the Supabase buckets first.

## Object layout

New keys use this layout:

```
photos/{environment}/{category}/{user-id}/{photo-id}/original.{extension}
```

`category` is one of `listing-photos`, `avatars`, or `update-images`.
