import { describe, it, expect } from 'vitest';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ErrorCode,
  handleError,
} from './errors';

describe('errors', () => {
  describe('ValidationError', () => {
    it('has status 400 and VALIDATION_ERROR code', () => {
      const err = new ValidationError('Name is required', { field: 'name' });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.details).toEqual({ field: 'name' });
    });
  });

  describe('handleError', () => {
    it('returns Response with AppError status and body', async () => {
      const err = new ValidationError('Bad request');
      const res = handleError(err);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(body.error.message).toBe('Bad request');
    });
  });
});
