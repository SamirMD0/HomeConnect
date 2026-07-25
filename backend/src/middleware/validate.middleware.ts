import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[source]);
      if (source === 'query') {
        Object.defineProperty(req, 'query', {
          value: parsed,
          writable: true,
          configurable: true,
        });
      } else {
        req[source] = parsed;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.issues.map((err) => `${err.path.join('.')}: ${err.message}`).join(', ');
        next(new ValidationError(`Validation failed: ${errorMessages}`));
      } else {
        next(error);
      }
    }
  };
};
