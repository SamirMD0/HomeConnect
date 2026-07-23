import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';

export const dashboardRoutes = Router();

dashboardRoutes.get('/summary', DashboardController.getSummary);
dashboardRoutes.get('/recent-activity', DashboardController.getRecentActivity);
