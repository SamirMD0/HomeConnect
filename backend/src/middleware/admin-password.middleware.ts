import { NextFunction, Request, Response } from 'express';
import { AuthenticationError } from '../lib/errors';

export function requireAccountPassword(req: Request, _res: Response, next: NextFunction) {
  if (!req.body || typeof req.body.accountPassword !== 'string' || req.body.accountPassword.length === 0) {
    return next(new AuthenticationError('Account password is required'));
  }
  next();
}
