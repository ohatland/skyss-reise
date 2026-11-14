import { enturQuery, type EnturQueryOptions } from '@/entur/client';
import type { Place } from '@/model/types';

/**
 * Who the period ticket is valid with: Skyss (bus, light rail and boat) and Vy's
 * trains. The airport coach is private and never searched. The ticket's zone is
 * not checked, so a train leaving the zone would still be suggested.
 */
export const TICKET_AUTHORITIES = ['SKY:Authority:SKY', 'VYG:Authority:VYT'];

const DEFAULT_SEARCH_WINDOW_MINUTES = 20;

export interface TripSearchParams {
  from: Place;
  to: Place;
  /** Earliest departure, ISO 8601 with offset. */
  dateTime: string;
  /** Allow more transfers than Entur's best suggestion has. */
  maximumAdditionalTransfers?: number;
  transferPenalty?: number;
  /** Below Entur's default, walking becomes cheaper and walk-heavy routes surface. */
  walkReluctance?: number;
  /** Line ids, such as SKY:Line:50E, that the search may not use. */
  bannedLines?: string[];
  /** Stop place id the trip must board or alight at. */
  viaStopPlaceId?: string;
  /** Walk the whole way instead of using public transport. */
  onFoot?: boolean;
  /** How long after dateTime departures are looked for. Twenty minutes unless set. */
  searchWindowMinutes?: number;
}

export interface TripLegResponse {
  mode: string;
  distance: number;
  duration: number;
  line: { id: string; publicCode: string | null } | null;
  fromPlace: TripPlaceResponse;
  toPlace: TripPlaceResponse;
}

export interface TripPlaceResponse {
  name: string | null;
  quay: {
    id: string;
    /** Platform letter where the stop has one. */
    publicCode: string | null;
    stopPlace: { id: string; name: string } | null;
  } | null;
}

export interface TripPatternResponse {
  duration: number;
  aimedStartTime: string;
  aimedEndTime: string;
  legs: TripLegResponse[];
}

interface TripResponse {
  trip: { tripPatterns: TripPatternResponse[] };
}

function location(place: Place): string {
  if (place.stopPlaceId) return `{place: ${JSON.stringify(place.stopPlaceId)}}`;
  if (place.coordinates) {
    const { latitude, longitude } = place.coordinates;
    return `{coordinates: {latitude: ${latitude}, longitude: ${longitude}}, name: ${JSON.stringify(place.name)}}`;
  }
  throw new Error(`Place ${place.id} has neither a stop nor coordinates`);
}

export function buildTripQuery(params: TripSearchParams): string {
  const args = [
    `from: ${location(params.from)}`,
    `to: ${location(params.to)}`,
    `dateTime: ${JSON.stringify(params.dateTime)}`,
    'numTripPatterns: 25',
    `searchWindow: ${params.searchWindowMinutes ?? DEFAULT_SEARCH_WINDOW_MINUTES}`,
    'ignoreRealtimeUpdates: true',
    `whiteListed: {authorities: ${JSON.stringify(TICKET_AUTHORITIES)}}`,
  ];
  if (params.maximumAdditionalTransfers !== undefined) {
    args.push(`maximumAdditionalTransfers: ${params.maximumAdditionalTransfers}`);
  }
  if (params.transferPenalty !== undefined) args.push(`transferPenalty: ${params.transferPenalty}`);
  if (params.walkReluctance !== undefined) args.push(`walkReluctance: ${params.walkReluctance}`);
  if (params.bannedLines?.length) {
    args.push(`banned: {lines: ${JSON.stringify(params.bannedLines)}}`);
  }
  if (params.viaStopPlaceId) {
    args.push(`via: [{visit: {stopLocationIds: [${JSON.stringify(params.viaStopPlaceId)}]}}]`);
  }
  if (params.onFoot) args.push('modes: {directMode: foot, transportModes: []}');

  return `{
  trip(${args.join(', ')}) {
    tripPatterns {
      duration
      aimedStartTime
      aimedEndTime
      legs {
        mode
        distance
        duration
        line { id publicCode }
        fromPlace { name quay { id publicCode stopPlace { id name } } }
        toPlace { name quay { id publicCode stopPlace { id name } } }
      }
    }
  }
}`;
}

export async function searchTrips(
  params: TripSearchParams,
  options: EnturQueryOptions = {},
): Promise<TripPatternResponse[]> {
  const response = await enturQuery<TripResponse>('trip_mapping', buildTripQuery(params), {}, options);
  return response.trip.tripPatterns;
}
