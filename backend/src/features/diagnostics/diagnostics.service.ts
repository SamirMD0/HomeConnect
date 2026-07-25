import fs from 'fs';
import { prisma } from '../../lib/prisma';
import { getLogFilePath, ErrorLogRecord, logBackendError } from './error-logger';

export class DiagnosticsService {
  async getHealth() {
    let databaseStatus = 'disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch {
      databaseStatus = 'failed';
    }

    const appVersion = process.env.npm_package_version || process.env.APP_VERSION || '1.0.0';
    const logPath = getLogFilePath();
    
    return {
      status: databaseStatus === 'connected' ? 'healthy' : 'degraded',
      database: databaseStatus,
      appVersion,
      logPath,
    };
  }

  getErrors(limit = 20): ErrorLogRecord[] {
    const logPath = getLogFilePath();
    if (!fs.existsSync(logPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim() !== '');
      
      const records: ErrorLogRecord[] = lines.map(line => {
        try {
          return JSON.parse(line) as ErrorLogRecord;
        } catch {
          return null;
        }
      }).filter((r): r is ErrorLogRecord => r !== null);

      // Return the most recent errors first
      return records.slice(-limit).reverse();
    } catch (error) {
      console.error('Failed to read diagnostics log:', error);
      return [];
    }
  }

  clearErrors(): void {
    const logPath = getLogFilePath();
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf-8');
    }
  }

  logFrontendError(data: { route: string; message: string; stack?: string; timestamp?: string; errorCode?: string }): void {
    logBackendError({
      method: 'FRONTEND',
      path: data.route,
      message: data.message,
      stack: data.stack,
      errorCode: data.errorCode || 'FRONTEND_CRASH',
      timestamp: data.timestamp || new Date().toISOString(),
    });
  }
}

export const diagnosticsService = new DiagnosticsService();
