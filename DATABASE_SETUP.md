# Database Setup Guide

This project uses **Prisma** with **PostgreSQL** to store video metadata, transcriptions, tags, and session data.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Database Options](#database-options)
- [Environment Configuration](#environment-configuration)
- [Initial Setup](#initial-setup)
- [Database Migrations](#database-migrations)
- [Database Schema Overview](#database-schema-overview)
- [Post-Installation Verification](#post-installation-verification)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

---

## Prerequisites

Before setting up the database, ensure you have:

- **Node.js** (v18 or higher) and **npm** installed
- **PostgreSQL** database (local installation or cloud provider account)
- Git repository cloned locally
- Basic understanding of SQL databases

---

## Database Options

### Option 1: Local PostgreSQL Installation

**macOS (using Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
createdb equilibrium_db
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo -u postgres createdb equilibrium_db
```

**Windows:**
1. Download PostgreSQL from [postgresql.org](https://www.postgresql.org/download/windows/)
2. Install with default settings
3. Create database using pgAdmin or command line:
```sql
CREATE DATABASE equilibrium_db;
```

### Option 2: Cloud Database Providers

#### Supabase (Recommended for Development)
1. Sign up at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Project Settings → Database
4. Copy the connection string (it will look like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```

#### Neon (Serverless PostgreSQL)
1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from the dashboard

#### Railway
1. Sign up at [railway.app](https://railway.app)
2. Create a new PostgreSQL service
3. Copy the connection string from the service settings

#### DigitalOcean Managed Database
1. Create a PostgreSQL database in DigitalOcean
2. Copy the connection string from the database settings

---

## Environment Configuration

### Step 1: Create Environment File

Create a `.env.local` file in the project root (if it doesn't exist):

```bash
touch .env.local
```

### Step 2: Configure Database URL

Add your database connection string to `.env.local`:

**Local PostgreSQL:**
```env
DATABASE_URL="postgresql://username:password@localhost:5432/equilibrium_db?schema=public"
```

**Cloud Database (with SSL):**
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

**Example (Supabase):**
```env
DATABASE_URL="postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require"
```

**Example (Neon):**
```env
DATABASE_URL="postgresql://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

### Step 3: Verify Environment File

The project uses `prisma.config.ts` which automatically loads:
1. `.env.local` (takes precedence)
2. `.env` (fallback)

**Important:** Never commit `.env.local` to version control. It's already in `.gitignore`.

---

## Initial Setup

### Step 1: Install Dependencies

```bash
npm install
```

This will automatically:
- Install all npm packages including `prisma` and `@prisma/client`
- Run `postinstall` script which generates Prisma Client

### Step 2: Verify Prisma Configuration

The project uses Prisma 7 with a custom configuration file (`prisma.config.ts`). Verify it exists:

```bash
ls prisma.config.ts
```

### Step 3: Generate Prisma Client

```bash
npx prisma generate
```

This creates the Prisma Client based on your schema.

### Step 4: Verify Database Connection

Test your database connection:

```bash
npx prisma db pull
```

If successful, you'll see: `Introspection completed successfully`

---

## Database Migrations

### Understanding Migrations

The project uses Prisma migrations to manage database schema changes. Migration files are stored in `prisma/migrations/`.

### Apply Existing Migrations

If you're cloning the repository, apply all existing migrations:

```bash
npx prisma migrate deploy
```

This will apply all migrations in order:
1. `20251226072804_init` - Initial schema
2. `20260104150458_add_speaker_model` - Speaker model
3. `20260108061458_remove_master_tag_name_unique` - Remove unique constraint

### Development Workflow

**For new schema changes:**

1. Edit `prisma/schema.prisma`
2. Create a migration:
   ```bash
   npx prisma migrate dev --name descriptive_migration_name
   ```
3. This will:
   - Create migration SQL files
   - Apply migration to database
   - Regenerate Prisma Client

**For production deployments:**

```bash
npx prisma migrate deploy
```

### Reset Database (Development Only)

⚠️ **Warning:** This will delete all data!

```bash
npx prisma migrate reset
```

---

## Database Schema Overview

The database consists of several main model groups:

### Core Models

#### `Video`
Stores video metadata and source information.
- Supports multiple sources: YouTube, S3, local upload, external URL
- Tracks file metadata (size, key, URL)
- Related to: `Transcript`, `Speaker`

#### `Transcript`
Immutable transcript storage with versioning.
- Links to `Video`
- Contains `TranscriptBlock[]` (atomic text blocks)
- Related to: `Section`, `TagImpression`

#### `TranscriptBlock`
Atomic blocks of transcript text.
- Contains speaker labels, timestamps, text content
- Ordered by `order_index`

#### `Section` & `Subsection`
Contextual organization of transcripts.
- Sections group blocks together
- Subsections nest within sections

### Tagging System

#### `MasterTag`
Top-level tags (e.g., "Topic", "Action Item").
- Has color, icon, description
- Can be closed/archived
- Related to: `PrimaryTag`, `BranchTag`, `TagImpression`

#### `BranchTag`
Branch tags under master tags (unique per master).
- Example: Master "Topic" → Branch "Technical"

#### `PrimaryTag`
Primary tags under master tags (duplicates allowed).
- Example: Master "Action Item" → Primary "Follow up"

#### `SecondaryTag`
Secondary tags under primary tags (duplicates allowed).
- Example: Primary "Follow up" → Secondary "Email"

#### `TagImpression`
The actual tagging instances linking tags to transcript blocks.
- Stores selected text and ranges
- Links to Master/Primary/Secondary tags
- Can have comments
- Optional section/subsection context

### Speaker Management

#### `Speaker`
Stores speaker information per video.
- Name, avatar, moderator status
- Links to `Video`
- Matches `TranscriptBlock.speaker_label`

### Legacy Models (Backward Compatibility)

- `sessions` - Legacy session storage
- `master_tags` - Legacy master tag model
- `primary_tags` - Legacy primary tag model
- `secondary_tags` - Legacy secondary tag model
- `tag_instances` - Legacy tag instance model
- `tag_cross_references` - Legacy cross-reference model

**Note:** These are kept for backward compatibility and should be migrated to new models over time.

---

## Post-Installation Verification

### Step 1: Open Prisma Studio

Visual database browser:

```bash
npx prisma studio
```

This opens a web interface at `http://localhost:5555` where you can:
- Browse all tables
- View and edit data
- Test queries

### Step 2: Verify Tables Created

In Prisma Studio or your database client, verify these tables exist:

**Core Tables:**
- `Video`
- `Transcript`
- `TranscriptBlock`
- `Section`
- `Subsection`
- `Speaker`

**Tagging Tables:**
- `MasterTag`
- `BranchTag`
- `PrimaryTag`
- `SecondaryTag`
- `TagImpression`

**Legacy Tables:**
- `sessions`
- `master_tags`
- `primary_tags`
- `secondary_tags`
- `tag_instances`
- `tag_cross_references`

### Step 3: Test Application

Start the development server:

```bash
npm run dev
```

Navigate to the application and test:
1. Upload a video
2. Create a transcription
3. Create tags
4. Verify data appears in Prisma Studio

---

## Troubleshooting

### Issue: "Can't reach database server"

**Solutions:**
1. Verify PostgreSQL is running:
   ```bash
   # macOS
   brew services list
   
   # Linux
   sudo systemctl status postgresql
   ```
2. Check connection string in `.env.local`
3. Verify database exists:
   ```bash
   psql -U username -l
   ```

### Issue: "Migration failed"

**Solutions:**
1. Check database permissions
2. Verify connection string is correct
3. Ensure database is empty or migrations are in sync:
   ```bash
   npx prisma migrate status
   ```
4. Reset if in development:
   ```bash
   npx prisma migrate reset
   ```

### Issue: "Prisma Client not generated"

**Solutions:**
1. Manually generate:
   ```bash
   npx prisma generate
   ```
2. Check `prisma/schema.prisma` for syntax errors
3. Verify Node.js version (requires v18+)

### Issue: "Environment variable not found"

**Solutions:**
1. Ensure `.env.local` exists in project root
2. Verify `DATABASE_URL` is set correctly
3. Check `prisma.config.ts` loads environment correctly
4. Restart your development server

### Issue: "Schema drift detected"

**Solutions:**
1. Pull current database schema:
   ```bash
   npx prisma db pull
   ```
2. Compare with `prisma/schema.prisma`
3. Create migration to sync:
   ```bash
   npx prisma migrate dev --name sync_schema
   ```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Database is provisioned and accessible
- [ ] `DATABASE_URL` is set in production environment variables
- [ ] SSL mode is enabled for cloud databases (`?sslmode=require`)
- [ ] Database backups are configured
- [ ] Connection pooling is configured (if using cloud provider)

### Deployment Steps

1. **Set Environment Variables**
   ```bash
   # In your hosting platform (Vercel, Railway, etc.)
   DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
   ```

2. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

3. **Generate Prisma Client**
   ```bash
   npx prisma generate
   ```

4. **Build Application**
   ```bash
   npm run build
   ```

### Connection Pooling

For production, use connection pooling:

**Supabase:**
- Use the pooler connection string (port 6543)
- Format: `postgresql://postgres.xxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

**Neon:**
- Automatically uses connection pooling
- Use the connection string from dashboard

**Other Providers:**
- Consider using PgBouncer or provider's pooling solution

### Database Backups

**Recommended Backup Strategy:**

1. **Automated Backups** (if using managed database):
   - Enable automated daily backups
   - Retain backups for 30 days minimum

2. **Manual Backups:**
   ```bash
   pg_dump -U username -d equilibrium_db > backup_$(date +%Y%m%d).sql
   ```

3. **Restore from Backup:**
   ```bash
   psql -U username -d equilibrium_db < backup_YYYYMMDD.sql
   ```

---

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Apply migrations
npx prisma migrate deploy

# Create new migration
npx prisma migrate dev --name migration_name

# Open Prisma Studio
npx prisma studio

# Check migration status
npx prisma migrate status

# Reset database (dev only)
npx prisma migrate reset

# Pull schema from database
npx prisma db pull

# Push schema to database (dev only)
npx prisma db push
```

---

## Support

If you encounter issues not covered in this guide:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review Prisma logs for detailed error messages
3. Verify your database connection and credentials
4. Ensure all migrations are applied

For schema-related questions, refer to `prisma/schema.prisma` for the complete data model definition.
