import 'dotenv/config';
import { createApp } from './app.js';
import { createLogger } from './lib/logger.js';

const logger = createLogger('server');

// Top-level safety net (§"error-handling-logging" — never swallow an exception): catches
// anything that never reaches server/middleware/errorHandler.ts because it happened
// outside a request's try/catch (a bug in a timer/background task, a truly unhandled
// rejection). Without this, such an error would print to native stderr and never reach
// the logger. An uncaught exception leaves the process in an undefined state (Node's own
// guidance), so this logs it, then exits — the container/process manager restarts it.
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
