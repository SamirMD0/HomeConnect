import { app } from './app';
import { logger } from './lib/logger';

const PORT = process.env.PORT || 3001;

const startServer = () => {
  try {
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
