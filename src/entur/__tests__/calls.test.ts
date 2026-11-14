import { fetchLineIds, fetchStopCalls, parseDurationSeconds, toStopCalls, type StopCallsResponse } from '@/entur/calls';
import { setLogSinks } from '@/logging/logger';

const call = {
  date: '2026-11-14',
  aimedArrivalTime: '2026-11-14T13:28:00+01:00',
  expectedArrivalTime: '2026-11-14T13:28:16+01:00',
  aimedDepartureTime: '2026-11-14T13:28:00+01:00',
  expectedDepartureTime: '2026-11-14T13:28:41+01:00',
  realtime: true,
  cancellation: false,
  predictionInaccurate: false,
  forBoarding: true,
  forAlighting: true,
  stopPositionInPattern: 27,
  empiricalDelay: { p50: 'PT1M', p90: 'PT4M30S' },
  quay: { id: 'NSR:Quay:55120', publicCode: 'B' },
  destinationDisplay: { frontText: 'Bergen busstasjon' },
  serviceJourney: { id: 'SKY:ServiceJourney:400-210464-20955213', line: { publicCode: '400', transportMode: 'bus' } },
  serviceJourneyEstimatedCalls: { first: { actualDepartureTime: '2026-11-14T12:57:12+01:00' } },
};

type CallsFromEntur = NonNullable<StopCallsResponse['stopPlaces'][number]>['estimatedCalls'];

const response = (calls: CallsFromEntur): StopCallsResponse => ({
  stopPlaces: [{ id: 'NSR:StopPlace:31984', estimatedCalls: calls }],
});

/** A fetch that answers with the given bodies in turn and records what it was asked. */
function answering(...bodies: unknown[]) {
  const asked: { query: string; variables: Record<string, unknown> }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    asked.push(JSON.parse(init.body as string));
    return { ok: true, status: 200, json: async () => ({ data: bodies[asked.length - 1] }) } as Response;
  }) as unknown as typeof fetch;
  return { asked, fetchImpl };
}

beforeEach(() => setLogSinks([]));

describe('parseDurationSeconds', () => {
  it('reads hours, minutes and seconds', () => {
    expect(parseDurationSeconds('PT0S')).toBe(0);
    expect(parseDurationSeconds('PT1M')).toBe(60);
    expect(parseDurationSeconds('PT4M30S')).toBe(270);
    expect(parseDurationSeconds('PT1H2M3S')).toBe(3723);
    expect(parseDurationSeconds('PT45S')).toBe(45);
  });

  it('reads a vehicle that is typically early, with the minus sign in either place', () => {
    expect(parseDurationSeconds('-PT1M30S')).toBe(-90);
    expect(parseDurationSeconds('PT-1M-30S')).toBe(-90);
  });

  it('is null for anything else', () => {
    expect(parseDurationSeconds(null)).toBeNull();
    expect(parseDurationSeconds(undefined)).toBeNull();
    expect(parseDurationSeconds('')).toBeNull();
    expect(parseDurationSeconds('PT')).toBeNull();
    expect(parseDurationSeconds('P1D')).toBeNull();
    expect(parseDurationSeconds('1 min')).toBeNull();
  });
});

describe('toStopCalls', () => {
  it('maps a call from Entur', () => {
    expect(toStopCalls(response([call]))).toEqual([
      {
        stopPlaceId: 'NSR:StopPlace:31984',
        quayId: 'NSR:Quay:55120',
        platform: 'B',
        serviceJourneyId: 'SKY:ServiceJourney:400-210464-20955213',
        date: '2026-11-14',
        line: '400',
        transportMode: 'bus',
        destination: 'Bergen busstasjon',
        position: 27,
        aimedArrival: '2026-11-14T13:28:00+01:00',
        expectedArrival: '2026-11-14T13:28:16+01:00',
        aimedDeparture: '2026-11-14T13:28:00+01:00',
        expectedDeparture: '2026-11-14T13:28:41+01:00',
        realtime: true,
        cancelled: false,
        predictionInaccurate: false,
        forBoarding: true,
        forAlighting: true,
        started: true,
        typicalDelay: { p50Seconds: 60, p90Seconds: 270 },
      },
    ]);
  });

  it('takes a journey as not started until it has left its first stop', () => {
    const waiting = { ...call, serviceJourneyEstimatedCalls: { first: { actualDepartureTime: null } } };
    const unknown = { ...call, serviceJourneyEstimatedCalls: null };
    expect(toStopCalls(response([waiting, unknown])).map((c) => c.started)).toEqual([false, false]);
  });

  it('has no platform where the stop has no letters, and no typical delay where Entur has none', () => {
    const plain = { ...call, quay: { id: 'NSR:Quay:56166', publicCode: '' }, empiricalDelay: null };
    expect(toStopCalls(response([plain]))[0]).toMatchObject({ platform: null, typicalDelay: null });
  });

  it('skips a stop Entur does not know', () => {
    expect(toStopCalls({ stopPlaces: [null, { id: 'NSR:StopPlace:31984', estimatedCalls: [call] }] })).toHaveLength(1);
  });
});

describe('fetchStopCalls', () => {
  it('asks for arrivals and departures of the lines at the stops, from the given moment', async () => {
    const { asked, fetchImpl } = answering(response([call]));
    const calls = await fetchStopCalls(
      ['NSR:StopPlace:31984', 'NSR:StopPlace:32541'],
      ['SKY:Line:400'],
      new Date('2026-11-14T12:04:49.487Z'),
      { fetchImpl },
    );

    expect(calls).toHaveLength(1);
    expect(asked).toHaveLength(1);
    expect(asked[0].variables).toEqual({
      ids: ['NSR:StopPlace:31984', 'NSR:StopPlace:32541'],
      lines: ['SKY:Line:400'],
      start: '2026-11-14T12:04:49.487Z',
      range: 10800,
      count: 1000,
    });
    expect(asked[0].query).toContain('arrivalDeparture: both');
    expect(asked[0].query).toContain('includeCancelledTrips: true');
  });

  it('asks nothing when there are no stops or no lines', async () => {
    const { asked, fetchImpl } = answering();
    expect(await fetchStopCalls([], ['SKY:Line:400'], new Date(), { fetchImpl })).toEqual([]);
    expect(await fetchStopCalls(['NSR:StopPlace:31984'], [], new Date(), { fetchImpl })).toEqual([]);
    expect(asked).toEqual([]);
  });
});

describe('fetchLineIds', () => {
  it('looks the codes up among the lines the period ticket covers', async () => {
    const { asked, fetchImpl } = answering({
      lines: [
        { id: 'SKY:Line:400', publicCode: '400' },
        { id: 'SKY:Line:1', publicCode: '1' },
        { id: 'SKY:Line:999', publicCode: null },
      ],
    });
    expect(await fetchLineIds(['1', '400'], { fetchImpl })).toEqual(['SKY:Line:400', 'SKY:Line:1']);
    expect(asked[0].variables).toEqual({ codes: ['1', '400'], authorities: ['SKY:Authority:SKY', 'VYG:Authority:VYT'] });
  });

  it('asks nothing for no codes', async () => {
    const { asked, fetchImpl } = answering();
    expect(await fetchLineIds([], { fetchImpl })).toEqual([]);
    expect(asked).toEqual([]);
  });
});
