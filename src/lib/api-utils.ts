/**
 * API Route Utilities
 * 
 * Helper functions for consistent API route handling
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleError, ValidationError } from './errors';
import { logger } from './logger';

/**
 * Wrapper for API route handlers that automatically handles errors
 * and provides consistent logging
 */
export function apiHandler<T extends any[]>(
  handler: (req: NextRequest, ...args: T) => Promise<NextResponse>,
  options?: {
    method?: string;
    requireAuth?: boolean;
  }
) {
  return async (req: NextRequest, ...args: T): Promise<NextResponse> => {
    const startTime = Date.now();
    const method = options?.method || req.method;
    const path = req.nextUrl.pathname;

    try {
      logger.request(method, path);

      // Add authentication check if required
      if (options?.requireAuth) {
        // TODO: Implement authentication check
        // const token = req.headers.get('authorization');
        // if (!token || !isValidToken(token)) {
        //   throw new UnauthorizedError('Authentication required');
        // }
      }

      const response = await handler(req, ...args);
      
      const duration = Date.now() - startTime;
      logger.response(method, path, response.status, duration);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        `${method} ${path} failed`,
        error instanceof Error ? error : new Error(String(error)),
        { durationMs: duration }
      );

      return handleError(error);
    }
  };
}

/**
 * Validate request body has required fields
 */
export function validateRequiredFields(
  body: Record<string, any>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || value === '';
  });

  if (missing.length > 0) {
    throw new ValidationError('Missing required fields', {
      missingFields: missing,
      required: requiredFields,
    });
  }
}

/**
 * Parse and validate JSON body
 */
export async function parseJsonBody<T = any>(
  req: NextRequest
): Promise<T> {
  try {
    return await req.json();
  } catch (error) {
    throw new ValidationError('Invalid JSON in request body', {
      originalError: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get query parameter with validation
 */
export function getQueryParam(
  req: NextRequest,
  key: string,
  required: boolean = false
): string | null {
  const value = req.nextUrl.searchParams.get(key);
  
  if (required && !value) {
    throw new ValidationError(`Missing required query parameter: ${key}`, {
      parameter: key,
    });
  }
  
  return value;
}

/**
 * Get query parameter as number with validation
 */
export function getQueryParamAsNumber(
  req: NextRequest,
  key: string,
  required: boolean = false,
  min?: number,
  max?: number
): number | null {
  const value = getQueryParam(req, key, required);
  
  if (value === null) {
    return null;
  }
  
  const num = Number(value);
  
  if (isNaN(num)) {
    throw new ValidationError(`Invalid number for query parameter: ${key}`, {
      parameter: key,
      value,
    });
  }
  
  if (min !== undefined && num < min) {
    throw new ValidationError(
      `Query parameter ${key} must be at least ${min}`,
      { parameter: key, value: num, min }
    );
  }
  
  if (max !== undefined && num > max) {
    throw new ValidationError(
      `Query parameter ${key} must be at most ${max}`,
      { parameter: key, value: num, max }
    );
  }
  
  return num;
}
