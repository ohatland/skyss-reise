import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { addLogSink, type LogProperties, type LogSink } from '@/logging/logger';

/** PostHog Cloud in the EU region, chosen 13 November 2026. The region cannot be changed afterwards. */
export const POSTHOG_EU_HOST = 'https://eu.i.posthog.com';

export interface PostHogConfig {
  apiKey: string;
  host: string;
}

/**
 * The project key and host from the environment, or null without a key, in which
 * case the app logs to the console only. The key is public by design (it only
 * lets a client send events), but it is kept out of the repository all the same.
 */
export function readPostHogConfig(env: { key?: string; host?: string }): PostHogConfig | null {
  const apiKey = env.key?.trim();
  if (!apiKey) return null;
  return { apiKey, host: env.host?.trim() || POSTHOG_EU_HOST };
}

/** What the SDK takes as event properties. */
type PostHogEventProperties = Parameters<import('posthog-react-native').PostHog['capture']>[1] & object;

/** The part of the PostHog client the sink uses, so that tests can stand in for it. */
export interface PostHogClient {
  capture(event: string, properties: Record<string, unknown>): void;
  captureException(error: unknown, properties: Record<string, unknown>): void;
}

/** The properties as plain JSON: `undefined` has no JSON form, and an error object must not reach the SDK as a property. */
export function jsonProperties(properties: LogProperties): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties)) as Record<string, unknown>;
}

/** A sink that sends what goes through the logger to PostHog. */
export function createPostHogSink(client: PostHogClient): LogSink {
  return {
    event(name, properties) {
      try {
        client.capture(name, jsonProperties(properties));
      } catch {
        // Logging must never break the app.
      }
    },
    error(error, context) {
      try {
        client.captureException(error, jsonProperties(context));
      } catch {
        // Logging must never break the app.
      }
    },
  };
}

let started = false;

/**
 * Attaches PostHog to the logger when a project key is set, next to the console.
 * Safe to call more than once, and does nothing without a key or on the server
 * that renders the web build, where there is no phone or browser to log from.
 *
 * The EXPO_PUBLIC_ variables must be read as `process.env.EXPO_PUBLIC_…` in full,
 * or Expo does not put their values into the bundle.
 */
export function startLogging(
  config: PostHogConfig | null = readPostHogConfig({
    key: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  }),
): void {
  if (started || !config) return;
  if (Platform.OS === 'web' && typeof window === 'undefined') return;
  started = true;

  // Required here and not at the top, so that the SDK is not loaded at all without a key.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PostHog } = require('posthog-react-native') as typeof import('posthog-react-native');
  const client = new PostHog(config.apiKey, {
    host: config.host,
    // No IP-based location: where the traveller is, is the trip's business, not the log's.
    disableGeoip: true,
    errorTracking: {
      // Uncaught errors and unhandled promise rejections. Errors the app catches go through the logger.
      autocapture: { uncaughtExceptions: true, unhandledRejections: true, console: false },
    },
  });
  client.register({ app_version: Constants.expoConfig?.version ?? null, platform: Platform.OS });

  addLogSink(
    createPostHogSink({
      capture: (event, properties) => client.capture(event, properties as PostHogEventProperties),
      captureException: (error, properties) => client.captureException(error, properties as PostHogEventProperties),
    }),
  );
}
