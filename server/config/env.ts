// Imported once at startup so a misconfigured deployment fails loudly before it ever
// accepts a request, instead of silently running with a weak secret or an open origin.

const JWT_SECRET_MIN_BYTES: number = 32;
const DEFAULT_DEV_FRONTEND_URL: string = 'http://localhost:5173';
const DEFAULT_PORT: number = 3000;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface Env {
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  frontendUrl: string;
  databaseUrl: string;
  diceSeed: number | undefined;
  cookie: {
    secure: boolean;
    authCookieName: string;
    csrfCookieName: string;
  };
}

function requireByteLength(value: string, minBytes: number, fieldName: string): void {
  const byteLength: number = new TextEncoder().encode(value).length;
  if (byteLength < minBytes) {
    throw new ConfigError(`${fieldName} must be at least ${minBytes} bytes (got ${byteLength}).`);
  }
}

function parseDiceSeed(raw: string | undefined, isProduction: boolean): number | undefined {
  if (raw === undefined || raw === '') {
    return undefined;
  }
  if (isProduction) {
    throw new ConfigError('DICE_SEED must not be set in production — dice rolls must be random.');
  }
  const parsed: number = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new ConfigError(`DICE_SEED must be a finite number (got "${raw}").`);
  }
  return parsed;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const nodeEnvRaw: string = source.NODE_ENV ?? 'development';
  if (nodeEnvRaw !== 'development' && nodeEnvRaw !== 'production' && nodeEnvRaw !== 'test') {
    throw new ConfigError(
      `NODE_ENV must be one of development|production|test (got "${nodeEnvRaw}").`,
    );
  }
  const nodeEnv: Env['nodeEnv'] = nodeEnvRaw;
  const isProduction: boolean = nodeEnv === 'production';

  const jwtSecret: string | undefined = source.JWT_SECRET;
  if (!jwtSecret) {
    throw new ConfigError('JWT_SECRET is required.');
  }
  requireByteLength(jwtSecret, JWT_SECRET_MIN_BYTES, 'JWT_SECRET');

  const frontendUrlRaw: string | undefined = source.FRONTEND_URL;
  // Escape hatch for the single-container docker-compose demo only — never set this in
  // an actual deployment.
  const allowLocalFrontendUrl: boolean = source.ALLOW_LOCAL_FRONTEND_URL === 'true';
  if (
    isProduction &&
    !allowLocalFrontendUrl &&
    (!frontendUrlRaw || frontendUrlRaw.includes('localhost'))
  ) {
    throw new ConfigError(
      'FRONTEND_URL is required in production and must not contain "localhost" — refusing to boot. ' +
        '(Set ALLOW_LOCAL_FRONTEND_URL=true only for the local docker-compose demo.)',
    );
  }
  if (isProduction && allowLocalFrontendUrl && !frontendUrlRaw) {
    throw new ConfigError('FRONTEND_URL is required in production even with ALLOW_LOCAL_FRONTEND_URL=true.');
  }
  const frontendUrl: string = frontendUrlRaw ?? DEFAULT_DEV_FRONTEND_URL;

  const databaseUrl: string | undefined = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new ConfigError('DATABASE_URL is required.');
  }

  const port: number = source.PORT ? Number(source.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0) {
    throw new ConfigError(`PORT must be a positive integer (got "${source.PORT}").`);
  }

  return {
    nodeEnv,
    isProduction,
    port,
    jwtSecret,
    frontendUrl,
    databaseUrl,
    diceSeed: parseDiceSeed(source.DICE_SEED, isProduction),
    cookie: {
      secure: isProduction,
      authCookieName: 'token',
      // __Host- requires Secure, so it's only usable in production.
      csrfCookieName: isProduction ? '__Host-csrfToken' : 'csrfToken',
    },
  };
}

export const env: Env = loadEnv();
