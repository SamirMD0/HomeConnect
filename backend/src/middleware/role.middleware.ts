import { Request, Response, NextFunction } from 'express';
import { AuthorizationError } from '../lib/errors';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthorizationError('User not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError('You do not have permission to perform this action'));
    }

    next();
  };
};
