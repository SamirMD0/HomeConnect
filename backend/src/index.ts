// Must stay first: it populates process.env for the modules imported below,
// several of which read their configuration at module scope — lib/prisma builds
// its PrismaClient there. Imports are evaluated before any statement in this
// file, so loading the environment here as a statement would be too late.
import './load-env';

import { app } from './app';
import { logger } from './lib/logger';
import { BackupScheduler } from './features/backup/backup.scheduler';
import { stopLanListener } from './features/scanner/lan-listener';
import { assertHostedModeEnv } from './lib/hosted-mode-preflight';
import { prisma } from './lib/prisma';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
if (process.env.HOME_CONNECT_STARTUP_TRACE === '1') console.info(`[startup] application imports complete at ${new Date().toISOString()}`);

const startServer = () => {
  try {
    assertHostedModeEnv();
    const server = app.listen(Number(PORT), HOST);
    server.once('listening', () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
      if (process.env.HOSTED_MODE !== 'true') {
        BackupScheduler.start();
      } else {
        logger.info('BackupScheduler skipped: HOSTED_MODE=true');
      }
    });
    server.on('close', () => console.log('Server closed'));
    server.on('error', (err) => {
      logger.error('Failed to listen:', err);
      process.exit(1);
    });

    const shutdown = async (signal: string) => {
      logger.info(`Server shutting down from ${signal}`);
      if (process.env.HOSTED_MODE !== 'true') {
        BackupScheduler.stop();
      }
      // Closes the LAN scanner socket if an admin left it enabled, so the port
      // is not held open past the process.
      await stopLanListener();
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5_000).unref();
    };

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
