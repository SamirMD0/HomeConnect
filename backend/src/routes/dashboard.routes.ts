import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { dashboardFinancialRoutes } from '../features/dashboard/dashboard-financial.routes';

export const dashboardRoutes = Router();

dashboardRoutes.use(dashboardFinancialRoutes);
dashboardRoutes.get('/summary', DashboardController.getSummary);
dashboardRoutes.get('/recent-activity', DashboardController.getRecentActivity);
