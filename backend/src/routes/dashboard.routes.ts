import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';
import { dashboardFinancialRoutes } from '../features/dashboard/dashboard-financial.routes';
import { dashboardAnalyticsRoutes } from '../features/dashboard/dashboard.routes';

export const dashboardRoutes = Router();

dashboardRoutes.use(dashboardFinancialRoutes);
dashboardRoutes.use(dashboardAnalyticsRoutes);
dashboardRoutes.get('/summary', DashboardController.getSummary);
