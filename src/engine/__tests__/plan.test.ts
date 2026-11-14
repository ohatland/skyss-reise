import AsyncStorage from '@react-native-async-storage/async-storage';

import { formatClock } from '@/core/time';
import { MISSED_GRACE_SECONDS, formatMargin } from '@/core/transfer';
import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import { callsNeeded, planFromCalls, planTrips } from '@/engine/plan';
import type { PlannedTrip } from '@/engine/trips';
import type { StopCall, StopCallsResponse } from '@/entur/calls';
import { setLogSinks } from '@/logging/logger';
import type { Alternative, Connection, StopRef } from '@/model/types';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const grana = stop('Grana');
const birkelandsskiftet = stop('Birkelandsskiftet');
const kokstadskiftet = stop('Kokstadskiftet');
const dolvik = stop('Dolvik');
const mohlenpris = stop('Møhlenpris');
const storavatnet = stop('Storavatnet');
const frieda = stop('Frieda Fasmer');
const blomsterdalen = stop('Blomsterdalen');

const fromWork: Alternative[] = [
  {
    key: 'mohlenpris',
    tripType: 'fromWork',
    legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)],
  },
  {
    key: 'kokstad',
    tripType: 'fromWork',
    legs: [ride('23E', kokstadskiftet, storavatnet), ride('400, 410', storavatnet, krokasskiftet)],
  },
];
const toWork: Alternative[] = [
  {
    key: 'blomsterdalen',
    tripType: 'toWork',
    legs: [ride('400, 410', krokasskiftet, frieda), ride('23E', frieda, dolvik), ride('51', dolvik, blomsterdalen)],
  },
  {
    key: 'kokstad',
    tripType: 'toWork',
    legs: [ride('400, 410', krokasskiftet, frieda), ride('23E', frieda, kokstadskiftet)],
  },
];
const connections: Connection[] = [
  { key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] },
  { key: 'bus-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, grana, 240), ride('57', grana, birkelandsskiftet)] },
  { key: 'walk-kokstad', tripType: 'fromWork', anchor: kokstadskiftet, legs: [walk(work, kokstadskiftet, 1320)] },
  { key: 'from-blomsterdalen', tripType: 'toWork', anchor: blomsterdalen, legs: [walk(blomsterdalen, work, 660)] },
  { key: 'from-kokstad', tripType: 'toWork', anchor: kokstadskiftet, legs: [walk(kokstadskiftet, work, 1320)] },
];
const routes: SavedRoutes = {
  alternatives: [...fromWork, ...toWork],
  connections,
  transferWalks: [transferWalk(birkelandsskiftet, 'C', birkelandsskiftet, 'D', 60)],
  walkOverrides: {},
};

/** The afternoon in the approved sketch: the 57 and the walk both reach the same 50E. */
const afternoon: StopCall[] = [
  ...journey('57', '57', [[grana, '15:21', { expected: '15:23' }], [birkelandsskiftet, '15:25', { expected: '15:26:40', platform: 'C' }]]),
  ...journey('50E', '50E', [[birkelandsskiftet, '15:29', { platform: 'D' }], [mohlenpris, '15:57', { expected: '15:57:50' }]]),
  ...journey('410', '410', [[mohlenpris, '16:00'], [krokasskiftet, '16:35']]),
  ...journey('23E', '23E', [[kokstadskiftet, '16:03'], [storavatnet, '16:30', { platform: 'B' }]], { realtime: false, started: false }),
  ...journey('400', '400', [[storavatnet, '16:35:40', { platform: 'B' }], [krokasskiftet, '17:07']]),
];

const morning: StopCall[] = [
  ...journey('400', '400', [[krokasskiftet, '07:07', { expected: '07:09' }], [frieda, '07:31']]),
  ...journey('23E', '23E', [[frieda, '07:35'], [dolvik, '07:50', { platform: 'A' }], [kokstadskiftet, '08:05']]),
  ...journey('51', '51', [[dolvik, '07:55', { platform: 'B' }], [blomsterdalen, '08:05']]),
  ...journey('410', '410', [[krokasskiftet, '07:25'], [frieda, '07:49']], { realtime: false, started: false }),
  ...journey('23E-next', '23E', [[frieda, '07:53'], [dolvik, '08:08', { platform: 'A' }], [kokstadskiftet, '08:23']]),
];

