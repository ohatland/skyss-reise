/**
 * App-wide event and error log. Everything the app records goes through here,
 * so the PostHog sink can be attached in one place once the account exists.
 */

export type LogProperties = Record<string, string | number | boolean | null | undefined>;

export interface LogSink {
  event(name: string, properties: LogProperties): void;
  error(error: unknown, context: LogProperties): void;
}

const consoleSink: LogSink = {
  event(name, properties) {
    if (__DEV__) console.log(`[event] ${name}`, properties);
  },
  error(error, context) {
    console.warn('[error]', error, context);
  },
};

let sinks: LogSink[] = [consoleSink];

export function setLogSinks(next: LogSink[]): void {
  sinks = next;
}

export const log = {
  event(name: string, properties: LogProperties = {}): void {
    for (const sink of sinks) sink.event(name, properties);
  },
  error(error: unknown, context: LogProperties = {}): void {
    for (const sink of sinks) sink.error(error, context);
  },
};
