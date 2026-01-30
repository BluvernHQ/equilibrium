# Structured Error Handling Guide

This document describes the structured error handling system implemented in the codebase.

## Overview

The error handling system provides:
- **Consistent error types** with proper HTTP status codes
- **Structured logging** instead of console.log
- **Automatic error formatting** for API responses
- **Type-safe error handling** throughout the application

## Error Classes

### Base Error Classes

Located in `src/lib/errors.ts`:

- **`AppError`** - Base error class for all application errors
- **`ValidationError`** (400) - Input validation errors
- **`NotFoundError`** (404) - Resource not found errors
- **`ConflictError`** (409) - Duplicate resource errors
- **`DatabaseError`** (500) - Database operation errors
- **`ExternalServiceError`** (500) - External API/service errors
- **`FileUploadError`** (500) - File upload errors
- **`TranscriptionError`** (500) - Transcription service errors

### Error Codes

All errors have standardized error codes defined in `ErrorCode` enum:
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `DUPLICATE_RESOURCE`
- `DATABASE_ERROR`
- `EXTERNAL_SERVICE_ERROR`
- etc.

## Usage Examples

### Basic Error Handling

```typescript
import { NextRequest, NextResponse } from "next/server";
import {
    ValidationError,
    NotFoundError,
    handleError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        // Validate input
        if (!body.name) {
            throw new ValidationError("Name is required", {
                field: "name",
            });
        }
        
        // Check if resource exists
        const resource = await findResource(body.id);
        if (!resource) {
            throw new NotFoundError("Resource not found", "resource");
        }
        
        // ... process request
        
        return NextResponse.json({ success: true, data });
        
    } catch (error: unknown) {
        logger.error(
            "Operation failed",
            error instanceof Error ? error : new Error(String(error)),
            { endpoint: "/api/example" }
        );
        return handleError(error);
    }
}
```

### Using API Handler Wrapper

```typescript
import { apiHandler, validateRequiredFields, parseJsonBody } from "@/lib/api-utils";

export const POST = apiHandler(async (req: NextRequest) => {
    const body = await parseJsonBody(req);
    
    validateRequiredFields(body, ["name", "email"]);
    
    // ... process request
    
    return NextResponse.json({ success: true });
}, { method: "POST" });
```

### Structured Logging

```typescript
import { logger } from "@/lib/logger";

// Info log
logger.info("User logged in", { userId: user.id });

// Error log
logger.error("Database query failed", error, { query: "SELECT ..." });

// External service log
logger.externalService("AssemblyAI", "transcribe", { transcriptId: "..." });

// Database operation log
logger.database("findMany", { model: "User", count: 10 });

// Request/Response logs (automatic with apiHandler)
logger.request("POST", "/api/users");
logger.response("POST", "/api/users", 200, 150); // duration in ms
```

## Error Response Format

All errors return a consistent JSON format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name is required",
    "statusCode": 400,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "details": {
      "field": "name"
    }
  }
}
```

## Prisma Error Handling

The error handler automatically converts Prisma errors:

- **P2002** (Unique constraint) → `ConflictError` (409)
- **P2025** (Record not found) → `NotFoundError` (404)
- Other Prisma errors → `DatabaseError` (500)

## Migration Guide

### Before (Old Pattern)

```typescript
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        if (!body.name) {
            return NextResponse.json(
                { error: "Name is required" },
                { status: 400 }
            );
        }
        
        // ... process
        
    } catch (error: any) {
        console.error("Error:", error);
        return NextResponse.json(
            { error: error.message || "Something went wrong" },
            { status: 500 }
        );
    }
}
```

### After (New Pattern)

```typescript
import { ValidationError, handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        
        if (!body.name) {
            throw new ValidationError("Name is required", {
                field: "name",
            });
        }
        
        // ... process
        
    } catch (error: unknown) {
        logger.error(
            "Operation failed",
            error instanceof Error ? error : new Error(String(error)),
            { endpoint: "/api/example" }
        );
        return handleError(error);
    }
}
```

## Best Practices

1. **Always use structured errors** - Don't return generic error responses
2. **Include context in errors** - Use the `details` parameter to provide helpful information
3. **Log errors with context** - Include endpoint, method, and relevant data in logs
4. **Use appropriate error types** - Choose the right error class for the situation
5. **Don't expose sensitive information** - Error messages should be user-friendly, not expose internals
6. **Use logger instead of console** - All logging should go through the logger utility

## Error Handling in Frontend

The frontend can now rely on consistent error responses:

```typescript
const response = await fetch("/api/example", {
    method: "POST",
    body: JSON.stringify(data),
});

if (!response.ok) {
    const errorData = await response.json();
    
    // Access structured error information
    console.error(errorData.error.code); // "VALIDATION_ERROR"
    console.error(errorData.error.message); // "Name is required"
    console.error(errorData.error.details); // { field: "name" }
}
```

## Testing

When testing, you can check for specific error types:

```typescript
import { ValidationError } from "@/lib/errors";

it("should throw ValidationError for missing name", async () => {
    await expect(handler(req)).rejects.toThrow(ValidationError);
});
```
