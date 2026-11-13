import { enturQuery, type EnturQueryOptions } from '@/entur/client';

export interface Departure {
  serviceJourneyId: string;
  line: string;
  transportMode: string;
  destination: string;
  /** Scheduled departure, ISO 8601 with offset. */
  aimedTime: string;
  /** Entur's forecast, equal to aimedTime when there is no real-time data. */
  expectedTime: string;
  realtime: boolean;
  cancelled: boolean;
  predictionInaccurate: boolean;
  quayId: string;
  /** Platform letter where the stop has one, otherwise null. */
  platform: string | null;
}

export interface DepartureBoard {
  stopPlaceId: string;
  stopName: string;
  departures: Departure[];
}

const DEPARTURES_QUERY = /* GraphQL */ `
  query Departures($id: String!, $count: Int!, $timeRange: Int!) {
    stopPlace(id: $id) {
      id
      name
      estimatedCalls(numberOfDepartures: $count, timeRange: $timeRange, includeCancelledTrips: true) {
        aimedDepartureTime
        expectedDepartureTime
        realtime
        cancellation
        predictionInaccurate
        destinationDisplay {
          frontText
        }
        quay {
          id
          publicCode
        }
        serviceJourney {
          id
          line {
            publicCode
            transportMode
          }
        }
      }
    }
  }
`;

interface DeparturesResponse {
  stopPlace: {
    id: string;
    name: string;
    estimatedCalls: {
      aimedDepartureTime: string;
      expectedDepartureTime: string;
      realtime: boolean;
      cancellation: boolean;
      predictionInaccurate: boolean;
      destinationDisplay: { frontText: string | null } | null;
      quay: { id: string; publicCode: string | null };
      serviceJourney: { id: string; line: { publicCode: string | null; transportMode: string } };
    }[];
  } | null;
}

export function toDepartureBoard(response: DeparturesResponse, stopPlaceId: string): DepartureBoard {
  const stop = response.stopPlace;
  if (!stop) {
    throw new Error(`Entur has no stop place ${stopPlaceId}`);
  }
  return {
    stopPlaceId: stop.id,
    stopName: stop.name,
    departures: stop.estimatedCalls.map((call) => ({
      serviceJourneyId: call.serviceJourney.id,
      line: call.serviceJourney.line.publicCode ?? '',
      transportMode: call.serviceJourney.line.transportMode,
      destination: call.destinationDisplay?.frontText ?? '',
      aimedTime: call.aimedDepartureTime,
      expectedTime: call.expectedDepartureTime,
      realtime: call.realtime,
      cancelled: call.cancellation,
      predictionInaccurate: call.predictionInaccurate,
      quayId: call.quay.id,
      platform: call.quay.publicCode || null,
    })),
  };
}

export async function fetchDepartures(
  stopPlaceId: string,
  count = 12,
  options: EnturQueryOptions = {},
): Promise<DepartureBoard> {
  const response = await enturQuery<DeparturesResponse>(
    'departures',
    DEPARTURES_QUERY,
    { id: stopPlaceId, count, timeRange: 2 * 60 * 60 },
    options,
  );
  return toDepartureBoard(response, stopPlaceId);
}
