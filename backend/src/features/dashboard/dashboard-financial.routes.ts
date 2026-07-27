import { Router } from 'express';
import { DashboardFinancialController } from './dashboard-financial.controller';

export const dashboardFinancialRoutes = Router();

dashboardFinancialRoutes.get('/financial-summary', DashboardFinancialController.getFinancialSummary);
