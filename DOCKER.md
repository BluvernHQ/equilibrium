# Docker Setup Guide

This guide explains how to build and run the Equilibrium application using Docker.

## Prerequisites

- Docker installed ([Get Docker](https://docs.docker.com/get-docker/))
- Docker Compose installed (usually included with Docker Desktop)
- Environment variables configured (see `.env.local`)

## Quick Start

### Production Build

1. **Build the Docker image:**
   ```bash
   docker build -t equilibrium:latest .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name equilibrium-app \
     -p 5006:5006 \
     --env-file .env.local \
     equilibrium:latest
   ```

### Using Docker Compose (Recommended)

1. **Create `.env.local` file** (if not exists) with required environment variables:
   ```env
   DATABASE_URL=postgresql://user:password@host:5432/dbname
   NEXT_PUBLIC_APP_URL=http://localhost:5006
   # Add other required env vars
   ```

2. **Start the application:**
   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f app
   ```

4. **Stop the application:**
   ```bash
   docker-compose down
   ```

## Development Mode

For local development with hot reload:

```bash
docker-compose -f docker-compose.dev.yml up
```

This will:
- Mount your local code for hot reload
- Run in development mode
- Expose port 5006

## Database Migrations

Before running the application, ensure database migrations are applied:

### Option 1: Run migrations inside container
```bash
docker-compose exec app npx prisma migrate deploy
```

### Option 2: Run migrations locally before building
```bash
npx prisma migrate deploy
```

### Option 3: Add migration step to Dockerfile (for production)
You can add this to the Dockerfile before the CMD:
```dockerfile
RUN npx prisma migrate deploy
```

## Building for Production

### Build Arguments

You can customize the build:

```bash
docker build \
  --build-arg NODE_ENV=production \
  -t equilibrium:latest .
```

### Multi-platform Build

Build for multiple architectures:

```bash
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t equilibrium:latest .
```

## Environment Variables

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `NEXT_PUBLIC_APP_URL` - Public URL of the application (optional, defaults to http://localhost:5006)

Optional environment variables (depending on features used):

- `AWS_ACCESS_KEY_ID` - AWS S3 access key
- `AWS_SECRET_ACCESS_KEY` - AWS S3 secret key
- `AWS_REGION` - AWS region
- `ASSEMBLYAI_API_KEY` - AssemblyAI API key for transcription
- Other service-specific keys

## Docker Image Structure

The Dockerfile uses a multi-stage build:

1. **deps stage**: Installs dependencies
2. **builder stage**: Builds the Next.js application
3. **runner stage**: Creates minimal production image

## Health Checks

The docker-compose.yml includes a health check. To add a health endpoint:

Create `src/app/api/health/route.ts`:
```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

## Troubleshooting

### Container won't start

1. Check logs:
   ```bash
   docker-compose logs app
   ```

2. Verify environment variables:
   ```bash
   docker-compose exec app env
   ```

3. Check database connection:
   ```bash
   docker-compose exec app npx prisma db pull
   ```

### Prisma Client not found

Ensure Prisma Client is generated:
```bash
docker-compose exec app npx prisma generate
```

### Port already in use

Change the port mapping in docker-compose.yml:
```yaml
ports:
  - "3000:5006"  # Use port 3000 on host instead
```

### Build fails

1. Clear Docker cache:
   ```bash
   docker builder prune
   ```

2. Rebuild without cache:
   ```bash
   docker build --no-cache -t equilibrium:latest .
   ```

## Production Deployment

### Deploy to Server

1. **Copy files to server:**
   ```bash
   scp -r . user@server:/path/to/app
   ```

2. **SSH into server:**
   ```bash
   ssh user@server
   ```

3. **Build and run:**
   ```bash
   cd /path/to/app
   docker-compose up -d --build
   ```

### Using Docker Registry

1. **Tag image:**
   ```bash
   docker tag equilibrium:latest your-registry/equilibrium:latest
   ```

2. **Push to registry:**
   ```bash
   docker push your-registry/equilibrium:latest
   ```

3. **Pull and run on server:**
   ```bash
   docker pull your-registry/equilibrium:latest
   docker run -d -p 5006:5006 --env-file .env.local your-registry/equilibrium:latest
   ```

## Security Best Practices

1. **Never commit `.env.local`** - Use environment variables or secrets management
2. **Use non-root user** - The Dockerfile already uses `nextjs` user
3. **Keep images updated** - Regularly update base images
4. **Scan for vulnerabilities:**
   ```bash
   docker scan equilibrium:latest
   ```
5. **Use secrets management** - Consider Docker secrets or external secret managers

## Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Next.js Docker Documentation](https://nextjs.org/docs/deployment#docker-image)
- [Prisma Docker Guide](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker)

