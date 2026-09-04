// Must stay first: it populates process.env for the modules imported below,
// several of which read their configuration at module scope.
import './load-env';
import { app } from './app';
import { logger } from './lib/logger';
import { BackupScheduler } from './features/backup/backup.scheduler';
import { stopLanListener } from './features/scanner/lan-listener';
import { prisma } from './lib/prisma';

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

const startServer = () => {
  try {
    const server = app.listen(Number(PORT), HOST, () => {
      logger.info(`Server running on http://${HOST}:${PORT}`);
      BackupScheduler.start();
    });
    server.on('close', () => console.log('Server closed'));
    server.on('error', (err) => console.log('Server error', err));

    const shutdown = async (signal: string) => {
      logger.info(`Server shutting down from ${signal}`);
      BackupScheduler.stop();
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
