# Upload size and limits

## How uploads work (direct to storage)

Uploads use **direct-to-Storage** (presigned URL): the browser gets a signed PUT URL from `POST /api/upload/presign`, then uploads the file **directly to DigitalOcean Spaces**. The file never goes through your app server, so:

- **No server or proxy body limit** – only the 500 MB app limit applies.
- **No server timeout** – the server only issues the presign (fast).
- **Real progress** – the upload card shows actual upload progress.
- **Client timeout** – the browser aborts after **30 minutes** if the upload is still in progress.

## App limit

- **Maximum file size:** **500 MB** per file.
- Enforced in `src/app/api/upload/presign/route.ts` and `src/app/api/upload/route.ts`. Larger files get a clear validation error.

## Client-side timeout

- The browser aborts the direct upload after **30 minutes** (`SessionContext.tsx`). If the upload doesn’t finish in time, the upload card shows **Failed** with: *"Upload timed out. Try a faster connection or smaller file."*

## CORS required (direct upload)

Direct upload sends the file from the browser to DigitalOcean Spaces. The bucket must allow your app’s origin and **PUT** via CORS. If CORS is missing or wrong you get:

- **Console:** `Access to XMLHttpRequest at '...' from origin '...' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header`
- **UI:** “Network error during upload”

**Fix:** Configure CORS on the Spaces bucket so that:

1. **Origin** includes your app URL exactly, e.g. `http://38.242.148.246:5006`
2. **Allowed methods** include **PUT** (and GET/HEAD for playback)

Step-by-step and example config: **[CORS_SETUP.md](./CORS_SETUP.md)**.

## Legacy proxy/server limits (no longer relevant for upload body)

- The old flow (file through the server) is no longer used. If you still have a proxy in front, it does **not** need to allow a large body for uploads, because the file is sent directly to Spaces.

## Summary

| Limit          | Value    | Where it’s set / enforced                    |
|----------------|----------|----------------------------------------------|
| Max file size  | 500 MB   | `api/upload/presign` and `api/upload`       |
| Client timeout | 30 min   | `SessionContext.tsx` (direct upload abort)   |
