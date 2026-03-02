# Equilibrium

Next.js app for collaborative video transcription and tagging (sessions, tags, sections).

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- (Optional) Digital Ocean Spaces or S3 for uploads; AssemblyAI for transcription

### Environment

Copy `.env.example` to `.env.local` and set at least:

- `DATABASE_URL` – PostgreSQL connection string
- (Optional) `DO_SPACES_*` or S3 vars for file storage
- (Optional) `ASSEMBLYAI_API_KEY` for transcription

### Install and run

```bash
npm install
npm run dev
```

- App: [http://localhost:5006](http://localhost:5006)
- Build: `npm run build`
- Start (prod): `npm run start` (port 8006)

After schema changes, run `npx prisma generate` (or rely on `postinstall`).

### Tests

```bash
npm run test
```

## Project layout

- **`src/app/api/`** – REST API routes (folders, videos, transcriptions, tags, speakers, sections, upload, etc.)
- **`src/lib/`** – Shared code: Prisma client, errors, logger, API helpers
- **`src/modules/`** – Feature UI: sessions (tagging), recordings, auto/manual transcription
- **`src/context/`** – React context (e.g. session/upload state)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a short architecture overview and conventions.

## Docs

- [ERROR_HANDLING.md](./ERROR_HANDLING.md) – Error classes and API error handling
- [CORS_SETUP.md](./CORS_SETUP.md) – CORS configuration
- [ARCHITECTURE.md](./ARCHITECTURE.md) – Stack, structure, API and data model overview
