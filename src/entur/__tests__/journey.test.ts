import { fetchJourneyCalls, toJourneyCalls, type JourneyCallsResponse } from '@/entur/journey';
import { setLogSinks } from '@/logging/logger';

type CallFromEntur = NonNullable<NonNullable<JourneyCallsResponse['serviceJourney']>['estimatedCalls']>[number];

/** Two stops of the 400 as Entur gave them on 14 November 2026: one it had left, and one ahead. */
const left: CallFromEntur = {
  aimedArrivalTime: '2026-11-14T16:37:00+01:00',
  expectedArrivalTime: '2026-11-14T16:35:40+01:00',
  actualArrivalTime: '2026-11-14T16:35:40+01:00',
  aimedDepartureTime: '2026-11-14T16:39:00+01:00',
  expectedDepartureTime: '2026-11-14T16:40:06+01:00',
  actualDepartureTime: '2026-11-14T16:40:06+01:00',
  realtime: true,
  cancellation: false,
  predictionInaccurate: false,
  forBoarding: true,
  forAlighting: true,
  stopPositionInPattern: 18,
  empiricalDelay: { p50: 'PT0S', p90: 'PT1M' },
  quay: { id: 'NSR:Quay:55094', publicCode: 'A', name: 'Kleppestø terminal', stopPlace: { id: 'NSR:StopPlace:30815', name: 'Kleppestø terminal' } },
  destinationDisplay: { frontText: 'Bergen busstasjon' },
};
const ahead: CallFromEntur = {
  aimedArrivalTime: '2026-11-14T16:59:00+01:00',
  expectedArrivalTime: '2026-11-14T16:57:48+01:00',
  actualArrivalTime: null,
  aimedDepartureTime: '2026-11-14T16:59:00+01:00',
  expectedDepartureTime: '2026-11-14T16:58:06+01:00',
  actualDepartureTime: null,
  realtime: true,
  cancellation: false,
  predictionInaccurate: false,
  forBoarding: true,
  forAlighting: true,
  stopPositionInPattern: 25,
  empiricalDelay: null,
  quay: { id: 'NSR:Quay:53150', publicCode: '', name: 'Møhlenpris', stopPlace: { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' } },
  destinationDisplay: { frontText: 'Bergen busstasjon' },
};

const response = (calls: CallFromEntur[] | null): JourneyCallsResponse => ({
  serviceJourney: { id: 'SKY:ServiceJourney:400-210464-22175438', line: { publicCode: '400', transportMode: 'bus' }, estimatedCalls: calls },
});

beforeEach(() => setLogSinks([]));

describe('toJourneyCalls', () => {
  it('reads every stop of the journey, with the times the vehicle was there', () => {
    expect(toJourneyCalls(response([left, ahead]), '2026-11-14')).toEqual([
      {
        stopPlaceId: 'NSR:StopPlace:30815',
        stopName: 'Kleppestø terminal',
        quayId: 'NSR:Quay:55094',
        platform: 'A',
        serviceJourneyId: 'SKY:ServiceJourney:400-210464-22175438',
        date: '2026-11-14',
        line: '400',
        transportMode: 'bus',
        destination: 'Bergen busstasjon',
        position: 18,
        aimedArrival: '2026-11-14T16:37:00+01:00',
        expectedArrival: '2026-11-14T16:35:40+01:00',
        actualArrival: '2026-11-14T16:35:40+01:00',
        aimedDeparture: '2026-11-14T16:39:00+01:00',
        expectedDeparture: '2026-11-14T16:40:06+01:00',
        actualDeparture: '2026-11-14T16:40:06+01:00',
        realtime: true,
        cancelled: false,
        predictionInaccurate: false,
        forBoarding: true,
        forAlighting: true,
        started: true,
        typicalDelay: { p50Seconds: 0, p90Seconds: 60 },
      },
      expect.objectContaining({
        stopPlaceId: 'NSR:StopPlace:30918',
        stopName: 'Møhlenpris',
        // A stop without platform letters comes with an empty one.
        platform: null,
        actualArrival: null,
        actualDeparture: null,
        started: true,
        typicalDelay: null,
      }),
    ]);
  });

  it('puts the stops in the order the vehicle visits them', () => {
    expect(toJourneyCalls(response([ahead, left]), '2026-11-14').map((call) => call.position)).toEqual([18, 25]);
  });

  it('has the vehicle started once it has left the first stop of its journey', () => {
    const waiting = { ...left, actualArrivalTime: null, actualDepartureTime: null };
    expect(toJourneyCalls(response([waiting, ahead]), '2026-11-14').map((call) => call.started)).toEqual([false, false]);
    // Measured as arrived at its first stop, it has still not left.
    const standing = { ...left, actualDepartureTime: null };
    expect(toJourneyCalls(response([standing, ahead]), '2026-11-14').map((call) => call.started)).toEqual([false, false]);
  });

  it('falls back on the quay where Entur gives no stop place', () => {
    const [call] = toJourneyCalls(response([{ ...ahead, quay: { ...ahead.quay, stopPlace: null } }]), '2026-11-14');
    expect(call).toMatchObject({ stopPlaceId: 'NSR:Quay:53150', stopName: 'Møhlenpris' });
  });

  it('gives nothing for a journey Entur does not know, or one without calls', () => {
    expect(toJourneyCalls({ serviceJourney: null }, '2026-11-14')).toEqual([]);
    expect(toJourneyCalls(response(null), '2026-11-14')).toEqual([]);
    expect(toJourneyCalls(response([]), '2026-11-14')).toEqual([]);
  });
});

describe('fetchJourneyCalls', () => {
  it('asks for the journey on its service date', async () => {
    const asked: { query: string; variables: Record<string, unknown> }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      asked.push(JSON.parse(init.body as string));
      return { ok: true, status: 200, json: async () => ({ data: response([left, ahead]) }) } as Response;
    }) as unknown as typeof fetch;

    const calls = await fetchJourneyCalls('SKY:ServiceJourney:400-210464-22175438', '2026-11-14', { fetchImpl });

    expect(calls).toHaveLength(2);
    expect(asked).toHaveLength(1);
    expect(asked[0].variables).toEqual({ id: 'SKY:ServiceJourney:400-210464-22175438', date: '2026-11-14' });
    expect(asked[0].query).toContain('estimatedCalls(date: $date)');
    expect(asked[0].query).toContain('actualArrivalTime');
  });

  it('throws when Entur does not answer', async () => {
    const failing = (async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(fetchJourneyCalls('x', '2026-11-14', { fetchImpl: failing })).rejects.toThrow('500');
  });
});
