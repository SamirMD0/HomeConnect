import { Router } from 'express';
import { requireRole } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import { ReportRowsController } from './report-rows.controller';
import type { ReportSlice } from './report-rows.types';
import { reportRowsQuerySchema } from './report-rows.validator';

export const reportRowsRoutes = Router();

const routes: Array<[path: string, slice: ReportSlice]> = [
  ['/customers/new', 'customers-new'],
  ['/customers/debts', 'customers-debts'],
  ['/customers/payments', 'customers-payments'],
  ['/customers/receivables-aging', 'customers-aging'],
  ['/customers/not-paid', 'customers-not-paid'],
  ['/customers/paid', 'customers-paid'],
  ['/products/bought', 'products-bought'],
  ['/suppliers/debts', 'suppliers-debts'],
  ['/suppliers/receiving', 'suppliers-receiving'],
  ['/sales/orders', 'sales-orders'],
  ['/sales/unpaid', 'sales-unpaid'],
  ['/inventory/movements', 'inventory-movements'],
  ['/inventory/reconciliation', 'inventory-reconciliation'],
];

for (const [path, slice] of routes) {
  reportRowsRoutes.get(`${path}/export.csv`, requireRole(['ADMIN']), validate(reportRowsQuerySchema, 'query'), ReportRowsController.exportCsv(slice));
  reportRowsRoutes.get(path, requireRole(['ADMIN']), validate(reportRowsQuerySchema, 'query'), ReportRowsController.get(slice));
}
