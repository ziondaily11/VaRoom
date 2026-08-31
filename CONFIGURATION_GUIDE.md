# VaRoom Video Upload System - Configuration Guide

## 1. CLOUDFLARE R2 SETUP (Required)

### Step 1.1: Create R2 Bucket
1. Log into **Cloudflare Dashboard**
2. Navigate to **R2** in the left sidebar
3. Click **Create Bucket**
4. Enter bucket name (e.g., `varoom-videos-prod` or `varoom-videos-dev`)
5. Select region (e.g., WEUR for Europe)
6. Click **Create Bucket**

### Step 1.2: Generate API Token
1. Go to **Account Settings** → **API Tokens**
2. Click **Create Token**
3. Select **Custom Token**
4. Name it: `VaRoom Video Upload`
5. Set permissions:
   - Account → R2 → Read & Write
6. Set TTL: No expiration (or as needed)
7. Click **Continue to Summary**
8. Click **Create Token**
9. **SAVE THESE IMMEDIATELY**:
   - Access Key ID
   - Secret Access Key

### Step 1.3: Get Account ID
1. In R2 dashboard, click on your bucket name
2. Look for **Account ID** in the bucket details
3. Save it (you'll need it for R2_ACCOUNT_ID)

### Step 1.4: Configure CORS (Optional but Recommended)
If you want direct browser uploads (future feature):
1. Go to R2 bucket settings
2. Find **CORS Rules**
3. Add rule with:
   ```json
   {
     "allowedOrigins": ["https://yourdomain.com"],
     "allowedMethods": ["GET", "PUT", "POST", "DELETE"],
     "allowedHeaders": ["*"]
   }
   ```

### Step 1.5: (Optional) Set Lifecycle Policy
To auto-clean soft-deleted objects after X days:
1. Go to bucket settings
2. Find **Lifecycle Rules**
3. Create rule to delete objects matching `videos/production/**/deleted/` after 30 days

---

## 2. ENVIRONMENT VARIABLES (.env)

### Step 2.1: Create/Update server/.env

If you don't have a `server/.env` file yet:
```bash
cp server/.env.example server/.env
```

Then edit `server/.env` with your actual values.

### Step 2.2: Add R2 Credentials

```env
# ============================================================
# Cloudflare R2 Configuration (Required)
# ============================================================
R2_ACCOUNT_ID=your_account_id_here
R2_BUCKET_NAME=varoom-videos-prod
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_ENDPOINT=https://r2.cloudflarestorage.com

# For custom domain (optional):
# R2_CUSTOM_DOMAIN=https://cdn.yourdomain.com
```

**Getting these values:**
- `R2_ACCOUNT_ID`: From Cloudflare R2 dashboard → Click bucket → Account ID
- `R2_BUCKET_NAME`: Name you created (e.g., `varoom-videos-prod`)
- `R2_ACCESS_KEY_ID`: From API token creation step
- `R2_SECRET_ACCESS_KEY`: From API token creation step
- `R2_ENDPOINT`: Use `https://r2.cloudflarestorage.com` (or your custom domain)

### Step 2.3: Add Video Feature Flags

```env
# ============================================================
# Video Upload Feature Flags
# ============================================================

# Enable/disable video uploads entirely (without code change)
VIDEO_UPLOADS_ENABLED=true

# Require premium subscription to upload
# Set to 'false' during development (allows any user)
# Set to 'true' for production (premium only)
VIDEO_PREMIUM_REQUIRED=false

# File size limit (in MB)
VIDEO_MAX_FILE_SIZE_MB=500

# Maximum videos per property
VIDEO_MAX_COUNT_PER_PROPERTY=10

# Maximum video duration (in seconds)
VIDEO_MAX_DURATION_SECONDS=90

# Supported formats (comma-separated MIME types)
VIDEO_ALLOWED_FORMATS=video/mp4,video/quicktime,video/webm

# Cleanup job configuration
VIDEO_CLEANUP_GRACE_PERIOD_HOURS=1
VIDEO_CLEANUP_DRY_RUN=false

# Development mode logging
VIDEO_DEBUG_LOGGING=false
```

### Step 2.4: Verify Existing Env Vars

Make sure you already have (from prior setup):
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Node
NODE_ENV=development
PORT=3000
```

---

## 3. DATABASE CONFIGURATION

### Step 3.1: Apply Migration

You have two options:

**Option A: Using Supabase CLI**
```bash
cd server
supabase db push
```

**Option B: Manual SQL in Supabase Dashboard**
1. Go to **Supabase Dashboard** → Your project
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Paste contents from: `server/migrations/20260829_000003_property_media.sql`
5. Click **Run**
6. Verify: New `property_media` table appears in **Tables** section

### Step 3.2: Verify Table Creation

Run this query in Supabase SQL editor:
```sql
SELECT 
  table_name, 
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_name = 'property_media'
GROUP BY table_name;
```

Expected result: `property_media | 19` (19 columns)

### Step 3.3: Check Indexes

Run:
```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'property_media';
```

Should see 5 indexes created automatically.

### Step 3.4: Verify RLS (Row Level Security)

Check if RLS is needed:
```sql
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'property_media';
```

Current implementation: No RLS on table (backend verifies auth). You can add RLS later for additional security.

---

## 4. BACKEND CONFIGURATION

### Step 4.1: Install Dependencies

```bash
cd server
npm install
```

This installs the new `uuid@9.0.0` dependency plus all existing packages.

### Step 4.2: Verify Setup

Test database connection:
```bash
npm start
```

In another terminal:
```bash
curl -X GET http://localhost:3000/api/db-check
```

Expected response:
```json
{ "connected": true }
```

### Step 4.3: Test Video Routes

```bash
curl -X POST http://localhost:3000/api/properties/test-prop-id/videos/upload-init \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mimeType":"video/mp4","fileName":"test.mp4","fileSizeBytes":1000000}'
```

Expected response: Either success with upload authorization OR 401 (not authenticated).

---

## 5. FRONTEND CONFIGURATION

### Step 5.1: Include CSS & JS

In your property form page (e.g., `client/list.html`), add to `<head>`:
```html
<link rel="stylesheet" href="/js/varoom-video-uploader.css">
```

Add before closing `</body>`:
```html
<script src="/js/varoom-video-uploader.js"></script>
```

### Step 5.2: Create Uploader Instance

In your property form JavaScript (e.g., in the video upload section):

```javascript
// Initialize uploader
const videoUploader = new VaRoomVideoUploader('video-uploader-container', {
  propertyId: propertyId,  // Required: from your form
  accessToken: sessionToken,  // Required: Supabase JWT
  
  // Optional callbacks
  onProgress: (data) => {
    console.log(`Upload progress: ${data.percentComplete}%`);
    // Update your UI progress bar
  },
  
  onSuccess: (data) => {
    console.log('Video uploaded:', data.mediaId);
    // Add to your media list
    loadPropertyMedia(propertyId);
  },
  
  onError: (data) => {
    console.error('Upload failed:', data.errorMessage);
    // Show error toast to user
    showErrorNotification(data.errorMessage);
  }
});
```

### Step 5.3: HTML Container

Make sure you have a container div in your form:
```html
<div id="video-uploader-container" class="video-uploader-section">
  <!-- Component will render here -->
</div>
```

### Step 5.4: Styling Integration

The uploader comes with built-in CSS, but you may want to customize:

```css
/* Optional: Override colors to match your theme */
:root {
  --varoom-primary: #6366f1;      /* Your primary color */
  --varoom-success: #10b981;       /* Success green */
  --varoom-error: #ef4444;         /* Error red */
  --varoom-dark-bg: #1f2937;       /* Dark background */
}
```

---

## 6. FEATURE FLAGS (DEVELOPMENT vs PRODUCTION)

### Development Mode Setup
```env
VIDEO_UPLOADS_ENABLED=true
VIDEO_PREMIUM_REQUIRED=false
VIDEO_DEBUG_LOGGING=true
VIDEO_MAX_FILE_SIZE_MB=500
```

**Behavior:**
- ✅ Any authenticated user can upload
- ✅ Detailed logging for debugging
- ✅ Larger test file sizes allowed

### Production Mode Setup
```env
VIDEO_UPLOADS_ENABLED=true
VIDEO_PREMIUM_REQUIRED=true
VIDEO_DEBUG_LOGGING=false
VIDEO_MAX_FILE_SIZE_MB=250
```

**Behavior:**
- ✅ Only premium users can upload
- ✅ Minimal logging for performance
- ✅ Stricter file size limits
- ✅ Premium check enforced on every request

### To Switch Between Modes
1. Edit `server/.env`
2. Change `VIDEO_PREMIUM_REQUIRED` value
3. Restart server: `npm start`
4. No code changes needed!

---

## 7. OPTIONAL CONFIGURATIONS

### 7.1: Custom R2 Domain

For better performance, configure a custom domain:

```env
R2_CUSTOM_DOMAIN=https://videos.yourdomain.com
```

Then in Cloudflare:
1. Create CNAME record: `videos.yourdomain.com` → `bucket.ACCOUNT_ID.r2.cloudflarestorage.com`
2. In R2 bucket settings, add custom domain binding

### 7.2: Storage Quotas

To enforce per-user storage limits (future feature):
```env
VIDEO_STORAGE_QUOTA_GB_FREE=10
VIDEO_STORAGE_QUOTA_GB_PREMIUM=100
```

### 7.3: Rate Limiting

To prevent abuse (future feature):
```env
VIDEO_RATE_LIMIT_UPLOADS_PER_HOUR=10
VIDEO_RATE_LIMIT_BANDWIDTH_MBPS=100
```

### 7.4: Logging & Monitoring

```env
# Sentry (error tracking)
SENTRY_DSN=https://...

# Custom logging
LOG_LEVEL=info
LOG_TO_FILE=false
LOG_FILE_PATH=./logs/video-upload.log
```

---

## 8. CLEANUP JOB CONFIGURATION

### Option A: Node Cron (Built-in)

In your `server/server.js` or a scheduled task file:

```javascript
const cron = require('node-cron');
const { runFullCleanup } = require('./lib/videoCleanup');

// Run every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Starting video cleanup job...');
  try {
    const result = await runFullCleanup();
    console.log('Cleanup complete:', result);
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
});
```

First install cron:
```bash
npm install node-cron
```

### Option B: AWS Lambda (Serverless)

Create `lambda/cleanup.js`:
```javascript
const { runFullCleanup } = require('../server/lib/videoCleanup');

