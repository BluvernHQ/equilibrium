# Digital Ocean Spaces CORS Configuration Guide

## Problems
1. **Video playback** – Videos cannot be played in the browser due to CORS restrictions.
2. **Direct upload** – Uploads fail with "Network error during upload" because the bucket must allow **PUT** from your app origin.

## Solution
Configure CORS on your Digital Ocean Spaces bucket to allow both **playback (GET/HEAD)** and **direct upload (PUT)** from your application domain.

## Step-by-Step Instructions

### 1. Access Digital Ocean Spaces Dashboard
1. Log in to your Digital Ocean account
2. Navigate to **Spaces** in the left sidebar
3. Click on your bucket name (`hiffi`)

### 2. Configure CORS
1. Click on the **Settings** tab
2. Scroll down to **CORS Configurations**
3. Click **Add** to open the **Advanced CORS Options** form

### 3. Add CORS rule (Control Panel form)
In the form, set:

| Field | Value |
|-------|--------|
| **Origin** | Your app URL(s), one per line or as needed. For your current error use exactly: `http://38.242.148.246:5006`. Add e.g. `http://localhost:3000`, `http://localhost:5006` for local dev. |
| **Allowed Methods** | Enable **GET**, **HEAD**, and **PUT** (PUT is required for direct upload). |
| **Allowed Headers** | `*` (or list any custom headers your app sends). |
| **Access Control Max Age** | e.g. `3600` (optional). |

- **PUT** is required for direct uploads (browser uploads files straight to Spaces). Without it you get "Network error during upload" / CORS blocked.
- **Origin** must match exactly (protocol + host + port), e.g. `http://38.242.148.246:5006`.

**Reference (same rule as JSON for other tools):**

```json
{
  "AllowedOrigins": ["http://38.242.148.246:5006", "http://localhost:3000", "http://localhost:5006"],
  "AllowedMethods": ["GET", "HEAD", "PUT"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag", "Content-Length", "Content-Type", "Content-Range"],
  "MaxAgeSeconds": 3600
}
```

### 4. Save Configuration
1. Click **Save** or **Update**
2. Wait a few moments for the changes to propagate

### 5. Test
1. Refresh your application page
2. Try playing the video again
3. The video should now play without CORS errors

## Important Notes

- **AllowedOrigins**: Must include your exact app URL (protocol + host + port), e.g. `http://38.242.148.246:5006`
- **AllowedMethods**: `GET` and `HEAD` for playback; **`PUT` for direct upload** (required for large files)
- **AllowedHeaders**: `*` allows all headers (e.g. `Content-Type` for PUT)
- **ExposeHeaders**: Important for video seeking/range requests
- **MaxAgeSeconds**: How long browsers cache the CORS preflight response (3600 = 1 hour)

## Troubleshooting

### Video still not playing after CORS configuration:
1. **Clear browser cache** - CORS settings are cached
2. **Check browser console** - Look for specific CORS error messages
3. **Verify domain matches exactly** - `http://localhost:3000` is different from `http://localhost:3000/`
4. **Wait a few minutes** - CORS changes can take a few minutes to propagate
5. **Check presigned URL expiration** - Presigned URLs expire after 1 hour

### Common Issues:
- **"No 'Access-Control-Allow-Origin' header"**: CORS not configured or your app URL not in AllowedOrigins
- **"Method not allowed"**: Add `GET`, `HEAD`, and **`PUT`** (for uploads) to AllowedMethods
- **"Network error during upload"**: Usually CORS – add **PUT** to AllowedMethods and your app origin (e.g. `http://38.242.148.246:5006`) to AllowedOrigins, then save and retry
- **"Header not allowed"**: Add required headers to AllowedHeaders or use `*`

### If the Control Panel doesn’t fix it (s3cmd + XML)
DigitalOcean supports full CORS via an XML file. Create `cors.xml`:

```xml
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>http://38.242.148.246:5006</AllowedOrigin>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>http://localhost:5006</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <AllowedHeader>*</AllowedHeader>
  </CORSRule>
</CORSConfiguration>
```

Then run (replace bucket/region with yours):

```bash
s3cmd setcors cors.xml s3://hiffi
```

See [DigitalOcean: Configure CORS](https://docs.digitalocean.com/products/spaces/how-to/configure-cors) and their s3cmd setup if needed.

## Alternative: Public Bucket (Not Recommended)
If you make your bucket public, CORS is not required, but this is **not recommended** for security reasons as it exposes all your files publicly.

