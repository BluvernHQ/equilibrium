# Database Setup Guide

This project uses Prisma with PostgreSQL to store video metadata and transcriptions.

## Prerequisites

- PostgreSQL database (local or cloud)
- Node.js and npm installed

## Setup Steps

### 1. Install Dependencies

Dependencies are already installed:
- `prisma` - Prisma CLI
- `@prisma/client` - Prisma Client

### 2. Configure Database Connection

Add your database URL to `.env.local`:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/eqilibrium_db?schema=public"
```

For cloud databases (e.g., Supabase, Neon, Railway):
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

**Important:** The `DATABASE_URL` is configured in `prisma.config.ts`, not in the schema file (Prisma 7 requirement).

### 3. Run Database Migrations

```bash
npx prisma migrate dev --name init
```

This will:
- Create the database tables (Video and Transcription)
- Generate Prisma Client
- Create migration files

**Note:** Make sure your PostgreSQL database is running before running migrations.

### 4. Generate Prisma Client

The client has been generated, but if you need to regenerate:

```bash
npx prisma generate
```

### 5. (Optional) View Database in Prisma Studio

```bash
npx prisma studio
```

## Database Schema

### Video Table
- `id` - UUID (Primary Key)
- `fileName` - Original filename
- `fileKey` - Digital Ocean Spaces key (unique)
- `fileUrl` - Public URL or presigned URL
- `fileSize` - File size in bytes
- `uploadedAt` - Upload timestamp
- `createdAt` - Record creation timestamp
- `updatedAt` - Last update timestamp

### Transcription Table
- `id` - UUID (Primary Key)
- `videoId` - Foreign key to Video
- `transcriptData` - JSON array of transcript entries
- `transcriptionType` - "auto" or "manual"
- `status` - "processing", "completed", or "failed"
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

## API Routes

### Video Routes
- `POST /api/videos/save` - Save video metadata to database
- `GET /api/videos/db` - Get all videos with transcription status

### Transcription Routes
- `POST /api/transcriptions/save` - Save transcription to database
- `GET /api/transcriptions/[videoId]` - Get transcription by video ID
- `GET /api/transcriptions/load/[videoId]` - Load transcription for a video

## Usage

1. When a video is uploaded, it's automatically saved to the database
2. When transcription completes, it's saved with the video ID
3. When viewing a video from recordings, existing transcriptions are loaded automatically
4. Recordings page shows which videos have transcriptions

