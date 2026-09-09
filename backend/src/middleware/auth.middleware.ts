import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../lib/errors';
import { requireSecretEnv } from '../lib/env';
import { requireActiveUserSession } from '../lib/user-session-status';

const JWT_SECRET = requireSecretEnv('JWT_SECRET');

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

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or invalid authorization header'));
  }

  const token = authHeader.split(' ')[1];

  let decoded: { userId: string; role: string };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
  } catch {
    return next(new AuthenticationError('Invalid or expired token'));
  }

  try {
    await requireActiveUserSession(decoded.userId);
    req.user = decoded;
    return next();
  } catch (error) {
    return next(error);
  }
};
