import AsyncStorage from '@react-native-async-storage/async-storage';

import { formatClock } from '@/core/time';
import { formatMargin } from '@/core/transfer';
import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import { callsNeeded, planFromCalls, planTrips } from '@/engine/plan';
import type { TransferMemory } from '@/engine/transfers';
import type { PlannedTrip } from '@/engine/trips';
import type { StopCall, StopCallsResponse } from '@/entur/calls';
import { setLogSinks } from '@/logging/logger';
import type { Alternative, Connection, StopRef } from '@/model/types';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

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

  describe('a card whose transfer has little or nothing to spare', () => {
    const paths = tripPaths(routes, 'fromWork');
    /** The afternoon with the 50E forecast at Møhlenpris at the given clock. The 410 leaves there at 16:00. */
    const with50EAt = (clock: string) =>
      afternoon.map((call) =>
        call.line === '50E' && call.stopPlaceId === mohlenpris.id ? { ...call, expectedArrival: at(clock), expectedDeparture: at(clock) } : call,
      );
    const plan = (clock: string, memory: TransferMemory | null = null) => planFromCalls(paths, with50EAt(clock), routes, new Date(at('15:00')), memory);
    const byThe410 = (margin: string) => ['Gå 15:19 – fremme 16:35', 'Gå til Grana 4 min', '57 Grana', '50E Birkelandsskiftet D 1:20', `410 Møhlenpris ${margin}`];
    const byThe400 = ['Gå 15:41 – fremme 17:07', 'Gå til Kokstadskiftet 22 min', '23E Kokstadskiftet', '400 Storavatnet B 5:40'];
    const key = 'journey:50E@2026-11-16:stop:Møhlenpris>journey:410@2026-11-16:stop:Møhlenpris';

    it('stays when the transfer has less than a minute, under the best trip', () => {
      // 15:59:01 to 16:00:00. The trip by the 400 has a minute on every transfer and is the best, half an hour later.
      const { shown, hidden } = plan('15:59:01');
      expect(shown.map(card)).toEqual([byThe400, byThe410('0:59')]);
      expect(hidden).toEqual([]);
      // With a minute exactly it is the best itself.
      expect(plan('15:59:00').shown.map(card)).toEqual([byThe410('1:00'), byThe400]);
    });

    it('stays, in red, when the forecast says the transfer is missed by a minute or less', () => {
      expect(plan('16:00:10').shown.map(card)).toEqual([byThe400, byThe410('−0:10')]);
      expect(plan('16:01:00').shown.map(card)).toEqual([byThe400, byThe410('−1:00')]);
      // The other trip that ends on the same 410 stays behind the card.
      expect(plan('16:00:10').shown[1].alternatives.map((trip) => card(trip)[0])).toEqual(['Gå 15:09 – fremme 16:35']);
    });

    it('stays, in red, until the transfer is missed by more than three minutes, once it has been shown', () => {
      const first = plan('15:57:50');
      expect(first.memory.removed).toEqual([]);
      expect(first.memory.seen).toContain(key);

      const late = plan('16:01:01', first.memory);
      expect(late.shown.map(card)).toEqual([byThe400, byThe410('−1:01')]);
      const later = plan('16:03:00', late.memory);
      expect(later.shown.map(card)).toEqual([byThe400, byThe410('−3:00')]);
      expect(later.memory.removed).toEqual([]);
    });

    it('goes when the transfer is missed by more than three minutes, and is remembered as given up', () => {
      const gone = plan('16:03:01', plan('15:57:50').memory);
      expect(gone.shown.map(card)).toEqual([byThe400]);
      expect(gone.memory.removed).toEqual([key]);
    });

    it('is not shown when the transfer is first seen missed by more than a minute', () => {
      // Without anything remembered, and with other transfers remembered but not this one.
      expect(plan('16:01:01').shown.map(card)).toEqual([byThe400]);
      const others = { seen: plan('15:57:50').memory.seen.filter((seen) => seen !== key), removed: [] };
      const never = plan('16:01:01', others);
      expect(never.shown.map(card)).toEqual([byThe400]);
      expect(never.memory.removed).toEqual([]);
    });

    it('does not come back until the forecast says the transfer is caught', () => {
      const gone = plan('16:03:01', plan('15:57:50').memory);
      // Three minutes too late, a minute too late, and a second too late: nothing happens.
      expect(plan('16:03:00', gone.memory).shown.map(card)).toEqual([byThe400]);
      const closer = plan('16:01:00', gone.memory);
      expect(closer.shown.map(card)).toEqual([byThe400]);
      const almost = plan('16:00:01', closer.memory);
      expect(almost.shown.map(card)).toEqual([byThe400]);
      expect(almost.memory.removed).toEqual([key]);

      // On time to the second, it is back.
      const back = plan('16:00:00', almost.memory);
      expect(back.shown.map(card)).toEqual([byThe400, byThe410('0:00')]);
      expect(back.memory.removed).toEqual([]);

      // Without what was remembered it would have come back in red at once.
      expect(plan('16:01:00').shown.map(card)).toEqual([byThe400, byThe410('−1:00')]);
    });

    it('forgets a change that was given up once its vehicles are no longer among the calls', () => {
      const gone = plan('16:03:01', plan('15:57:50').memory);
      const without410 = with50EAt('16:03:01').filter((call) => call.line !== '410');
      expect(planFromCalls(paths, without410, routes, new Date(at('15:00')), gone.memory).memory.removed).toEqual([]);
    });
  });

  describe('the best trip', () => {
    const paths = tripPaths(routes, 'toWork');
    /** The morning with the 400 forecast at Frieda Fasmer at the given clock. The 23E leaves there at 07:35. */
    const with400At = (clock: string) =>
      morning.map((call) =>
        call.serviceJourneyId === 'journey:400' && call.stopPlaceId === frieda.id ? { ...call, expectedArrival: at(clock), expectedDeparture: at(clock) } : call,
      );
    const plan = (clock: string) => planFromCalls(paths, with400At(clock), routes, new Date(at('07:00')));

    it('is on top: there first among the trips where every transfer has a minute', () => {
      const { shown, hidden } = plan('07:34:00');
      expect(shown.map(card)).toEqual([
        ['Avgang 07:09 – fremme 08:16', '400 Krokåsskiftet', '23E Frieda Fasmer 1:00', '51 Dolvik B 5:00', 'Gå fra Blomsterdalen 11 min'],
        ['Avgang 07:25 – fremme 08:45', '410 Krokåsskiftet', '23E Frieda Fasmer 4:00', 'Gå fra Kokstadskiftet 22 min'],
      ]);
      expect(hidden.map((trip) => card(trip)[0])).toEqual(['Avgang 07:09 – fremme 08:27']);
    });

    it('is a later trip when the one that is there first has a transfer with less than a minute', () => {
      // The 400 is at Frieda Fasmer a second later: 59 seconds before the 23E.
      const { shown, hidden } = plan('07:34:01');
      expect(shown.map(card)).toEqual([
        // With the next 23E from Frieda Fasmer every transfer has a minute. Leaving at 07:25 gets the same one.
        ['Avgang 07:25 – fremme 08:45', '410 Krokåsskiftet', '23E Frieda Fasmer 4:00', 'Gå fra Kokstadskiftet 22 min'],
        // The two trips by the first 23E are there sooner. They stay, under the best, and hide no card.
        ['Avgang 07:09 – fremme 08:16', '400 Krokåsskiftet', '23E Frieda Fasmer 0:59', '51 Dolvik B 5:00', 'Gå fra Blomsterdalen 11 min'],
        ['Avgang 07:09 – fremme 08:27', '400 Krokåsskiftet', '23E Frieda Fasmer 0:59', 'Gå fra Kokstadskiftet 22 min'],
      ]);
      expect(hidden).toEqual([]);
      // Leaving at 07:09 and waiting for the next 23E ends on the same vehicle, and lies behind the best card.
      expect(shown[0].alternatives.map(card)).toEqual([
        ['Avgang 07:09 – fremme 08:45', '400 Krokåsskiftet', '23E Frieda Fasmer 18:59', 'Gå fra Kokstadskiftet 22 min'],
      ]);
    });

    it('is shown though another card would hide it', () => {
      // Both leave work at 15:41 and are home at 17:07, as shown. By the second, the trip from Birkelandsskiftet
      // leaves later and is there sooner, which would hide the other. That one has more to spare and is the best.
      const calls = [
        ...journey('23E', '23E', [[kokstadskiftet, '16:03'], [storavatnet, '16:30', { platform: 'B' }]]),
        ...journey('400', '400', [[storavatnet, '16:35:40', { platform: 'B' }], [krokasskiftet, '17:07:50']]),
        ...journey('50E', '50E', [[birkelandsskiftet, '16:01:30', { platform: 'D' }], [mohlenpris, '16:30']]),
        ...journey('410', '410', [[mohlenpris, '16:35'], [krokasskiftet, '17:07:10']]),
      ];
      const { shown, hidden } = planFromCalls(tripPaths(routes, 'fromWork'), calls, routes, new Date(at('15:00')));
      expect(shown.map(card)).toEqual([
        ['Gå 15:41 – fremme 17:07', 'Gå til Kokstadskiftet 22 min', '23E Kokstadskiftet', '400 Storavatnet B 5:40'],
        ['Gå 15:41 – fremme 17:07', 'Gå til Birkelandsskiftet 20 min', '50E Birkelandsskiftet D', '410 Møhlenpris 5:00'],
      ]);
      expect(hidden).toEqual([]);
    });

    it('is among the cards also when the trip that is there first for its departure is forecast as missed', () => {
      const { shown } = plan('07:35:30');
      expect(shown.map((trip) => card(trip).slice(0, 3))).toEqual([
        ['Avgang 07:25 – fremme 08:45', '410 Krokåsskiftet', '23E Frieda Fasmer 4:00'],
        ['Avgang 07:09 – fremme 08:16', '400 Krokåsskiftet', '23E Frieda Fasmer −0:30'],
        ['Avgang 07:09 – fremme 08:27', '400 Krokåsskiftet', '23E Frieda Fasmer −0:30'],
      ]);
      const [, red] = shown;
      const [, second] = red.rows;
      // If the 23E is missed, the next one gets the traveller to Kokstadskiftet, and to work at 08:45.
      expect(second.kind === 'ride' && second.transfer?.arrivalIfMissed).toBe(new Date(at('08:45')).toISOString());
    });
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
    const nothing = { shown: [], hidden: [], memory: { seen: [], removed: [] } };
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

  it('keeps a card whose transfer is forecast as missed by less than a minute', async () => {
    const late = afternoon.map((call) =>
      call.line === '410' && call.stopPlaceId === mohlenpris.id ? { ...call, expectedArrival: at('15:57:40'), expectedDeparture: at('15:57:40') } : call,
    );
    const { fetchImpl } = entur(late);
    const plan = await planTrips('fromWork', new Date(at('15:00')), { routes, entur: { fetchImpl } });
    // The trip by the 400 holds and is on top. The one by the 410, ten seconds too late, stays under it.
    expect(plan.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07', 'Gå 15:19 – fremme 16:35']);
  });

  it('gives what to remember, and with it keeps a card that was given up away', async () => {
    const at410 = (clock: string) =>
      afternoon.map((call) =>
        call.line === '410' && call.stopPlaceId === mohlenpris.id ? { ...call, expectedArrival: at(clock), expectedDeparture: at(clock) } : call,
      );
    const now = new Date(at('15:00'));
    const run = (clock: string, memory?: TransferMemory) => planTrips('fromWork', now, { routes, entur: { fetchImpl: entur(at410(clock)).fetchImpl }, memory });

    const first = await run('16:00');
    expect(first.memory.removed).toEqual([]);
    // The 410 now leaves 3:01 before the 50E is there, and then a minute before.
    const gone = await run('15:54:49', first.memory);
    expect(gone.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07']);
    expect(gone.memory.removed).toHaveLength(1);

    const still = await run('15:56:50', gone.memory);
    expect(still.trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07']);
    expect((await run('15:56:50')).trips.map((trip) => card(trip)[0])).toEqual(['Gå 15:41 – fremme 17:07', 'Gå 15:19 – fremme 16:35']);
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
