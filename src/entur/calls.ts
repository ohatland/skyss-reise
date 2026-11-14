import { enturQuery, type EnturQueryOptions } from '@/entur/client';
import { TICKET_AUTHORITIES } from '@/mapping/query';

/** Entur's typical delay for one journey at one stop, from history. */
export interface TypicalDelay {
  /** The median: half the days are better than this. */
  p50Seconds: number;
  /** A bad day: nine days in ten are better than this. */
  p90Seconds: number;
}

/** One visit by a vehicle to a stop: when it arrives and leaves, by timetable and by Entur's forecast. */
export interface StopCall {
  stopPlaceId: string;
  quayId: string;
  /** Platform letter where the stop has one, otherwise null. */
  platform: string | null;
  serviceJourneyId: string;
  /** Service date of the journey, YYYY-MM-DD. With the journey id it identifies one run of a vehicle. */
  date: string;
  line: string;
  transportMode: string;
  destination: string;
  /** Where this stop comes in the journey; it grows along the route. */
  position: number;
  /** Timetable and forecast, ISO 8601 with offset. The forecast equals the timetable when Entur has nothing better. */
  aimedArrival: string;
  expectedArrival: string;
  aimedDeparture: string;
  expectedDeparture: string;
  /** Entur's flag. It is also set for journeys that have not started, whose forecast is then the timetable. */
  realtime: boolean;
  cancelled: boolean;
  predictionInaccurate: boolean;
  forBoarding: boolean;
  forAlighting: boolean;
  /** True once the vehicle is recorded as having left the first stop of the journey. */
  started: boolean;
  typicalDelay: TypicalDelay | null;
}

/** How far ahead calls are fetched. A trip takes up to two hours, so this covers departures within the next hour. */
export const CALLS_TIME_RANGE_SECONDS = 3 * 60 * 60;

/** More calls than any stop has on the chosen lines within the time range, so nothing is cut off. */
const MAX_CALLS_PER_STOP = 1000;

const LINE_IDS_QUERY = /* GraphQL */ `
  query LineIds($codes: [String], $authorities: [String]) {
    lines(publicCodes: $codes, authorities: $authorities) {
      id
      publicCode
    }
  }
`;

interface LineIdsResponse {
  lines: { id: string; publicCode: string | null }[];
}

/**
 * Entur's ids for the lines with these public codes, among the lines the period
 * ticket covers. Calls can only be filtered by line id, and saved legs hold codes.
 */
export async function fetchLineIds(publicCodes: string[], options: EnturQueryOptions = {}): Promise<string[]> {
  if (publicCodes.length === 0) return [];
  const response = await enturQuery<LineIdsResponse>(
    'line_ids',
    LINE_IDS_QUERY,
    { codes: publicCodes, authorities: TICKET_AUTHORITIES },
    options,
  );
  const wanted = new Set(publicCodes);
  return response.lines.filter((line) => line.publicCode !== null && wanted.has(line.publicCode)).map((line) => line.id);
}

const STOP_CALLS_QUERY = /* GraphQL */ `
  query StopCalls($ids: [String], $lines: [ID!], $start: DateTime, $range: Int, $count: Int) {
    stopPlaces(ids: $ids) {
      id
      estimatedCalls(
        startTime: $start
        timeRange: $range
        numberOfDepartures: $count
        arrivalDeparture: both
        includeCancelledTrips: true
        filters: [{ select: [{ lines: $lines }] }]
      ) {
        date
        aimedArrivalTime
        expectedArrivalTime
        aimedDepartureTime
        expectedDepartureTime
        realtime
        cancellation
        predictionInaccurate
        forBoarding
        forAlighting
        stopPositionInPattern
        empiricalDelay {
          p50
          p90
        }
        quay {
          id
          publicCode
        }
        destinationDisplay {
          frontText
        }
        serviceJourney {
          id
          line {
            publicCode
            transportMode
          }
        }
        serviceJourneyEstimatedCalls {
          first {
            actualDepartureTime
          }
        }
      }
    }
  }
`;

