# Performance improvements (Recordings / Homepage)

## Current bottlenecks

1. **Homepage (root):** Only `GET /api/folders?parentId=root` runs. If this feels slow, the DB query (with `_count` for videos, sessions, children) or network latency may be the cause.

2. **Folder view (files loading slowly):** When opening a project folder, the app:
   - Calls `GET /api/videos` — lists all objects in S3 and **generates a presigned URL for every file** (N round-trips to S3). With many files this dominates load time.
   - Calls `GET /api/videos/db?folderId=...` — Prisma query for that folder’s videos.
   - Previously these ran **one after the other**. They now run **in parallel** (see below).

3. **No caching:** Every navigation refetches; no shared cache for folders or video list.

---

## Changes already made

### 1. Parallel fetches in Recordings

- **Videos:** `fetchVideos()` now runs `/api/videos` and `/api/videos/db` in parallel via `Promise.all()`, so total wait is ~max(spaces, db) instead of spaces + db.
- **Folder view:** When navigating into a project, folder breadcrumb (`GET /api/folders/[id]`) and `fetchVideos()` run in parallel so the folder name and file list can appear together sooner.

### 2. Optional fast list (no presigning) for videos API

- **`GET /api/videos?presign=false`**  
  Returns the same list shape but with `url: null` for each item. The handler only does S3 `ListObjectsV2` + filter (no presigning), so response time stays low even with many files.

- **On-demand presigned URL:**  
  **`GET /api/videos/[key]`** (existing) returns `{ success, url }` for a single key. Use this when the user needs a URL (play, download, copy link).

To make the folder view faster without changing UX:

- In Recordings, call **`/api/videos?presign=false`** instead of `/api/videos` when loading the list.
- When the user opens a video (play, view, copy URL), call **`/api/videos/${encodeURIComponent(video.key)}`** once and cache the URL (e.g. in component state or a small `useVideoUrl(key)` hook).  
That way list load is one fast S3 list; presigning is done only for the files the user actually uses.

---

## Optional next steps (modular)

### 1. Recordings data layer and caching

- Move folder + video fetch (and merge) into a small module, e.g. `src/modules/recordings/data/recordings-api.ts`, and optionally a hook like `useRecordingsData(folderId)` that returns `{ folders, videos, loading, refetch }`.
- Add a cache (e.g. **SWR** or **TanStack Query**) in that layer so:
  - Folders for a given `parentId` are cached and reused.
  - Video list for a folder is cached until invalidated (e.g. after upload/move/delete).
- The Recordings UI stays the same; only the data layer is swapped to use the new hooks + cache.

### 2. Folders API

- Ensure DB has an index on `Folder.parent_id` (Prisma schema already has `@@index([parent_id])`).
- If the homepage still feels slow, consider:
  - Caching folder list for `parentId=root` (short TTL or invalidate on create/rename/move).
  - Or a dedicated lightweight endpoint that returns only `id`, `name`, `parent_id` and counts, without extra includes.

### 3. Videos DB API

- `/api/videos/db` already supports `includeTranscripts=false` and `includeBlocks=false` by default; keep those off for the list view.
- Ensure `folder_id` is indexed on `Video` (Prisma schema) so filtering by folder is cheap.

### 4. Presign-on-demand in Recordings (recommended)

- Switch list load to **`/api/videos?presign=false`**.
- Use **`/api/videos/[key]`** only when the user needs a URL; cache the result per key in state or a hook so each key is presigned at most once per session.

---

## Summary

| Area              | Change                                      | Status / next step                    |
|-------------------|---------------------------------------------|----------------------------------------|
| Folder + videos    | Parallel fetch (videos + db; folder + list) | Done                                   |
| Video list API    | `?presign=false` + on-demand `/api/videos/[key]` | API ready; Recordings can adopt when needed |
| Caching           | SWR/React Query in a data hook              | Optional; add in recordings data layer |
| Folders API       | Indexes + optional cache                    | Verify indexes; add cache if needed    |

All changes are modular: parallel fetches and optional presign can be used independently; caching can be added in the data layer without changing the rest of the app.
