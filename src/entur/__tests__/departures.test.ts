import { EnturError, enturQuery } from '@/entur/client';
import { fetchDepartures, toDepartureBoard } from '@/entur/departures';
import { setLogSinks } from '@/logging/logger';

const call = {
  aimedDepartureTime: '2026-11-13T17:47:00+01:00',
  expectedDepartureTime: '2026-11-13T17:49:26+01:00',
  realtime: true,
  cancellation: false,
  predictionInaccurate: false,
  destinationDisplay: { frontText: 'Bergen busstasjon' },
  quay: { id: 'NSR:Quay:55921', publicCode: '' },
  serviceJourney: {
    id: 'SKY:ServiceJourney:400-210935-20946589',
    line: { publicCode: '400', transportMode: 'bus' },
  },
};

function respondWith(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response) as typeof fetch;
}

beforeEach(() => setLogSinks([]));

describe('toDepartureBoard', () => {
  it('maps a call from Entur to a departure', () => {
    const board = toDepartureBoard(
      { stopPlace: { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet', estimatedCalls: [call] } },
      'NSR:StopPlace:32541',
    );

    expect(board.stopName).toBe('Krokåsskiftet');
    expect(board.departures).toEqual([
      {
        serviceJourneyId: 'SKY:ServiceJourney:400-210935-20946589',
        line: '400',
        transportMode: 'bus',
        destination: 'Bergen busstasjon',
        aimedTime: '2026-11-13T17:47:00+01:00',
        expectedTime: '2026-11-13T17:49:26+01:00',
        realtime: true,
        cancelled: false,
        predictionInaccurate: false,
        quayId: 'NSR:Quay:55921',
        platform: null,
      },
    ]);
  });

  it('keeps the platform letter where the stop has one', () => {
    const board = toDepartureBoard(
      {
        stopPlace: {
          id: 'NSR:StopPlace:59849',
          name: 'Lagunen terminal',
          estimatedCalls: [{ ...call, quay: { id: 'NSR:Quay:51876', publicCode: 'K' } }],
        },
      },
      'NSR:StopPlace:59849',
    );
    expect(board.departures[0].platform).toBe('K');
  });

  it('fails clearly when the stop place does not exist', () => {
    expect(() => toDepartureBoard({ stopPlace: null }, 'NSR:StopPlace:0')).toThrow('NSR:StopPlace:0');
  });
});

describe('enturQuery', () => {
  it('sends the query with the client name header', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ data: { ok: true } }) } as Response;
    }) as unknown as typeof fetch;

    const data = await enturQuery<{ ok: boolean }>('test', '{ ok }', { a: 1 }, { fetchImpl });

    expect(data).toEqual({ ok: true });
    expect(seen[0].url).toBe('https://api.entur.io/journey-planner/v3/graphql');
    expect((seen[0].init.headers as Record<string, string>)['ET-Client-Name']).toBeTruthy();
    expect(JSON.parse(seen[0].init.body as string)).toEqual({ query: '{ ok }', variables: { a: 1 } });
  });

  it('throws on an HTTP error', async () => {
    await expect(
      enturQuery('test', '{ ok }', {}, { fetchImpl: respondWith({}, 503) }),
    ).rejects.toMatchObject({ name: 'EnturError', status: 503, operation: 'test' });
  });

  it('throws on a GraphQL error', async () => {
    await expect(
      enturQuery('test', '{ ok }', {}, { fetchImpl: respondWith({ errors: [{ message: 'Unknown field' }] }) }),
    ).rejects.toThrow(EnturError);
  });

  it('logs every call with duration and outcome', async () => {
    const events: { name: string; ok: unknown }[] = [];
    setLogSinks([{ event: (name, p) => events.push({ name, ok: p.ok }), error: () => {} }]);

    await enturQuery('test', '{ ok }', {}, { fetchImpl: respondWith({ data: {} }) });
    await enturQuery('test', '{ ok }', {}, { fetchImpl: respondWith({}, 500) }).catch(() => {});

    expect(events).toEqual([
      { name: 'entur_call', ok: true },
      { name: 'entur_call', ok: false },
    ]);
  });
});

describe('fetchDepartures', () => {
  it('returns the board for the stop', async () => {
    const board = await fetchDepartures('NSR:StopPlace:32541', 5, {
      fetchImpl: respondWith({
        data: { stopPlace: { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet', estimatedCalls: [call] } },
      }),
    });
    expect(board.departures).toHaveLength(1);
    expect(board.departures[0].line).toBe('400');
  });
});
