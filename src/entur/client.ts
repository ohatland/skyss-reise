import { ENTUR_CLIENT_NAME, ENTUR_JOURNEY_PLANNER_URL } from '@/config';
import { log } from '@/logging/logger';

export class EnturError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EnturError';
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export interface EnturQueryOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Runs one GraphQL query against Entur's journey planner.
 * `operation` is a short name used in the log, so slow or failing calls can be told apart.
 */
export async function enturQuery<T>(
  operation: string,
  query: string,
  variables: Record<string, unknown> = {},
  options: EnturQueryOptions = {},
): Promise<T> {
  const doFetch = options.fetchImpl ?? fetch;
  const started = Date.now();
  let status: number | undefined;

  try {
    const response = await doFetch(ENTUR_JOURNEY_PLANNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ET-Client-Name': ENTUR_CLIENT_NAME,
      },
      body: JSON.stringify({ query, variables }),
      signal: options.signal,
    });
    status = response.status;

    if (!response.ok) {
      throw new EnturError(`Entur answered ${response.status}`, operation, response.status);
    }

    const body = (await response.json()) as GraphQLResponse<T>;
    if (body.errors?.length) {
      throw new EnturError(body.errors.map((e) => e.message).join('; '), operation, status);
    }
    if (body.data === undefined) {
      throw new EnturError('Entur answered without data', operation, status);
    }

    log.event('entur_call', { operation, ms: Date.now() - started, ok: true, status });
    return body.data;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (!aborted) {
      log.event('entur_call', { operation, ms: Date.now() - started, ok: false, status });
      log.error(error, { operation, status });
    }
    throw error;
  }
}
