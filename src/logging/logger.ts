/**
 * App-wide event and error log. Everything the app records goes through here,
 * and the sinks (the console, PostHog) are attached in one place: see `setLogSinks`.
 */

/** A value an event can carry: plain JSON, so that a snapshot of a screen can nest. */
export type LogValue = string | number | boolean | null | undefined | LogValue[] | { [key: string]: LogValue };

export type LogProperties = Record<string, LogValue>;

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

/** Adds a sink next to those already there, such as the console. */
export function addLogSink(sink: LogSink): void {
  sinks = [...sinks, sink];
}

export const log = {
  event(name: string, properties: LogProperties = {}): void {
    for (const sink of sinks) sink.event(name, properties);
  },
  error(error: unknown, context: LogProperties = {}): void {
    for (const sink of sinks) sink.error(error, context);
  },
};
