import { Router } from 'express';
import { UsersController } from '../controllers/users.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { Role } from '@prisma/client';

export const usersRoutes = Router();

// All user routes require authentication and ADMIN role
usersRoutes.use(requireAuth);
usersRoutes.use(requireRole([Role.ADMIN]));

usersRoutes.get('/', UsersController.list);
usersRoutes.post('/', UsersController.create);
usersRoutes.get('/:id', UsersController.get);
usersRoutes.put('/:id', UsersController.update);
usersRoutes.delete('/:id', UsersController.deactivate);
