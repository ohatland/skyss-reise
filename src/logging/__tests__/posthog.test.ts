import { addLogSink, log, setLogSinks } from '@/logging/logger';
import { createPostHogSink, jsonProperties, POSTHOG_EU_HOST, readPostHogConfig, startLogging } from '@/logging/posthog';

describe('the PostHog config', () => {
  it('is none without a key, so that the app logs to the console only', () => {
    expect(readPostHogConfig({})).toBeNull();
    expect(readPostHogConfig({ key: '' })).toBeNull();
    expect(readPostHogConfig({ key: '   ', host: 'https://example.com' })).toBeNull();
  });

  it('is the EU region unless a host is given', () => {
    expect(readPostHogConfig({ key: 'phc_test' })).toEqual({ apiKey: 'phc_test', host: 'https://eu.i.posthog.com' });
    expect(POSTHOG_EU_HOST).toBe('https://eu.i.posthog.com');
    expect(readPostHogConfig({ key: 'phc_test', host: '' })?.host).toBe(POSTHOG_EU_HOST);
    expect(readPostHogConfig({ key: ' phc_test ', host: 'https://eu.posthog.com' })).toEqual({
      apiKey: 'phc_test',
      host: 'https://eu.posthog.com',
    });
  });
});

describe('the PostHog sink', () => {
  const client = () => ({ capture: jest.fn(), captureException: jest.fn() });

  it('sends events and errors that go through the logger', () => {
    const posthog = client();
    setLogSinks([createPostHogSink(posthog)]);
    const error = new Error('Entur is down');

    log.event('entur_call', { operation: 'trip', ms: 120, ok: true });
    log.error(error, { operation: 'trip', status: 503 });

    expect(posthog.capture).toHaveBeenCalledWith('entur_call', { operation: 'trip', ms: 120, ok: true });
    expect(posthog.captureException).toHaveBeenCalledWith(error, { operation: 'trip', status: 503 });
  });

  it('sends nested properties as they are, and leaves out what has no JSON form', () => {
    const posthog = client();
    setLogSinks([createPostHogSink(posthog)]);

    log.event('mark_created', { cards: [{ line: '50E', margin: undefined }], note: null, gone: undefined });

    expect(posthog.capture).toHaveBeenCalledWith('mark_created', { cards: [{ line: '50E' }], note: null });
    expect(jsonProperties({ a: undefined, b: [1, undefined] })).toEqual({ b: [1, null] });
  });

  it('does not let a failing client break the app', () => {
    const posthog = client();
    posthog.capture.mockImplementation(() => {
      throw new Error('storage full');
    });
    posthog.captureException.mockImplementation(() => {
      throw new Error('storage full');
    });
    setLogSinks([createPostHogSink(posthog)]);

    expect(() => log.event('anything')).not.toThrow();
    expect(() => log.error(new Error('x'))).not.toThrow();
  });

  it('sits next to the other sinks', () => {
    const console_ = { event: jest.fn(), error: jest.fn() };
    const posthog = client();
    setLogSinks([console_]);
    addLogSink(createPostHogSink(posthog));

    log.event('both');

    expect(console_.event).toHaveBeenCalledWith('both', {});
    expect(posthog.capture).toHaveBeenCalledWith('both', {});
  });
});

describe('starting the logging', () => {
  it('does nothing without a key: no sink is added', () => {
    const only = { event: jest.fn(), error: jest.fn() };
    setLogSinks([only]);

    expect(() => startLogging(null)).not.toThrow();
    log.event('still here');

    expect(only.event).toHaveBeenCalledTimes(1);
  });
});
