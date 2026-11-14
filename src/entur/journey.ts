import { parseDurationSeconds, type StopCall } from '@/entur/calls';
import { enturQuery, type EnturQueryOptions } from '@/entur/client';

/**
 * One visit of a followed vehicle to a stop. Unlike the calls fetched per stop,
 * these cover the whole journey, also the stops the vehicle has passed, with
 * the times it was actually there.
 */
export interface JourneyCall extends StopCall {
  stopName: string;
  /** When the vehicle actually arrived and left. Null until Entur has recorded it. */
  actualArrival: string | null;
  actualDeparture: string | null;
}

const JOURNEY_CALLS_QUERY = /* GraphQL */ `
  query JourneyCalls($id: String!, $date: Date) {
    serviceJourney(id: $id) {
      id
      line {
        publicCode
        transportMode
      }
      estimatedCalls(date: $date) {
        aimedArrivalTime
        expectedArrivalTime
        actualArrivalTime
        aimedDepartureTime
        expectedDepartureTime
        actualDepartureTime
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
          name
          stopPlace {
            id
            name
          }
        }
        destinationDisplay {
          frontText
        }
      }
    }
  }
`;

interface JourneyCallResponse {
  aimedArrivalTime: string;
  expectedArrivalTime: string;
  actualArrivalTime: string | null;
  aimedDepartureTime: string;
  expectedDepartureTime: string;
  actualDepartureTime: string | null;
  realtime: boolean;
  cancellation: boolean;
  predictionInaccurate: boolean;
  forBoarding: boolean;
  forAlighting: boolean;
  stopPositionInPattern: number;
  empiricalDelay: { p50: string | null; p90: string | null } | null;
  quay: {
    id: string;
    publicCode: string | null;
    name: string;
    stopPlace: { id: string; name: string } | null;
  };
  destinationDisplay: { frontText: string | null } | null;
}

export interface JourneyCallsResponse {
  /** Entur answers null for a journey it does not know. */
  serviceJourney: {
    id: string;
    line: { publicCode: string | null; transportMode: string };
    estimatedCalls: JourneyCallResponse[] | null;
  } | null;
}

export function toJourneyCalls(response: JourneyCallsResponse, date: string): JourneyCall[] {
  const journey = response.serviceJourney;
  if (!journey) return [];
  const calls = [...(journey.estimatedCalls ?? [])].sort((a, b) => a.stopPositionInPattern - b.stopPositionInPattern);
  const started = Boolean(calls[0]?.actualDepartureTime);

  return calls.map((call) => {
    const p50Seconds = parseDurationSeconds(call.empiricalDelay?.p50);
    const p90Seconds = parseDurationSeconds(call.empiricalDelay?.p90);
    return {
      stopPlaceId: call.quay.stopPlace?.id ?? call.quay.id,
      stopName: call.quay.stopPlace?.name ?? call.quay.name,
      quayId: call.quay.id,
      platform: call.quay.publicCode || null,
      serviceJourneyId: journey.id,
      date,
      line: journey.line.publicCode ?? '',
      transportMode: journey.line.transportMode,
      destination: call.destinationDisplay?.frontText ?? '',
      position: call.stopPositionInPattern,
      aimedArrival: call.aimedArrivalTime,
      expectedArrival: call.expectedArrivalTime,
      actualArrival: call.actualArrivalTime,
      aimedDeparture: call.aimedDepartureTime,
      expectedDeparture: call.expectedDepartureTime,
      actualDeparture: call.actualDepartureTime,
      realtime: call.realtime,
      cancelled: call.cancellation,
      predictionInaccurate: call.predictionInaccurate,
      forBoarding: call.forBoarding,
      forAlighting: call.forAlighting,
      started,
      typicalDelay: p50Seconds === null || p90Seconds === null ? null : { p50Seconds, p90Seconds },
    };
  });
}

/**
 * Every stop of one run of a vehicle, in order: the journey with this id on
 * this service date. The stops it has passed come with the times it was there.
 * Empty when Entur does not know the journey.
 */
export async function fetchJourneyCalls(
  serviceJourneyId: string,
  date: string,
  options: EnturQueryOptions = {},
): Promise<JourneyCall[]> {
  const response = await enturQuery<JourneyCallsResponse>(
    'journey_calls',
    JOURNEY_CALLS_QUERY,
    { id: serviceJourneyId, date },
    options,
  );
  return toJourneyCalls(response, date);
}