exports.handler = async (event) => {
  try {
    const result = await runFullCleanup();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
```

Then create CloudWatch event to trigger every 6 hours.

### Option C: Azure Functions

```javascript
module.exports = async function (context, timer) {
  const { runFullCleanup } = require('../lib/videoCleanup');
  
  try {
    const result = await runFullCleanup();
    context.log('Cleanup result:', result);
  } catch (error) {
    context.log.error('Cleanup failed:', error);
  }
};
```

### Option D: Manual Cleanup (During Development)

```bash
# In server directory
node -e "require('./lib/videoCleanup').runFullCleanup().then(console.log).catch(console.error)"
```

### Cleanup Configuration

```env
# Grace period before deleting orphaned objects (hours)
VIDEO_CLEANUP_GRACE_PERIOD_HOURS=1

# Test mode - don't actually delete anything
VIDEO_CLEANUP_DRY_RUN=true

# Cleanup log level
VIDEO_CLEANUP_LOG_LEVEL=info
```

---

## 9. SECURITY CONFIGURATIONS

### 9.1: HTTPS/SSL

Ensure your app uses HTTPS in production:

```env
NODE_ENV=production
FORCE_HTTPS=true
```

### 9.2: CORS Configuration

If needed in `server/server.js`:
```javascript
const cors = require('cors');

app.use(cors({
  origin: ['https://yourdomain.com', 'https://www.yourdomain.com'],
  credentials: true
}));
```

### 9.3: Rate Limiting

Add rate limiting to upload endpoint:
```javascript
const rateLimit = require('express-rate-limit');

const videoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many upload attempts'
});

