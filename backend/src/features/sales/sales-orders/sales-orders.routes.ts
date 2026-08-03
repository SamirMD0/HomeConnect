import { Router } from 'express';
import { validate } from '../../../middleware/validate.middleware';
import { requireSalesAdmin } from '../authorization/sales-policy';
import { SalesOrdersController } from './sales-orders.controller';
import {
  addSalesOrderItemSchema,
  changeSalesOrderPaymentSchema,
  changeSalesOrderStatusSchema,
  createSalesOrderDebtSchema,
  createSalesOrderInstallmentPlanSchema,
  createSalesOrderSchema,
  customerSalesOrdersParamsSchema,
  restoreSalesOrderSchema,
  salesAuditQuerySchema,
  salesOrderActionSchema,
  salesOrderItemParamsSchema,
  salesOrderItemActionSchema,
  salesOrderListQuerySchema,
  salesOrderParamsSchema,
  salesOrderSummaryQuerySchema,
  updateSalesOrderItemSchema,
  updateSalesOrderSchema,
} from './sales-orders.validator';

export const salesOrdersRoutes = Router();
export const customerSalesOrdersRoutes = Router();

salesOrdersRoutes.get('/summary', validate(salesOrderSummaryQuerySchema, 'query'), SalesOrdersController.summary);
salesOrdersRoutes.get('/', validate(salesOrderListQuerySchema, 'query'), SalesOrdersController.list);
salesOrdersRoutes.post('/', validate(createSalesOrderSchema), SalesOrdersController.create);
salesOrdersRoutes.get('/:salesOrderId/audit', requireSalesAdmin, validate(salesOrderParamsSchema, 'params'), validate(salesAuditQuerySchema, 'query'), SalesOrdersController.audit);
salesOrdersRoutes.post('/:salesOrderId/fulfillment-status', validate(salesOrderParamsSchema, 'params'), validate(changeSalesOrderStatusSchema), SalesOrdersController.status);
salesOrdersRoutes.post('/:salesOrderId/payment', validate(salesOrderParamsSchema, 'params'), validate(changeSalesOrderPaymentSchema), SalesOrdersController.payment);
salesOrdersRoutes.post('/:salesOrderId/cancel', requireSalesAdmin, validate(salesOrderParamsSchema, 'params'), validate(salesOrderActionSchema), SalesOrdersController.cancel);
salesOrdersRoutes.post('/:salesOrderId/restore', requireSalesAdmin, validate(salesOrderParamsSchema, 'params'), validate(restoreSalesOrderSchema), SalesOrdersController.restore);
salesOrdersRoutes.post('/:salesOrderId/return', requireSalesAdmin, validate(salesOrderParamsSchema, 'params'), validate(salesOrderActionSchema), SalesOrdersController.returnOrder);
salesOrdersRoutes.post('/:salesOrderId/create-debt', validate(salesOrderParamsSchema, 'params'), validate(createSalesOrderDebtSchema), SalesOrdersController.createDebt);
salesOrdersRoutes.post('/:salesOrderId/create-installment-plan', validate(salesOrderParamsSchema, 'params'), validate(createSalesOrderInstallmentPlanSchema), SalesOrdersController.createInstallmentPlan);
salesOrdersRoutes.post('/:salesOrderId/unlink-financial', requireSalesAdmin, validate(salesOrderParamsSchema, 'params'), validate(salesOrderActionSchema), SalesOrdersController.unlinkFinancial);
salesOrdersRoutes.post('/:salesOrderId/items', validate(salesOrderParamsSchema, 'params'), validate(addSalesOrderItemSchema), SalesOrdersController.addItem);
salesOrdersRoutes.patch('/:salesOrderId/items/:itemId', validate(salesOrderItemParamsSchema, 'params'), validate(updateSalesOrderItemSchema), SalesOrdersController.updateItem);
salesOrdersRoutes.post('/:salesOrderId/items/:itemId/remove', validate(salesOrderItemParamsSchema, 'params'), validate(salesOrderItemActionSchema), SalesOrdersController.removeItem);
salesOrdersRoutes.patch('/:salesOrderId', validate(salesOrderParamsSchema, 'params'), validate(updateSalesOrderSchema), SalesOrdersController.update);
salesOrdersRoutes.get('/:salesOrderId', validate(salesOrderParamsSchema, 'params'), SalesOrdersController.get);

customerSalesOrdersRoutes.get('/:customerId/sales-orders', validate(customerSalesOrdersParamsSchema, 'params'), validate(salesOrderListQuerySchema, 'query'), SalesOrdersController.listCustomer);
