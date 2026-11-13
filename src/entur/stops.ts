import { ENTUR_CLIENT_NAME } from '@/config';
import { log } from '@/logging/logger';
import type { StopRef } from '@/model/types';

const GEOCODER_URL = 'https://api.entur.io/geocoder/v1/autocomplete';

/** Vestland county, so that a search for a stop name does not return its namesakes elsewhere. */
const COUNTY = 'KVE:TopographicPlace:46';

export interface StopHit extends StopRef {
  /** Name with municipality, to tell stops with the same name apart: "Grana, Bergen". */
  label: string;
}

interface GeocoderResponse {
  features: { properties: { id: string; name: string; label?: string } }[];
}

export function toStopHits(response: GeocoderResponse): StopHit[] {
  return response.features
    .filter((feature) => feature.properties.id.startsWith('NSR:StopPlace:'))
    .map(({ properties }) => ({
      id: properties.id,
      name: properties.name,
      label: properties.label ?? properties.name,
    }));
}

/** Stops whose name matches what the traveller has typed so far. */
export async function searchStops(
  text: string,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<StopHit[]> {
  const query = text.trim();
  if (query.length < 2) return [];

  const doFetch = options.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    text: query,
    layers: 'venue',
    'boundary.county_ids': COUNTY,
    size: '8',
  });
  const started = Date.now();
  try {
    const response = await doFetch(`${GEOCODER_URL}?${params}`, {
      headers: { 'ET-Client-Name': ENTUR_CLIENT_NAME },
      signal: options.signal,
    });
    if (!response.ok) throw new Error(`Entur geocoder answered ${response.status}`);
    const hits = toStopHits((await response.json()) as GeocoderResponse);
    log.event('entur_call', { operation: 'stop_search', ms: Date.now() - started, ok: true });
    return hits;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    if (!aborted) {
      log.event('entur_call', { operation: 'stop_search', ms: Date.now() - started, ok: false });
      log.error(error, { operation: 'stop_search' });
    }
    throw error;
  }
}
