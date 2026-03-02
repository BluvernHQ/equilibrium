# Architecture Overview

## Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, Tailwind CSS 4, Framer Motion
- **Data:** Prisma 7, PostgreSQL (with `@prisma/adapter-pg` + `pg` pool)
- **Storage:** AWS S3–compatible (e.g. Digital Ocean Spaces)
- **Transcription:** AssemblyAI

## Project Structure

```
src/
├── app/
│   ├── (routes)/(main-layout)/   # Main app layout with sidebar
│   │   ├── project/[folderId]/   # Project (folder) view
│   │   ├── transcription/[videoId]/
│   │   ├── sessions/             # Tagging / sessions UI
│   │   ├── recordings/            # Video list & upload
│   │   ├── auto-transcription/
│   │   └── manual-transcription/
│   ├── api/                      # API routes (REST)
│   │   ├── folders/
│   │   ├── videos/
│   │   ├── transcriptions/
│   │   ├── tags/                 # Master/Primary/Secondary/Branch, impressions
│   │   ├── speakers/
│   │   ├── sections/
│   │   ├── subsections/
│   │   ├── upload/
│   │   ├── transcribe/
│   │   └── health/
│   └── layout.tsx
├── lib/                          # Shared utilities
│   ├── prisma.ts                 # Prisma client (singleton, pg adapter)
│   ├── errors.ts                 # AppError, handleError, ErrorCode
│   ├── api-utils.ts              # apiHandler, validateRequiredFields, parseJsonBody
│   └── logger.ts                 # Structured JSON logging
├── context/
│   └── SessionContext.tsx        # Upload + transcription session state
├── modules/                      # Feature modules
│   ├── sessions/                 # Tagging UI (sessions.tsx + tag-hierarchy, etc.)
│   ├── recordings/
│   ├── auto-transcription/
│   └── manual-transcription/
├── components/                   # Shared UI (Sidebar, UploadArea, etc.)
└── generated/
    └── prisma/                   # Generated Prisma client (output in schema)
```

## API Conventions

- **Error handling:** Use `handleError()` in catch blocks and throw `ValidationError`, `NotFoundError`, `ConflictError` from `@/lib/errors` where appropriate. Prefer `apiHandler(handler)` so all routes get request/response logging and centralized error handling.
- **Logging:** Use `logger` from `@/lib/logger` instead of `console.*`.
- **Responses:** Success: `{ success: true, ...data }`. Errors: use the JSON shape from `AppError.toJSON()` (see `ERROR_HANDLING.md`).

## Data Model (high level)

- **Folder:** Tree of project folders; can contain `Video` and legacy `sessions`.
- **Video:** Source (YouTube, S3, upload, URL), optional file key/URL; has many `Transcript`, `Speaker`.
- **Transcript:** Versioned, immutable; has `TranscriptBlock[]`, `Section[]`, `TagImpression[]`.
- **Tag system:** `MasterTag` → `PrimaryTag` → `SecondaryTag`; `BranchTag` per master; `TagImpression` links transcript blocks to tags (with selection ranges).
- **Legacy:** `sessions`, `master_tags`, `primary_tags`, etc. still exist for backward compatibility; new features use `Video` / `Transcript` / `MasterTag` / `TagImpression`.

## Key Docs

- `ERROR_HANDLING.md` – Error classes and usage.
- `CORS_SETUP.md` – CORS configuration.
- `prisma/schema.prisma` – Full schema and comments.
