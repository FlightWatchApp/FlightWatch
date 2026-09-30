import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logEvent } from './logger.js';

describe('logEvent', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('emits a single JSON line with a timestamp and the given fields', () => {
    logEvent({ event: 'watch_created', correlationId: 'corr-1', watchId: 'watch-1' });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.event).toBe('watch_created');
    expect(parsed.correlationId).toBe('corr-1');
    expect(parsed.watchId).toBe('watch-1');
    expect(typeof parsed.timestamp).toBe('string');
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });

  it.each(['password', 'passwordHash', 'token', 'tokenHash', 'email', 'destination'])(
    'redacts the %s field instead of logging it in the clear',
    (field) => {
      logEvent({ event: 'login_attempt', [field]: 'sensitive-value' });

      const line = logSpy.mock.calls[0]?.[0] as string;
      expect(line).not.toContain('sensitive-value');
      const parsed = JSON.parse(line);
      expect(parsed[field]).toBe('[redacted]');
    },
  );

  it('does not log correlationId when absent', () => {
    logEvent({ event: 'no_correlation' });

    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(parsed.correlationId).toBeUndefined();
  });

  it('redacts sensitive fields recursively and handles Error values', () => {
    const circular: Record<string, unknown> = { email_address: 'person@example.com' };
    circular.self = circular;
    logEvent({
      event: 'nested_data',
      payload: {
        PASSWORD_HASH: 'hash-value',
        contacts: [{ destination: 'person@example.com', value: 'safe' }],
        error: new Error('request failed for person@example.com token=secret-token'),
        circular,
      },
    });

    const line = logSpy.mock.calls[0]?.[0] as string;
    expect(line).not.toContain('hash-value');
    expect(line).not.toContain('person@example.com');
    expect(line).not.toContain('secret-token');
    expect(line).toContain('[circular]');
  });

  it('does not allow a caller to override the timestamp', () => {
    logEvent({ event: 'timestamp_test', timestamp: 'forged' });
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);

    expect(parsed.timestamp).not.toBe('forged');
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date');
  });
});
