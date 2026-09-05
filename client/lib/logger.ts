type LogLevel = 'info' | 'warn' | 'error';
export type LogMetadata = Record<string, unknown>;

export interface Logger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}

// The browser has no process.stdout/stderr, so console.* is this logger's sink — call
// sites still go through createLogger(), never console.* directly.
function write(scope: string, level: LogLevel, message: string, metadata?: LogMetadata): void {
  const entry = { timestamp: new Date().toISOString(), level, scope, message, ...metadata };
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, metadata) => write(scope, 'info', message, metadata),
    warn: (message, metadata) => write(scope, 'warn', message, metadata),
    error: (message, metadata) => write(scope, 'error', message, metadata),
  };
}