interface CallResponse {
  date: string;
  aimedArrivalTime: string;
  expectedArrivalTime: string;
  aimedDepartureTime: string;
  expectedDepartureTime: string;
  realtime: boolean;
  cancellation: boolean;
  predictionInaccurate: boolean;
  forBoarding: boolean;
  forAlighting: boolean;
  stopPositionInPattern: number;
  empiricalDelay: { p50: string | null; p90: string | null } | null;
  quay: { id: string; publicCode: string | null };
  destinationDisplay: { frontText: string | null } | null;
  serviceJourney: { id: string; line: { publicCode: string | null; transportMode: string } };
  serviceJourneyEstimatedCalls: { first: { actualDepartureTime: string | null } | null } | null;
}

export interface StopCallsResponse {
  /** Entur answers null for an id it does not know. */
  stopPlaces: ({ id: string; estimatedCalls: CallResponse[] } | null)[];
}

/**
 * Seconds in an ISO 8601 duration of hours, minutes and seconds, such as "PT1M30S".
 * A minus sign may stand in front or on each part. Null when the text is something else.
 */
export function parseDurationSeconds(text: string | null | undefined): number | null {
  const match = /^(-)?PT(?:(-?\d+)H)?(?:(-?\d+)M)?(?:(-?\d+(?:\.\d+)?)S)?$/.exec(text ?? '');
  if (!match || match.slice(2).every((part) => part === undefined)) return null;
  const [, minus, hours = '0', minutes = '0', seconds = '0'] = match;
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  return minus ? -total : total;
}

function toTypicalDelay(delay: CallResponse['empiricalDelay']): TypicalDelay | null {
  const p50Seconds = parseDurationSeconds(delay?.p50);
  const p90Seconds = parseDurationSeconds(delay?.p90);
  return p50Seconds === null || p90Seconds === null ? null : { p50Seconds, p90Seconds };
}

export function toStopCalls(response: StopCallsResponse): StopCall[] {
  const known = response.stopPlaces.flatMap((stop) => (stop ? [stop] : []));
  return known.flatMap((stop) =>
    stop.estimatedCalls.map((call) => ({
      stopPlaceId: stop.id,
      quayId: call.quay.id,
      platform: call.quay.publicCode || null,
      serviceJourneyId: call.serviceJourney.id,
      date: call.date,
      line: call.serviceJourney.line.publicCode ?? '',
      transportMode: call.serviceJourney.line.transportMode,
      destination: call.destinationDisplay?.frontText ?? '',
      position: call.stopPositionInPattern,
      aimedArrival: call.aimedArrivalTime,
      expectedArrival: call.expectedArrivalTime,
      aimedDeparture: call.aimedDepartureTime,
      expectedDeparture: call.expectedDepartureTime,
      realtime: call.realtime,
      cancelled: call.cancellation,
      predictionInaccurate: call.predictionInaccurate,
      forBoarding: call.forBoarding,
      forAlighting: call.forAlighting,
      started: Boolean(call.serviceJourneyEstimatedCalls?.first?.actualDepartureTime),
      typicalDelay: toTypicalDelay(call.empiricalDelay),
    })),
  );
}

/**
 * Every arrival and departure on the given lines at the given stops from `start`
 * and three hours on, in one request. Cancelled calls are included and flagged.
 */
export async function fetchStopCalls(
  stopPlaceIds: string[],
  lineIds: string[],
  start: Date,
  options: EnturQueryOptions = {},
): Promise<StopCall[]> {
  // Entur does not accept an empty list of lines, and without stops there is nothing to ask for.
  if (stopPlaceIds.length === 0 || lineIds.length === 0) return [];
  const response = await enturQuery<StopCallsResponse>(
    'stop_calls',
    STOP_CALLS_QUERY,
    {
      ids: stopPlaceIds,
      lines: lineIds,
      start: start.toISOString(),
      range: CALLS_TIME_RANGE_SECONDS,
      count: MAX_CALLS_PER_STOP,
    },
    options,
  );
  return toStopCalls(response);
}
