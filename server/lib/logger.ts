import path from 'node:path';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { env } from '../config/env.js';

export type LogMetadata = Record<string, unknown>;

export interface Logger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}

const LOG_FILE_PATH: string = path.join(process.cwd(), 'logs', 'server.log');

// Console gets colorized, human-scannable lines in dev; production keeps pino's
// default single-line JSON so log aggregators can parse it. The file destination is
// always raw JSON, regardless of environment, since it's read by tooling, not eyes.
// `mkdir: true` creates the (gitignored) logs/ directory on first write.
const consoleStream = env.isProduction
  ? { stream: process.stdout }
  : { stream: pinoPretty({ colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }) };

const rootLogger = pino(
  { timestamp: pino.stdTimeFunctions.isoTime },
  pino.multistream([consoleStream, { stream: pino.destination({ dest: LOG_FILE_PATH, mkdir: true }) }]),
);

export function createLogger(scope: string): Logger {
  const scopedLogger = rootLogger.child({ scope });
  return {
    info: (message, metadata) => scopedLogger.info(metadata ?? {}, message),
    warn: (message, metadata) => scopedLogger.warn(metadata ?? {}, message),
    error: (message, metadata) => scopedLogger.error(metadata ?? {}, message),
  };
}