/** A card as the screen is to show it: the two large times, then the table. */
function card(trip: PlannedTrip): string[] {
  const left = trip.leaveAt ? `Gå ${formatClock(trip.leaveAt)}` : `Avgang ${formatClock(trip.departure.expected)}`;
  return [
    `${left} – fremme ${formatClock(trip.arrival)}`,
    ...trip.rows.map((row) => {
      if (row.kind === 'walk') return `Gå ${row.position === 'end' ? `fra ${row.from.name}` : `til ${row.to.name}`} ${Math.round(row.seconds / 60)} min`;
      const where = row.fromPlatform ? `${row.from.name} ${row.fromPlatform}` : row.from.name;
      return `${row.line} ${where}${row.transfer ? ` ${formatMargin(row.transfer.marginSeconds)}` : ''}`;
    }),
  ];
}

beforeEach(() => setLogSinks([]));

describe('callsNeeded', () => {
  it('lists the stops and lines ridden, each once, and not the places walked to', () => {
    expect(callsNeeded(tripPaths(routes, 'fromWork'))).toEqual({
      stopPlaceIds: [
        'NSR:StopPlace:32541',
        'stop:Birkelandsskiftet',
        'stop:Grana',
        'stop:Kokstadskiftet',
        'stop:Møhlenpris',
        'stop:Storavatnet',
      ],
      lines: ['23E', '50E', '57', '400', '410'],
    });
  });
});

