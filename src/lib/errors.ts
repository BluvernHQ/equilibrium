/**
 * Structured Error Handling System
 * 
 * Provides consistent error types, error codes, and error response formatting
 * across the application.
 */

import { NextResponse } from 'next/server';

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_UUID = 'INVALID_UUID',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_INPUT_FORMAT = 'INVALID_INPUT_FORMAT',
  
  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  VIDEO_NOT_FOUND = 'VIDEO_NOT_FOUND',
  TRANSCRIPT_NOT_FOUND = 'TRANSCRIPT_NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  
  // Conflict errors (409)
  DUPLICATE_RESOURCE = 'DUPLICATE_RESOURCE',
  RESOURCE_EXISTS = 'RESOURCE_EXISTS',
  
  // Server errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  FILE_UPLOAD_ERROR = 'FILE_UPLOAD_ERROR',
  TRANSCRIPTION_ERROR = 'TRANSCRIPTION_ERROR',
  
  // Authentication/Authorization (401/403)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON format for API responses
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        timestamp: this.timestamp,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(message: string, resourceType?: string) {
    super(
      message,
      resourceType === 'video' 
        ? ErrorCode.VIDEO_NOT_FOUND 
        : resourceType === 'transcript'
        ? ErrorCode.TRANSCRIPT_NOT_FOUND
        : ErrorCode.NOT_FOUND,
      404,
      resourceType ? { resourceType } : undefined
    );
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ErrorCode.DUPLICATE_RESOURCE, 409, details);
  }
}

/**
 * Database error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      message,
      ErrorCode.DATABASE_ERROR,
      500,
      originalError
        ? {
            originalError: {
              name: originalError.name,
              message: originalError.message,
            },
          }
        : undefined
    );
  }
}

/**
 * External service error (500)
 */
export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    serviceName: string,
    originalError?: Error
  ) {
    super(
      message,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      500,
      {
        service: serviceName,
        ...(originalError && {
          originalError: {
            name: originalError.name,
            message: originalError.message,
          },
        }),
      }
    );
  }
}

/**
 * File upload error (500)
 */
export class FileUploadError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ErrorCode.FILE_UPLOAD_ERROR, 500, details);
  }
}

/**
 * Transcription error (500)
 */
export class TranscriptionError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ErrorCode.TRANSCRIPTION_ERROR, 500, details);
  }
}

/**
 * Handle errors and return consistent NextResponse
 */
export function handleError(error: unknown): NextResponse {
  // If it's already an AppError, use it directly
  if (error instanceof AppError) {
    return NextResponse.json(error.toJSON(), {
      status: error.statusCode,
    });
  }

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; message: string };
    
    // Prisma unique constraint violation
    if (prismaError.code === 'P2002') {
      return NextResponse.json(
        new ConflictError(
          'A record with this value already exists',
          { prismaCode: prismaError.code }
        ).toJSON(),
        { status: 409 }
      );
    }
    
    // Prisma record not found
    if (prismaError.code === 'P2025') {
      return NextResponse.json(
        new NotFoundError('Record not found', 'resource').toJSON(),
        { status: 404 }
      );
    }
    
    // Other Prisma errors
    return NextResponse.json(
      new DatabaseError('Database operation failed', error as Error).toJSON(),
      { status: 500 }
    );
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return NextResponse.json(
      new AppError(
        error.message || 'An unexpected error occurred',
        ErrorCode.INTERNAL_SERVER_ERROR,
        500
      ).toJSON(),
      { status: 500 }
    );
  }

  // Handle unknown error types
  return NextResponse.json(
    new AppError(
      'An unexpected error occurred',
      ErrorCode.INTERNAL_SERVER_ERROR,
      500
    ).toJSON(),
    { status: 500 }
  );
}

/**
 * Wrapper for API route handlers to automatically handle errors
 */
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleError(error);
    }
  };
}
