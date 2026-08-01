import { Router } from 'express';
import { validate } from '../../middleware/validate.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { DashboardAnalyticsController } from './dashboard.controller';
import { dashboardActivityQuerySchema, dashboardMonthEndQuerySchema, dashboardQuerySchema } from './dashboard.validator';

export const dashboardAnalyticsRoutes = Router();

dashboardAnalyticsRoutes.get('/overview', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.overview);
dashboardAnalyticsRoutes.get('/customer-financial', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.customerFinancial);
dashboardAnalyticsRoutes.get('/supplier-financial', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.supplierFinancial);
dashboardAnalyticsRoutes.get('/service-summary', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.serviceSummary);
dashboardAnalyticsRoutes.get('/product-summary', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.productSummary);
dashboardAnalyticsRoutes.get('/alerts', validate(dashboardQuerySchema, 'query'), DashboardAnalyticsController.alerts);
dashboardAnalyticsRoutes.get('/activity', validate(dashboardActivityQuerySchema, 'query'), DashboardAnalyticsController.activity);
// Deprecated alias retained for compatibility.
dashboardAnalyticsRoutes.get('/recent-activity', validate(dashboardActivityQuerySchema, 'query'), DashboardAnalyticsController.activity);
dashboardAnalyticsRoutes.get('/month-end', requireRole(['ADMIN']), validate(dashboardMonthEndQuerySchema, 'query'), DashboardAnalyticsController.monthEnd);

