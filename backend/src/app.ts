import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { prisma } from './lib/prisma';
import { authRoutes } from './routes/auth.routes';
import { usersRoutes } from './routes/users.routes';
import customersRoutes from './routes/customers.routes';
import transactionsRoutes from './routes/transactions.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { requireAuth } from './middleware/auth.middleware';
import { customerDebtsRoutes, debtsRoutes } from './features/financial/debts/debts.routes';
import { customerFinancialSummaryRoutes } from './features/financial/customer-summary/customer-financial-summary.routes';
import {
  customerInstallmentPlansRoutes,
  installmentPlansRoutes,
} from './features/financial/installment-plans/installment-plans.routes';
import { financialLedgerRoutes } from './features/financial/ledger/financial-ledger.routes';
import { receivablesRoutes } from './features/financial/receivables/receivables.routes';
import { prepaidRoutes } from './features/financial/prepaid/prepaid.routes';
import { correctionsRoutes, customerCorrectionsRoutes } from './features/financial/corrections/corrections.routes';
import { paymentsRoutes } from './features/financial/payments/payments.routes';
import { monthlyDebtsRoutes } from './features/reports/monthly-debts/monthly-debts.routes';
import { backupRoutes } from './features/backup/backup.routes';
import { blockWritesDuringRestore } from './features/backup/backup.middleware';
import { diagnosticsRoutes } from './features/diagnostics/diagnostics.routes';
import { productsRoutes } from './features/service/products/products.routes';
import { customerServiceJobsRoutes, serviceJobsRoutes } from './features/service/service-jobs/service-jobs.routes';
import { customerSalesOrdersRoutes, salesOrdersRoutes } from './features/sales';
import { supplierLedgerRoutes, suppliersRoutes, supplierTransactionsGlobalRoutes, supplierTransactionsRoutes } from './features/suppliers';
import { pricingCalculatorRoutes, pricingPresetsRoutes } from './features/pricing';

export const app = express();

const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS?.split(',') || []),
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter((origin): origin is string => Boolean(origin));

// Middleware
app.use(helmet());
app.use(cors({
  origin: configuredOrigins,
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);
app.use(blockWritesDuringRestore);

// Health check
app.get('/api/v1/health', async (_req, res) => {
  try {
    // Verify DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      data: { status: 'healthy', database: 'connected' },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch {
    res.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database connection failed. Confirm local PostgreSQL is running.',
      },
      meta: { timestamp: new Date().toISOString() }
    });
  }
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', requireAuth, usersRoutes);
app.use('/api/v1/customers', requireAuth, customerDebtsRoutes);
app.use('/api/v1/customers', requireAuth, customerInstallmentPlansRoutes);
app.use('/api/v1/customers', requireAuth, customerFinancialSummaryRoutes);
app.use('/api/v1/customers', requireAuth, customerCorrectionsRoutes);
app.use('/api/v1/customers', requireAuth, customerServiceJobsRoutes);
app.use('/api/v1/customers', requireAuth, customerSalesOrdersRoutes);
app.use('/api/v1/customers', requireAuth, customersRoutes);
app.use('/api/v1/debts', requireAuth, debtsRoutes);
app.use('/api/v1/installment-plans', requireAuth, installmentPlansRoutes);
app.use('/api/v1/payments', requireAuth, paymentsRoutes);
app.use('/api/v1/financial-ledger', requireAuth, financialLedgerRoutes);
app.use('/api/v1/receivables', requireAuth, receivablesRoutes);
app.use('/api/v1/prepaid-purchases', requireAuth, prepaidRoutes);
app.use('/api/v1/products', requireAuth, productsRoutes);
app.use('/api/v1/service-jobs', requireAuth, serviceJobsRoutes);
app.use('/api/v1/sales-orders', requireAuth, salesOrdersRoutes);
app.use('/api/v1/suppliers', requireAuth, supplierTransactionsRoutes);
app.use('/api/v1/suppliers', requireAuth, suppliersRoutes);
app.use('/api/v1/supplier-transactions', requireAuth, supplierTransactionsGlobalRoutes);
app.use('/api/v1/supplier-ledger', requireAuth, supplierLedgerRoutes);
app.use('/api/v1/pricing-presets', requireAuth, pricingPresetsRoutes);
app.use('/api/v1/pricing', requireAuth, pricingCalculatorRoutes);
app.use('/api/v1/corrections', requireAuth, correctionsRoutes);
app.use('/api/v1/reports', requireAuth, monthlyDebtsRoutes);
app.use('/api/v1/admin/backups', requireAuth, backupRoutes);
app.use('/api/v1/admin/diagnostics', requireAuth, diagnosticsRoutes);
app.use('/api/v1/transactions', requireAuth, transactionsRoutes);
app.use('/api/v1/dashboard', requireAuth, dashboardRoutes);

// Global Error Handler
app.use(errorHandler);
