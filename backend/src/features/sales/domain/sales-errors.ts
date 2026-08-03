import { AppError, ValidationError } from '../../../lib/errors';

export class SalesConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class InvalidSalesTransitionError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}
