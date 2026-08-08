import dotenv from 'dotenv';
import path from 'path';

for (const envPath of [
  process.env.BACKEND_ENV_FILE,
  process.env.HOME_CONNECT_CONFIG_DIR
    ? path.join(process.env.HOME_CONNECT_CONFIG_DIR, 'production.env')
    : undefined,
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../backend/.env'),
  path.resolve(__dirname, '../../../../backend/.env'),
]) {
  if (envPath) dotenv.config({ path: envPath, quiet: true });
}

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