app.post('/api/properties/:propertyId/videos/upload-init', 
  videoLimiter, 
  videoRoutes);
```

### 9.4: Secrets Management

Never commit credentials to git:
```bash
# In .gitignore
server/.env
.env.local
.env.*.local
```

Verify it's already there:
```bash
cat server/.gitignore | grep ".env"
```

---

## 10. CONFIGURATION CHECKLIST

### Before Development
- [ ] Cloudflare R2 bucket created
- [ ] R2 API token generated
- [ ] R2 credentials saved securely
- [ ] `server/.env` created with R2 credentials
- [ ] `VIDEO_UPLOADS_ENABLED=true` set
- [ ] `VIDEO_PREMIUM_REQUIRED=false` set (for dev)
- [ ] Database migration applied
- [ ] `npm install` completed
- [ ] Backend starts without errors
- [ ] Frontend files included in HTML

### Before Production
- [ ] All dev configurations reviewed
- [ ] R2 production bucket created
- [ ] R2 custom domain configured (optional)
- [ ] `VIDEO_PREMIUM_REQUIRED=true` set
- [ ] Database backed up
- [ ] Cleanup job scheduled
- [ ] Error monitoring configured (Sentry, etc.)
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] Logging configured
- [ ] Tested complete upload flow
- [ ] Tested playback authorization
- [ ] Tested deletion flow
- [ ] Performance tested with concurrent uploads
- [ ] Security audit completed

---

## 11. ENVIRONMENT VARIABLES SUMMARY

| Variable | Required | Default | Example | Purpose |
|----------|----------|---------|---------|---------|
| `R2_ACCOUNT_ID` | ✅ Yes | - | `abc123` | Cloudflare account ID |
| `R2_BUCKET_NAME` | ✅ Yes | - | `varoom-videos-prod` | R2 bucket name |
| `R2_ACCESS_KEY_ID` | ✅ Yes | - | `abc123xyz` | R2 API access key |
| `R2_SECRET_ACCESS_KEY` | ✅ Yes | - | `secret123` | R2 API secret key |
| `R2_ENDPOINT` | ✅ Yes | - | `https://r2.cloudflarestorage.com` | R2 endpoint |
| `VIDEO_UPLOADS_ENABLED` | ✅ Yes | `true` | `true` | Enable/disable uploads |
| `VIDEO_PREMIUM_REQUIRED` | ✅ Yes | `false` | `false` | Require premium tier |
| `VIDEO_MAX_FILE_SIZE_MB` | ❌ No | `500` | `250` | Max file size |
| `VIDEO_MAX_COUNT_PER_PROPERTY` | ❌ No | `10` | `5` | Videos per property |
| `VIDEO_MAX_DURATION_SECONDS` | ❌ No | `3600` | `1800` | Max duration |
| `VIDEO_ALLOWED_FORMATS` | ❌ No | `video/mp4` | `video/mp4,video/webm` | MIME types |
| `VIDEO_CLEANUP_GRACE_PERIOD_HOURS` | ❌ No | `1` | `24` | Delete grace period |
| `VIDEO_CLEANUP_DRY_RUN` | ❌ No | `false` | `true` | Test cleanup |
| `VIDEO_DEBUG_LOGGING` | ❌ No | `false` | `true` | Debug mode |

