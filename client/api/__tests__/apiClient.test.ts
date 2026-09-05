// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../apiClient';

function mockFetchResponse(
  status: number,
  body: unknown,
  ok: boolean = status >= 200 && status < 300,
) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should send credentials: include on every request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(200, { ok: true }));

    await apiRequest('/games');

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.credentials).toBe('include');
  });

  it('should throw an ApiError carrying the envelope code/message/status on a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockFetchResponse(404, { error: { code: 'GAME_NOT_FOUND', message: 'Game not found.' } }),
    );

    await expect(apiRequest('/games/missing')).rejects.toMatchObject({
      errorCode: 'GAME_NOT_FOUND',
      message: 'Game not found.',
      status: 404,
    });
  });

  it('should throw a DATABASE_CONSTRAINT ApiError when the error body does not match the envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse(500, { unexpected: true }));

    await expect(apiRequest('/games')).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest('/games')).rejects.toMatchObject({ errorCode: 'DATABASE_CONSTRAINT' });
  });

  it('should return undefined for a 204 No Content response without parsing a body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new Error('should not be called')),
    } as Response);

    await expect(apiRequest('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('should retry a 503 SERVICE_UNAVAILABLE and return the eventual success', async () => {
    vi.useFakeTimers();
    const serviceUnavailable = mockFetchResponse(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again.' },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(serviceUnavailable)
      .mockResolvedValueOnce(serviceUnavailable)
      .mockResolvedValueOnce(mockFetchResponse(200, { ok: true }));

    const resultPromise = apiRequest('/games');
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should give up after exhausting 503 retries and throw the SERVICE_UNAVAILABLE ApiError', async () => {
    vi.useFakeTimers();
    const serviceUnavailable = mockFetchResponse(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Try again.' },
    });
    vi.mocked(fetch).mockResolvedValue(serviceUnavailable);

    const assertion = expect(apiRequest('/games')).rejects.toMatchObject({
      errorCode: 'SERVICE_UNAVAILABLE',
    });
    await vi.runAllTimersAsync();
    await assertion;
  });
});
