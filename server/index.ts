import 'dotenv/config';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('server');

// An uncaught exception leaves the process in an undefined state, so this logs it (rather
// than letting it print to bare stderr) then exits — the process manager restarts it.
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception — exiting process', {
    error: { name: error.name, message: error.message, stack: error.stack },
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    error:
      reason instanceof Error
        ? { name: reason.name, message: reason.message, stack: reason.stack }
        : reason,
  });
});

const app = createApp();
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => logger.info(`Server running on :${port}`));