---

## 12. TROUBLESHOOTING CONFIGURATIONS

### Issue: "R2 credentials are invalid"
**Check:**
- `R2_ACCESS_KEY_ID` is correct
- `R2_SECRET_ACCESS_KEY` is correct (no typos, no extra spaces)
- API token hasn't expired
- API token has R2 read/write permissions

### Issue: "Cannot connect to database"
**Check:**
- `SUPABASE_URL` is correct
- `SUPABASE_SERVICE_ROLE_KEY` is correct
- Supabase project is not paused
- Network can reach Supabase

### Issue: "Videos upload but don't appear in R2"
**Check:**
- `R2_BUCKET_NAME` is correct
- R2 CORS policy is configured (if using presigned URLs)
- Storage provider is actually set to `r2` in property_media table
- Upload-init endpoint returns proper authorization

### Issue: "Cleanup job doesn't run"
**Check:**
- Cleanup job is actually scheduled (cron/Lambda/Azure)
- `VIDEO_CLEANUP_GRACE_PERIOD_HOURS` is set
- Server can connect to Supabase
- R2 credentials are valid
- Check logs for cleanup errors

---

## Getting Help

If you get stuck on any configuration:
1. Check `VIDEO_UPLOAD_IMPLEMENTATION.md` for technical details
2. Review `README_VIDEO_UPLOAD.md` for quick start
3. Check the backend logs: `npm start` in server directory
4. Test R2 credentials with curl:
   ```bash
   curl -X GET https://ACCOUNT_ID.r2.cloudflarestorage.com/varoom-videos-prod
   ```
5. Test Supabase connection:
   ```bash
   curl -X GET https://your-project.supabase.co/rest/v1/property_media \
     -H "Authorization: Bearer YOUR_ANON_KEY"
   ```

---

**Remember:** Never commit `server/.env` to git. Use `.env.example` for template.
