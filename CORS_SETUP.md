# Digital Ocean Spaces CORS Configuration Guide

## Problem
Videos stored in Digital Ocean Spaces cannot be played in the browser due to CORS (Cross-Origin Resource Sharing) restrictions.

## Solution
Configure CORS on your Digital Ocean Spaces bucket to allow video playback from your application domain.

## Step-by-Step Instructions

### 1. Access Digital Ocean Spaces Dashboard
1. Log in to your Digital Ocean account
2. Navigate to **Spaces** in the left sidebar
3. Click on your bucket name (`hiffi`)

### 2. Configure CORS
1. Click on the **Settings** tab
2. Scroll down to **CORS Configuration**
3. Click **Edit** or **Add CORS Rule**

### 3. Add CORS Rule
Add the following CORS configuration:

**For Development (localhost):**
```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type",
      "Content-Range"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

**For Production (add your production domain):**
```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://your-production-domain.com"
    ],
    "AllowedMethods": [
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Type",
      "Content-Range"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. Save Configuration
1. Click **Save** or **Update**
2. Wait a few moments for the changes to propagate

### 5. Test
1. Refresh your application page
2. Try playing the video again
3. The video should now play without CORS errors

## Important Notes

- **AllowedOrigins**: Must include your exact domain (including protocol and port for localhost)
- **AllowedMethods**: `GET` and `HEAD` are required for video playback
- **AllowedHeaders**: `*` allows all headers, or you can specify: `Range`, `Content-Type`, etc.
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
- **"No 'Access-Control-Allow-Origin' header"**: CORS not configured or domain not in AllowedOrigins
- **"Method not allowed"**: Add `GET` and `HEAD` to AllowedMethods
- **"Header not allowed"**: Add required headers to AllowedHeaders or use `*`

## Alternative: Public Bucket (Not Recommended)
If you make your bucket public, CORS is not required, but this is **not recommended** for security reasons as it exposes all your files publicly.

