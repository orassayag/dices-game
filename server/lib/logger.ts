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

// Console gets colorized, human-scannable lines in dev; production keeps pino's default
// single-line JSON so log aggregators can parse it. The file destination is always raw
// JSON regardless of environment, since it's read by tooling, not eyes.
const consoleStream = env.isProduction
  ? { stream: process.stdout }
  : { stream: pinoPretty({ colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' }) };

// Serverless (Vercel) has a read-only filesystem outside /tmp, so opening a file
// destination throws EROFS at boot; the platform captures stdout as runtime logs
// instead. pino.destination opens the file eagerly, so it is only constructed off
// serverless — never merely excluded from the stream list.
const isServerless: boolean = Boolean(process.env.VERCEL);

function buildStreams(): Parameters<typeof pino.multistream>[0] {
  if (isServerless) {
    return [consoleStream];
  }
  return [consoleStream, { stream: pino.destination({ dest: LOG_FILE_PATH, mkdir: true }) }];
}

const rootLogger = pino({ timestamp: pino.stdTimeFunctions.isoTime }, pino.multistream(buildStreams()));

export function createLogger(scope: string): Logger {
  const scopedLogger = rootLogger.child({ scope });
  return {
    info: (message, metadata) => scopedLogger.info(metadata ?? {}, message),
    warn: (message, metadata) => scopedLogger.warn(metadata ?? {}, message),
    error: (message, metadata) => scopedLogger.error(metadata ?? {}, message),
  };
}
