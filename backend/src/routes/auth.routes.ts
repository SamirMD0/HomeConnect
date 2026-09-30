import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { rateLimit } from '../features/scanner/scanner-rate-limit';
import { requireAuth } from '../middleware/auth.middleware';

export const authRoutes = Router();
const loginLimiter = rateLimit({ name: 'auth:login', limit: 10, windowMs: 15 * 60_000 });
const refreshLimiter = rateLimit({ name: 'auth:refresh', limit: 30, windowMs: 5 * 60_000 });

authRoutes.post('/setup', AuthController.setup);
authRoutes.post('/login', loginLimiter, AuthController.login);
authRoutes.post('/logout', AuthController.logout);
authRoutes.post('/refresh', refreshLimiter, AuthController.refresh);
authRoutes.get('/me', requireAuth, AuthController.me);
authRoutes.put('/password', requireAuth, AuthController.changePassword);
