import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../logger';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should write info logs as JSON to console.info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    createLogger('scope-a').info('hello', { a: 1 });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: 'info', scope: 'scope-a', message: 'hello', a: 1 });
    expect(typeof line.timestamp).toBe('string');
  });

  it('should write warn logs to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createLogger('scope-b').warn('careful');

    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: 'warn', scope: 'scope-b', message: 'careful' });
  });

  it('should write error logs to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    createLogger('scope-c').error('boom');

    const line = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(line).toMatchObject({ level: 'error', scope: 'scope-c', message: 'boom' });
  });
});
