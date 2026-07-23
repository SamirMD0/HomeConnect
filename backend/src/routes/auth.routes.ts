import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

export const authRoutes = Router();

authRoutes.post('/setup', AuthController.setup);
authRoutes.post('/login', AuthController.login);
authRoutes.post('/logout', AuthController.logout);
authRoutes.post('/refresh', AuthController.refresh);
authRoutes.get('/me', requireAuth, AuthController.me);
authRoutes.put('/password', requireAuth, AuthController.changePassword);
