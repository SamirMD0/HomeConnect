import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../lib/errors';
import { requireEnv } from '../lib/env';

const JWT_SECRET = requireEnv('JWT_SECRET');

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
      };
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or invalid authorization header'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, role: string };
    req.user = decoded;
    next();
  } catch (error) {
    next(new AuthenticationError('Invalid or expired token'));
  }
};
