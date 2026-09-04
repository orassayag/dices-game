type LogLevel = 'info' | 'warn' | 'error';
export type LogMetadata = Record<string, unknown>;

export interface Logger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}

// Minimal structured logger — one JSON line per call, scoped by caller. Stands in for
// a full logging SDK (this take-home has none installed); every call site gets
// `loggerFactory.create('<scoped-name>')`-equivalent scoping without an unscoped
// console.* call anywhere in business code (error-handling-logging.md).
function write(scope: string, level: LogLevel, message: string, metadata?: LogMetadata): void {
  const entry = { timestamp: new Date().toISOString(), level, scope, message, ...metadata };
  const line = `${JSON.stringify(entry)}\n`;
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, metadata) => write(scope, 'info', message, metadata),
    warn: (message, metadata) => write(scope, 'warn', message, metadata),
    error: (message, metadata) => write(scope, 'error', message, metadata),
  };
}
