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

export const app = express();

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true,
}));
app.use(compression());
app.use(express.json());
app.use(cookieParser());
app.use(requestLogger);

// Health check
app.get('/api/v1/health', async (_req, res, next) => {
  try {
    // Verify DB connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      data: { status: 'healthy', database: 'connected' },
      meta: { timestamp: new Date().toISOString() }
    });
  } catch (error) {
    next(error);
  }
});

import { dashboardRoutes } from './routes/dashboard.routes';
import { requireAuth } from './middleware/auth.middleware';

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', requireAuth, usersRoutes);
app.use('/api/v1/customers', requireAuth, customersRoutes);
app.use('/api/v1/transactions', requireAuth, transactionsRoutes);
app.use('/api/v1/dashboard', requireAuth, dashboardRoutes);

// Global Error Handler
app.use(errorHandler);
