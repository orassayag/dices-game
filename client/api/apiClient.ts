import { ErrorEnvelopeSchema, type ErrorCode } from '../../shared/index';

// Dev serves client (Vite, :5173) and server (:3000) on different ports, so requests
// cross-origin via CORS; in production the server serves the built client and this base
// is unused (same-origin).
const DEV_API_BASE_URL: string = 'http://localhost:3000';
const DEV_CLIENT_PORT: string = '5173';
const API_BASE_URL: string = window.location.port === DEV_CLIENT_PORT ? DEV_API_BASE_URL : '';

const STATE_CHANGING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_TOKEN_HEADER_NAME: string = 'X-CSRF-Token';
const NO_CONTENT_STATUS: number = 204;

const SERVICE_UNAVAILABLE_MAX_RETRIES: number = 2;
const SERVICE_UNAVAILABLE_RETRY_DELAY_MS: number = 500;

export class ApiError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly status: number;

  constructor(errorCode: ErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode;
    this.status = status;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// Checks both names: the server calls this cookie `csrfToken` in dev and
// `__Host-csrfToken` in production.
function readCsrfCookie(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('csrfToken=') || entry.startsWith('__Host-csrfToken='));
  if (!match) {
    return undefined;
  }
  return decodeURIComponent(match.slice(match.indexOf('=') + 1));
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return new ApiError(
      'DATABASE_CONSTRAINT',
      'Unexpected error response from the server.',
      response.status,
    );
  }
  return new ApiError(parsed.data.error.code, parsed.data.error.message, response.status);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

// Returns `unknown` deliberately — every caller validates the body against the real
// shared Zod schema for that endpoint rather than trusting an asserted type.
export async function apiRequest(path: string, options: RequestOptions = {}): Promise<unknown> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (STATE_CHANGING_METHODS.has(method)) {
    const csrfToken = readCsrfCookie();
    if (csrfToken) {
      headers[CSRF_TOKEN_HEADER_NAME] = csrfToken;
    }
  }

  let lastError: ApiError | undefined;
  for (let attempt = 0; attempt <= SERVICE_UNAVAILABLE_MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await delay(SERVICE_UNAVAILABLE_RETRY_DELAY_MS);
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
    });

    if (response.ok) {
      if (response.status === NO_CONTENT_STATUS) {
        return undefined;
      }
      return await response.json();
    }

    lastError = await parseErrorResponse(response);
    if (lastError.errorCode !== 'SERVICE_UNAVAILABLE') {
      throw lastError;
    }
  }

  throw lastError;
}