describe('planFromCalls', () => {
  it('gives one card per last vehicle home from work, by when the traveller is there', () => {
    const { shown: cards, hidden } = planFromCalls(tripPaths(routes, 'fromWork'), afternoon, routes, new Date(at('15:00')));

    expect(hidden).toEqual([]);
    expect(cards.map(card)).toEqual([
      // Two trips end on the same 410. The bus from Grana lets the traveller leave ten minutes later, so it is the card.
      ['Gå 15:19 – fremme 16:35', 'Gå til Grana 4 min', '57 Grana', '50E Birkelandsskiftet D 1:20', '410 Møhlenpris 2:10'],
      ['Gå 15:41 – fremme 17:07', 'Gå til Kokstadskiftet 22 min', '23E Kokstadskiftet', '400 Storavatnet B 5:40'],
    ]);
    expect(cards[0].alternatives.map(card)).toEqual([
      ['Gå 15:09 – fremme 16:35', 'Gå til Birkelandsskiftet 20 min', '50E Birkelandsskiftet D', '410 Møhlenpris 2:10'],
    ]);
    expect(cards[1].alternatives).toEqual([]);
    expect(cards[1].departureMarking).toEqual({ kind: 'scheduled' });
  });

  it('leaves out what the traveller can no longer reach', () => {
    const { shown: cards } = planFromCalls(tripPaths(routes, 'fromWork'), afternoon, routes, new Date(at('15:15')));
    expect(cards.map((trip) => card(trip)[0])).toEqual(['Gå 15:19 – fremme 16:35', 'Gå 15:41 – fremme 17:07']);
    expect(cards[0].alternatives).toEqual([]);
  });

  it('leaves out a trip with a transfer the forecast says is missed, unless told that it may still be caught', () => {
    // The 50E is now forecast at Møhlenpris ten seconds after the 410 has left.
    const late = afternoon.map((call) =>
      call.line === '50E' && call.stopPlaceId === mohlenpris.id ? { ...call, expectedArrival: at('16:00:10'), expectedDeparture: at('16:00:10') } : call,
    );
    const paths = tripPaths(routes, 'fromWork');

    const { shown: before } = planFromCalls(paths, late, routes, new Date(at('15:00')));
    expect(before.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07']);

    const { shown: onBoard } = planFromCalls(paths, late, routes, new Date(at('15:00')), { missedGraceSeconds: MISSED_GRACE_SECONDS });
    expect(onBoard.map(card)[0]).toEqual([
      'Gå 15:19 – fremme 16:35',
      'Gå til Grana 4 min',
      '57 Grana',
      '50E Birkelandsskiftet D 1:20',
      '410 Møhlenpris −0:10',
    ]);
  });

  it('gives the cards to work by when the traveller is at work, the walk included', () => {
    const { shown, hidden } = planFromCalls(tripPaths(routes, 'toWork'), morning, routes, new Date(at('07:00')));

    expect(shown.map(card)).toEqual([
      ['Avgang 07:09 – fremme 08:16', '400 Krokåsskiftet', '23E Frieda Fasmer 4:00', '51 Dolvik B 5:00', 'Gå fra Blomsterdalen 11 min'],
      ['Avgang 07:25 – fremme 08:45', '410 Krokåsskiftet', '23E Frieda Fasmer 4:00', 'Gå fra Kokstadskiftet 22 min'],
    ]);
    // The same departure gives another trip onward, ending on another vehicle. It is there later, so it is set aside.
    expect(hidden.map(card)).toEqual([
      ['Avgang 07:09 – fremme 08:27', '400 Krokåsskiftet', '23E Frieda Fasmer 4:00', 'Gå fra Kokstadskiftet 22 min'],
    ]);
    expect(shown[0].departureMarking).toEqual({ kind: 'deviation', scheduledClock: '07:07' });
    expect(shown[1].departureMarking).toEqual({ kind: 'scheduled' });
  });

  it('gives nothing without calls or without paths', () => {
    const nothing = { shown: [], hidden: [] };
    expect(planFromCalls(tripPaths(routes, 'toWork'), [], routes, new Date(at('07:00')))).toEqual(nothing);
    expect(planFromCalls([], morning, routes, new Date(at('07:00')))).toEqual(nothing);
  });
});

describe('planTrips', () => {
  const toResponse = (calls: StopCall[]): StopCallsResponse => {
    const stops = [...new Set(calls.map((call) => call.stopPlaceId))];
    return {
      stopPlaces: stops.map((id) => ({
        id,
        estimatedCalls: calls
          .filter((call) => call.stopPlaceId === id)
          .map((call) => ({
            date: call.date,
            aimedArrivalTime: call.aimedArrival,
            expectedArrivalTime: call.expectedArrival,
            aimedDepartureTime: call.aimedDeparture,
            expectedDepartureTime: call.expectedDeparture,
            realtime: call.realtime,
            cancellation: call.cancelled,
            predictionInaccurate: call.predictionInaccurate,
            forBoarding: call.forBoarding,
            forAlighting: call.forAlighting,
            stopPositionInPattern: call.position,
            empiricalDelay: null,
            quay: { id: call.quayId, publicCode: call.platform },
            destinationDisplay: { frontText: call.destination },
            serviceJourney: { id: call.serviceJourneyId, line: { publicCode: call.line, transportMode: call.transportMode } },
            serviceJourneyEstimatedCalls: { first: { actualDepartureTime: call.started ? call.aimedDeparture : null } },
          })),
      })),
    };
  };

  /** Entur as the engine sees it: it knows the lines and answers with the given calls. */
  function entur(calls: StopCall[]) {
    const asked: { operation: string; variables: Record<string, unknown> }[] = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const { query, variables } = JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
      const operation = query.includes('lines(') ? 'lines' : 'calls';
      asked.push({ operation, variables });
      const data =
        operation === 'lines'
          ? { lines: (variables.codes as string[]).map((code) => ({ id: `SKY:Line:${code}`, publicCode: code })) }
          : toResponse(calls);
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    }) as unknown as typeof fetch;
    return { asked, fetchImpl };
  }

  it('gives the ranked trips for a trip type at a moment', async () => {
    const { fetchImpl } = entur(afternoon);
    const plan = await planTrips('fromWork', new Date(at('15:00')), { routes, entur: { fetchImpl } });

    expect(plan.tripType).toBe('fromWork');
    expect(plan.at).toBe(new Date(at('15:00')).toISOString());
    expect(plan.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:19 – fremme 16:35', 'Gå 15:41 – fremme 17:07']);
    expect(plan.trips[0].alternatives.map((trip) => card(trip)[0])).toEqual(['Gå 15:09 – fremme 16:35']);
    expect(plan.hidden).toEqual([]);
  });

  it('passes on that a missed transfer may still be caught', async () => {
    const late = afternoon.map((call) =>
      call.line === '410' && call.stopPlaceId === mohlenpris.id ? { ...call, expectedArrival: at('15:57:40'), expectedDeparture: at('15:57:40') } : call,
    );
    const { fetchImpl } = entur(late);
    const now = new Date(at('15:00'));

    const before = await planTrips('fromWork', now, { routes, entur: { fetchImpl } });
    expect(before.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07']);

    const onBoard = await planTrips('fromWork', now, { routes, entur: { fetchImpl }, missedGraceSeconds: MISSED_GRACE_SECONDS });
    expect(onBoard.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:19 – fremme 16:35', 'Gå 15:41 – fremme 17:07']);
  });

  it('asks Entur for the calls of the stops and lines of the trip type, from the moment asked about', async () => {
    const { asked, fetchImpl } = entur(morning);
    await planTrips('toWork', new Date(at('07:00')), { routes, entur: { fetchImpl } });

    expect(asked.map((a) => a.operation)).toEqual(['lines', 'calls']);
    expect(asked[0].variables.codes).toEqual(['23E', '51', '400', '410']);
    expect(asked[1].variables).toMatchObject({
      ids: ['NSR:StopPlace:32541', 'stop:Blomsterdalen', 'stop:Dolvik', 'stop:Frieda Fasmer', 'stop:Kokstadskiftet'],
      lines: ['SKY:Line:23E', 'SKY:Line:51', 'SKY:Line:400', 'SKY:Line:410'],
      start: new Date(at('07:00')).toISOString(),
    });
  });

  it('makes one request per refresh once the lines are known', async () => {
    const single: SavedRoutes = { ...routes, alternatives: [fromWork[1]], connections: [connections[2]] };
    const { asked, fetchImpl } = entur(afternoon);

    await planTrips('fromWork', new Date(at('15:00')), { routes: single, entur: { fetchImpl } });
    await planTrips('fromWork', new Date(at('15:00:30')), { routes: single, entur: { fetchImpl } });

    expect(asked.map((a) => a.operation)).toEqual(['lines', 'calls', 'calls']);
  });

  it('gives the cards another card beats apart from the ones to show', async () => {
    const { fetchImpl } = entur(morning);
    const plan = await planTrips('toWork', new Date(at('07:00')), { routes, entur: { fetchImpl } });

    expect(plan.trips.map((trip) => card(trip)[0])).toEqual(['Avgang 07:09 – fremme 08:16', 'Avgang 07:25 – fremme 08:45']);
    expect(plan.hidden.map((trip) => card(trip)[0])).toEqual(['Avgang 07:09 – fremme 08:27']);
  });

  it('looks the lines up again after a lookup that failed', async () => {
    // A line no other test rides, so that its lookup is not remembered from one of them.
    const direct: Alternative = { key: 'direct', tripType: 'toWork', legs: [ride('403', krokasskiftet, kokstadskiftet)] };
    const single: SavedRoutes = { ...routes, alternatives: [direct], connections: [connections[4]] };
    const calls = journey('403', '403', [[krokasskiftet, '07:10'], [kokstadskiftet, '08:10']]);

    const failing = (async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(planTrips('toWork', new Date(at('07:00')), { routes: single, entur: { fetchImpl: failing } })).rejects.toThrow('503');

    const { asked, fetchImpl } = entur(calls);
    const plan = await planTrips('toWork', new Date(at('07:00')), { routes: single, entur: { fetchImpl } });
    expect(asked.map((a) => a.operation)).toEqual(['lines', 'calls']);
    expect(plan.trips.map((trip) => card(trip)[0])).toEqual(['Avgang 07:10 – fremme 08:32']);
  });

  it('reads the saved routes from storage unless they are given', async () => {
    await AsyncStorage.setItem('alternatives:v4', JSON.stringify(routes));
    const { fetchImpl } = entur(morning);
    const plan = await planTrips('toWork', new Date(at('07:00')), { entur: { fetchImpl } });
    expect(plan.trips).toHaveLength(2);
    expect(plan.hidden).toHaveLength(1);
  });

  it('gives no trips, and asks Entur nothing, when nothing is saved', async () => {
    const { asked, fetchImpl } = entur(morning);
    const plan = await planTrips('toWork', new Date(at('07:00')), { routes: NO_ROUTES, entur: { fetchImpl } });
    expect(plan.trips).toEqual([]);
    expect(plan.hidden).toEqual([]);
    expect(asked).toEqual([]);
  });
});
