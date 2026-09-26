import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = createApp().listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Dhaka Tesla Pool API listening');
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
