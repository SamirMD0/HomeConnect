import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { errorHandler } from './middleware/error.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { prisma } from './lib/prisma';

export const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
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

// Global Error Handler
app.use(errorHandler);
