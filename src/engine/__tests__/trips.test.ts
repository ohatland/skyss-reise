import { formatClock } from '@/core/time';
import { MISSED_GRACE_SECONDS, formatMargin } from '@/core/transfer';
import { at, journey, quayId, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import type { TripPath } from '@/engine/paths';
import { groupCallsByStop, ridesOnLeg } from '@/engine/rides';
import {
  cardsBestFirst,
  cardsOf,
  hideBeaten,
  holdsWithMargin,
  isComfortable,
  rankTrips,
  tripsOnPath,
  tripsOnPaths,
  walkLookup,
  type PlannedTrip,
  type TripCard,
  type TripOptions,
  type WalkTimes,
} from '@/engine/trips';
import type { StopCall } from '@/entur/calls';
import type { Leg, StopRef } from '@/model/types';

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const grana = stop('Grana');
const birkelandsskiftet = stop('Birkelandsskiftet');
const dolvik = stop('Dolvik');
const mohlenpris = stop('Møhlenpris');
const storavatnet = stop('Storavatnet');
const frieda = stop('Frieda Fasmer');
const blomsterdalen = stop('Blomsterdalen');
const byparken = stop('Byparken');
const strandkaien = stop('Strandkaien');
const kleppesto = stop('Kleppestø');
const busstasjonen = stop('Bergen busstasjon');
const krokasskiftet = stop('Krokåsskiftet');

/** A path as the trip type gives it, whose last legs are the way from a stop to the address. */
const toAddress = (legs: Leg[], legsToAddress: number): TripPath => ({ legs, legsToAddress });

function trips(
  path: Leg[] | TripPath,
  calls: StopCall[],
  now: string,
  times: Partial<WalkTimes> = {},
  options: TripOptions = {},
): PlannedTrip[] {
  const byStop = groupCallsByStop(calls);
  return tripsOnPath(
    Array.isArray(path) ? { legs: path, legsToAddress: 0 } : path,
    (leg) => ridesOnLeg(leg, byStop),
    walkLookup({ transferWalks: [], walkOverrides: {}, ...times }),
    new Date(at(now)),
    options,
  );
}

/** On board, a transfer the forecast says is missed by less than a minute is still shown. */
const onBoard: TripOptions = { missedGraceSeconds: MISSED_GRACE_SECONDS };

/** The table of a card, as the screen is to show it. */
function table(trip: PlannedTrip): string[] {
  return trip.rows.map((row) => {
    if (row.kind === 'walk') return `Gå ${row.from.name} → ${row.to.name} ${row.seconds} s`;
    const where = row.fromPlatform ? `${row.from.name} ${row.fromPlatform}` : row.from.name;
    return `${row.line} ${where}${row.transfer ? ` ${formatMargin(row.transfer.marginSeconds)}` : ''}`;
  });
}

const clock = (time: string) => new Date(time).toISOString();

describe('one transfer', () => {
  const path = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)];
  const first = journey('50E', '50E', [
    [birkelandsskiftet, '15:30', { platform: 'D' }],
    [mohlenpris, '15:57', { expected: '15:58:10', platform: 'N' }],
  ]);
  /** A bus home leaving Møhlenpris, from the other side of the road, at the given clock. */
  const home = (id: string, departs: string, arrives: string) =>
    journey(id, '410', [
      [mohlenpris, departs, { platform: 'S' }],
      [krokasskiftet, arrives],
    ]);
  const crossing = { transferWalks: [transferWalk(mohlenpris, 'N', mohlenpris, 'S', 152)] };

  it('has the transfer time left after walking, in seconds, from the forecasts', () => {
    const [trip] = trips(path, [...first, ...home('a', '16:02:30', '16:35:20')], '15:00', crossing);

    // 15:58:10 to 16:02:30 is 260 seconds, less 152 to cross the road.
    expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S 1:48']);
    const [, second] = trip.rows;
    expect(second.kind === 'ride' && second.transfer).toEqual({
      marginSeconds: 108,
      status: 'tight',
      walkSeconds: 152,
      arrivalIfMissed: null,
    });
    expect(trip.arrival).toBe(clock(at('16:35:20')));
    expect(trip.leaveAt).toBeNull();
  });

  it('is green above three minutes', () => {
    const [trip] = trips(path, [...first, ...home('a', '16:03:43', '16:36')], '15:00', crossing);
    const [, second] = trip.rows;
    expect(second.kind === 'ride' && second.transfer).toMatchObject({ marginSeconds: 181, status: 'good' });
  });

  it('makes a transfer with nothing to spare', () => {
    const [trip] = trips(path, [...first, ...home('a', '16:00:42', '16:33')], '15:00', crossing);
    const [, second] = trip.rows;
    expect(second.kind === 'ride' && second.transfer).toMatchObject({ marginSeconds: 0, status: 'tight' });
    expect(formatClock(trip.arrival)).toBe('16:33');
  });

  it('does not offer a transfer missed by a second before departure, but the next departure', () => {
    const [trip] = trips(path, [...first, ...home('a', '16:00:41', '16:33'), ...home('b', '16:20', '16:53')], '15:00', crossing);
    // 15:58:10 to 16:20:00 is 1310 seconds, less 152.
    expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S 19:18']);
    expect(formatClock(trip.arrival)).toBe('16:53');
  });

  it('offers no trip before departure when the only way onward is missed by a second', () => {
    expect(trips(path, [...first, ...home('a', '16:00:41', '16:33')], '15:00', crossing)).toEqual([]);
  });

  it('never has a negative transfer time before departure, on any transfer of the trip', () => {
    const three = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, storavatnet), ride('400', storavatnet, krokasskiftet)];
    const calls = [
      ...first,
      ...journey('on', '410', [[mohlenpris, '16:02', { platform: 'N' }], [storavatnet, '16:15:20']]),
      ...journey('missed', '400', [[storavatnet, '16:15'], [krokasskiftet, '16:35']]),
      ...journey('caught', '400', [[storavatnet, '16:35'], [krokasskiftet, '16:55']]),
    ];
    expect(trips(three, calls, '15:00').map(table)).toEqual([['50E Birkelandsskiftet D', '410 Møhlenpris N 3:50', '400 Storavatnet 19:40']]);
    expect(trips(three, calls, '15:00', {}, onBoard).map(table)).toEqual([['50E Birkelandsskiftet D', '410 Møhlenpris N 3:50', '400 Storavatnet −0:20']]);
  });

  describe('on board, where a missed transfer may still be caught', () => {
    it('keeps a transfer missed by a second, in red, and tells when the next departure gets there', () => {
      const [trip] = trips(
        path,
        [...first, ...home('a', '16:00:41', '16:33'), ...home('b', '16:20', '16:53'), ...home('c', '16:40', '17:13')],
        '15:00',
        crossing,
        onBoard,
      );
      expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S −0:01']);
      const [, second] = trip.rows;
      expect(second.kind === 'ride' && second.transfer).toEqual({
        marginSeconds: -1,
        status: 'missed',
        walkSeconds: 152,
        arrivalIfMissed: clock(at('16:53')),
      });
      expect(formatClock(trip.arrival)).toBe('16:33');
    });

    it('does not count on another departure that is also missed when telling what happens if this one is', () => {
      const [trip] = trips(
        path,
        [...first, ...home('a', '16:00:00', '16:33'), ...home('b', '16:00:30', '16:34'), ...home('c', '16:20', '16:53')],
        '15:00',
        crossing,
        onBoard,
      );
      // Both the first and the second are missed by less than a minute. The first gets there first, so it is the one shown.
      expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S −0:42']);
      const [, second] = trip.rows;
      expect(second.kind === 'ride' && second.transfer).toMatchObject({ arrivalIfMissed: clock(at('16:53')) });
    });

    it('keeps a transfer missed by exactly a minute', () => {
      const calls = [...first, ...home('a', '15:59:42', '16:32'), ...home('b', '16:20', '16:53')];
      expect(table(trips(path, calls, '15:00', crossing, onBoard)[0])).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S −1:00']);
    });

    it('moves to the next departure when the transfer is missed by more than a minute', () => {
      const calls = [...first, ...home('a', '15:59:41', '16:32'), ...home('b', '16:20', '16:53')];
      const [trip] = trips(path, calls, '15:00', crossing, onBoard);
      expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris S 19:18']);
      expect(formatClock(trip.arrival)).toBe('16:53');
    });

    it('offers no trip when the last departure onward is lost', () => {
      expect(trips(path, [...first, ...home('a', '15:59:41', '16:32')], '15:00', crossing, onBoard)).toEqual([]);
    });

    it('prefers a transfer that holds to one that is missed, when both get there at the same time', () => {
      const twoWays = [ride('50E, 51', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, storavatnet), ride('400', storavatnet, krokasskiftet)];
      const [trip] = trips(
        twoWays,
        [
          ...first,
          ...journey('just-missed', '410', [[mohlenpris, '15:57:50', { platform: 'N' }], [storavatnet, '16:10']]),
          ...journey('caught', '400', [[mohlenpris, '16:01', { platform: 'N' }], [storavatnet, '16:12']]),
          ...journey('last', '400', [[storavatnet, '16:20'], [krokasskiftet, '16:40']]),
        ],
        '15:00',
        {},
        onBoard,
      );
      expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '400 Møhlenpris N 2:50', '400 Storavatnet 8:00']);
    });
  });

  it('does not take a departure that leaves before the traveller arrives, however short the walk', () => {
    expect(trips(path, [...first, ...home('a', '15:57:00', '16:30')], '15:00')).toEqual([]);
  });

  it('gives every reachable departure of the first vehicle a trip of its own', () => {
    const found = trips(
      path,
      [
        ...first,
        ...journey('50E-next', '50E', [[birkelandsskiftet, '15:40', { platform: 'D' }], [mohlenpris, '16:07', { platform: 'N' }]]),
        ...home('a', '16:05', '16:37'),
        ...home('b', '16:25', '16:57'),
      ],
      '15:00',
      crossing,
    );
    expect(found.map((trip) => `${formatClock(trip.departure.expected)}–${formatClock(trip.arrival)}`)).toEqual([
      '15:30–16:37',
      '15:40–16:57',
    ]);
  });
});

describe('several transfers', () => {
  const path = [
    walk(work, grana, 224),
    ride('57', grana, birkelandsskiftet),
    ride('50E, 51', birkelandsskiftet, mohlenpris),
    ride('400, 410', mohlenpris, krokasskiftet),
  ];
  const bus57 = journey('57', '57', [
    [grana, '15:21', { expected: '15:23' }],
    [birkelandsskiftet, '15:24', { expected: '15:26:30', platform: 'C' }],
  ]);
  const bus50E = journey('50E', '50E', [
    [birkelandsskiftet, '15:30', { platform: 'D' }],
    [mohlenpris, '15:57', { expected: '15:58:10' }],
  ]);
  const bus410 = journey('410', '410', [
    [mohlenpris, '16:03'],
    [krokasskiftet, '16:33', { expected: '16:35:20' }],
  ]);
  const times = {
    transferWalks: [
      transferWalk(birkelandsskiftet, 'C', birkelandsskiftet, 'D', 40),
      transferWalk(mohlenpris, undefined, mohlenpris, undefined, 0),
    ],
  };

  it('adds up from the door to the last stop: when to leave, each transfer time, and the arrival', () => {
    const [trip] = trips(path, [...bus57, ...bus50E, ...bus410], '15:00', times);

    expect(table(trip)).toEqual([
      'Gå Jobb → Grana 224 s',
      '57 Grana',
      // 15:26:30 to 15:30:00 is 210 seconds, less 40 between the platforms.
      '50E Birkelandsskiftet D 2:50',
      // 15:58:10 to 16:03:00 with no walk.
      '410 Møhlenpris 4:50',
    ]);
    expect(trip.from).toEqual(work);
    expect(trip.to).toEqual(krokasskiftet);
    // The 57 is expected at 15:23:00, and the walk to it takes 3:44.
    expect(trip.leaveAt).toBe(clock(at('15:19:16')));
    expect(trip.arrival).toBe(clock(at('16:35:20')));
    expect(trip.durationSeconds).toBe(76 * 60 + 4);
    // By the timetable: 15:21 less the walk, to 16:33.
    expect(trip.scheduledDurationSeconds).toBe(72 * 60 + 224);
  });

  it('marks the first vehicle as deviating from the timetable, with the scheduled time', () => {
    const [trip] = trips(path, [...bus57, ...bus50E, ...bus410], '15:00', times);
    expect(trip.departure).toEqual({ aimed: at('15:21'), expected: at('15:23'), realtime: true });
    expect(trip.departureMarking).toEqual({ kind: 'deviation', scheduledClock: '15:21' });
    expect(trip.rows.flatMap((row) => (row.kind === 'ride' ? [row.marking.kind] : []))).toEqual([
      'deviation',
      'realtime',
      'realtime',
    ]);
  });

  it('rides the line that gets there first where a leg has several, not the one that leaves first', () => {
    const slow51 = journey('51', '51', [
      [birkelandsskiftet, '15:28', { platform: 'D' }],
      [mohlenpris, '16:10'],
    ]);
    const later410 = journey('410-later', '410', [
      [mohlenpris, '16:33'],
      [krokasskiftet, '17:03'],
    ]);
    const [trip] = trips(path, [...bus57, ...slow51, ...bus50E, ...bus410, ...later410], '15:00', times);

    expect(table(trip)).toEqual([
      'Gå Jobb → Grana 224 s',
      '57 Grana',
      '50E Birkelandsskiftet D 2:50',
      '410 Møhlenpris 4:50',
    ]);
    expect(formatClock(trip.arrival)).toBe('16:35');
  });

  it('takes the way whose tightest transfer is largest when two ways reach the same last vehicle', () => {
    const early = journey('50E-early', '50E', [
      [birkelandsskiftet, '15:28', { platform: 'D' }],
      [mohlenpris, '15:50'],
    ]);
    const late = journey('51-late', '51', [
      [birkelandsskiftet, '15:38', { platform: 'D' }],
      [mohlenpris, '16:00'],
    ]);
    const [trip] = trips(path, [...bus57, ...early, ...late, ...bus410], '15:00', times);

    // Early: 0:50 at Birkelandsskiftet, then 13:00. Late: 10:50, then 3:00.
    expect(table(trip).slice(2)).toEqual(['51 Birkelandsskiftet D 10:50', '410 Møhlenpris 3:00']);
  });

  it('tells when the traveller arrives by the next departure, also for a transfer that holds', () => {
    const next50E = journey('50E-next', '50E', [
      [birkelandsskiftet, '15:40', { platform: 'D' }],
      [mohlenpris, '16:08'],
    ]);
    const next410 = journey('410-next', '410', [
      [mohlenpris, '16:23'],
      [krokasskiftet, '16:55'],
    ]);
    const [trip] = trips(path, [...bus57, ...bus50E, ...next50E, ...bus410, ...next410], '15:00', times);

    expect(trip.rows.flatMap((row) => (row.kind === 'ride' && row.transfer ? [row.transfer.arrivalIfMissed] : []))).toEqual([
      clock(at('16:55')),
      clock(at('16:55')),
    ]);
  });
});

describe('from door to door', () => {
  const toWork = [
    ride('400, 410', krokasskiftet, frieda),
    ride('23E', frieda, dolvik),
    ride('51', dolvik, blomsterdalen),
    walk(blomsterdalen, work, 692),
  ];
  const morning = [
    ...journey('400', '400', [[krokasskiftet, '07:07', { expected: '07:09' }], [frieda, '07:29', { expected: '07:31' }]]),
    ...journey('23E', '23E', [[frieda, '07:35'], [dolvik, '07:52', { platform: 'A' }]]),
    ...journey('51', '51', [[dolvik, '07:57', { platform: 'B' }], [blomsterdalen, '08:05']]),
  ];

  it('counts the walk after the last stop into the arrival, as the last row', () => {
    const [trip] = trips(toWork, morning, '07:00');

    expect(table(trip)).toEqual(['400 Krokåsskiftet', '23E Frieda Fasmer 4:00', '51 Dolvik B 5:00', 'Gå Blomsterdalen → Jobb 692 s']);
    expect(trip.rows[3]).toEqual({ kind: 'walk', position: 'end', from: blomsterdalen, to: work, seconds: 692 });
    expect(trip.to).toEqual(work);
    expect(trip.leaveAt).toBeNull();
    // 08:05:00 and 11:32 on foot.
    expect(trip.arrival).toBe(clock(at('08:16:32')));
    expect(trip.durationSeconds).toBe(67 * 60 + 32);
    expect(trip.scheduledDurationSeconds).toBe(69 * 60 + 32);
  });

  it('does not offer a first vehicle that has left, but one that is late and still to come', () => {
    expect(trips(toWork, morning, '07:09:01')).toEqual([]);
    expect(trips(toWork, morning, '07:09:00')).toHaveLength(1);
    // By the timetable the bus left at 07:07; the forecast says it has not.
    expect(trips(toWork, morning, '07:08')).toHaveLength(1);
  });

  const fromWork = [walk(work, birkelandsskiftet, 1212), ride('50E', birkelandsskiftet, mohlenpris), ride('410', mohlenpris, krokasskiftet)];
  const afternoon = [
    ...journey('50E', '50E', [[birkelandsskiftet, '15:37'], [mohlenpris, '16:00']]),
    ...journey('410', '410', [[mohlenpris, '16:05'], [krokasskiftet, '16:35']]),
  ];

  it('tells when to leave the address, with the walk as the first row', () => {
    const [trip] = trips(fromWork, afternoon, '15:00');

    expect(trip.rows[0]).toEqual({ kind: 'walk', position: 'start', from: work, to: birkelandsskiftet, seconds: 1212 });
    // 15:37:00 less 20:12.
    expect(trip.leaveAt).toBe(clock(at('15:16:48')));
    expect(trip.departure.expected).toBe(at('15:37'));
    expect(trip.durationSeconds).toBe(78 * 60 + 12);
  });

  it('does not offer a departure the traveller cannot reach with the walk counted in', () => {
    expect(trips(fromWork, afternoon, '15:16:48')).toHaveLength(1);
    expect(trips(fromWork, afternoon, '15:16:49')).toEqual([]);
  });

  it("counts on the traveller's own walking time to the stop where one is set", () => {
    const own = { walkOverrides: { 'place:work>stop:Birkelandsskiftet': 900 } };
    const [trip] = trips(fromWork, afternoon, '15:20', own);
    expect(trip.leaveAt).toBe(clock(at('15:22')));
    expect(trip.rows[0]).toMatchObject({ seconds: 900 });
  });

  it('counts a walk without a known time as taking none', () => {
    const [trip] = trips([walk(work, birkelandsskiftet), ...fromWork.slice(1)], afternoon, '15:00');
    expect(trip.leaveAt).toBe(clock(at('15:37')));
  });

  it('counts a walk between two stops on the way into the transfer time, and lists it', () => {
    const viaBoat = [
      ride('1', birkelandsskiftet, byparken, 'tram'),
      walk(byparken, strandkaien, 536),
      ride('490', strandkaien, kleppesto, 'water'),
      ride('400', kleppesto, krokasskiftet),
    ];
    const calls = [
      ...journey('1', '1', [[birkelandsskiftet, '13:29'], [byparken, '14:09:31']], { transportMode: 'tram' }),
      ...journey('490', '490', [[strandkaien, '14:20'], [kleppesto, '14:34']], { transportMode: 'water' }),
      ...journey('400', '400', [[kleppesto, '14:38'], [krokasskiftet, '14:47']]),
    ];
    const [trip] = trips(viaBoat, calls, '13:00');

    // 14:09:31 to 14:20:00 is 629 seconds, less 536 on foot.
    expect(table(trip)).toEqual(['1 Birkelandsskiftet', 'Gå Byparken → Strandkaien 536 s', '490 Strandkaien 1:33', '400 Kleppestø 4:00']);
    expect(trip.rows[1]).toMatchObject({ kind: 'walk', position: 'between' });
    expect(trip.rows[2]).toMatchObject({ transfer: { walkSeconds: 536, status: 'tight' } });

    const [faster] = trips(viaBoat, calls, '13:00', { walkOverrides: { 'stop:Byparken>stop:Strandkaien': 400 } });
    expect(table(faster)[2]).toBe('490 Strandkaien 3:49');
  });
});

describe('walking between platforms', () => {
  const path = [ride('23', dolvik, storavatnet), ride('400, 410', storavatnet, krokasskiftet)];
  const arriving = journey('23', '23', [[dolvik, '15:20'], [storavatnet, '15:40', { platform: 'B' }]]);
  const fromA = journey('400', '400', [[storavatnet, '15:40:30', { platform: 'A' }], [krokasskiftet, '16:00']]);
  const fromB = journey('410', '410', [[storavatnet, '15:40:30', { platform: 'B' }], [krokasskiftet, '16:01']]);
  const laterFromA = journey('400-later', '400', [[storavatnet, '16:00', { platform: 'A' }], [krokasskiftet, '16:20']]);
  const entur = [
    transferWalk(storavatnet, 'B', storavatnet, 'A', 120),
    transferWalk(storavatnet, 'B', storavatnet, 'B', 0),
  ];

  it('catches the vehicle at the same platform but not the one across, though they leave together', () => {
    const [trip] = trips(path, [...arriving, ...fromA, ...fromB, ...laterFromA], '15:00', { transferWalks: entur });
    expect(table(trip)).toEqual(['23 Dolvik', '410 Storavatnet B 0:30']);
    expect(formatClock(trip.arrival)).toBe('16:01');
  });

  it("uses the traveller's own time for the pair of platforms before Entur's", () => {
    const own = { transferWalks: entur, walkOverrides: { [`${quayId(storavatnet, 'B')}>${quayId(storavatnet, 'A')}`]: 20 } };
    const [trip] = trips(path, [...arriving, ...fromA, ...fromB, ...laterFromA], '15:00', own);
    expect(table(trip)).toEqual(['23 Dolvik', '400 Storavatnet A 0:10']);
    expect(formatClock(trip.arrival)).toBe('16:00');
  });

  it('leaves the other pairs of platforms alone when one is given its own time', () => {
    const own = { transferWalks: entur, walkOverrides: { [`${quayId(storavatnet, 'B')}>${quayId(storavatnet, 'B')}`]: 45 } };
    const calls = [...arriving, ...fromA, ...fromB, ...laterFromA];
    // Staying at B now takes longer than the 30 seconds there are, and crossing to A still takes Entur's two minutes.
    expect(table(trips(path, calls, '15:00', own, onBoard)[0])).toEqual(['23 Dolvik', '410 Storavatnet B −0:15']);
    expect(table(trips(path, calls, '15:00', own)[0])).toEqual(['23 Dolvik', '400 Storavatnet A 18:00']);
  });

  describe('walkLookup', () => {
    const [arrival] = ridesOnLeg(path[0] as never, groupCallsByStop(arriving));
    const [toA] = ridesOnLeg(path[1] as never, groupCallsByStop(fromA));
    const [toB] = ridesOnLeg(path[1] as never, groupCallsByStop(fromB));
    const pairKey = `${quayId(storavatnet, 'B')}>${quayId(storavatnet, 'A')}`;
    const stopKey = 'stop:Storavatnet>stop:Storavatnet';
    const seconds = (times: Partial<WalkTimes>, to = toA) =>
      walkLookup({ transferWalks: [], walkOverrides: {}, ...times }).transfer(arrival.alighting, to.boarding);

    it('counts none where nothing is known', () => {
      expect(seconds({})).toBe(0);
    });

    it("takes Entur's time for the pair of platforms", () => {
      expect(seconds({ transferWalks: entur })).toBe(120);
      expect(seconds({ transferWalks: entur }, toB)).toBe(0);
    });

    it("takes the traveller's time for the pair of platforms first", () => {
      expect(seconds({ transferWalks: entur, walkOverrides: { [pairKey]: 30, [stopKey]: 75 } })).toBe(30);
    });

    it('takes a time the traveller set for the stop as a whole only where the platforms differ and nothing is known about them', () => {
      expect(seconds({ walkOverrides: { [stopKey]: 75 } })).toBe(75);
      expect(seconds({ transferWalks: entur, walkOverrides: { [stopKey]: 75 } })).toBe(120);
      expect(seconds({ walkOverrides: { [stopKey]: 75 } }, toB)).toBe(0);
    });
  });
});

describe('real time, timetable and typical delay', () => {
  const path = [ride('1', birkelandsskiftet, busstasjonen, 'tram'), ride('400', busstasjonen, krokasskiftet)];
  const tram = journey('1', '1', [[birkelandsskiftet, '13:29'], [busstasjonen, '14:06']], {
    transportMode: 'tram',
    realtime: false,
    started: false,
  });
  const bus = (options: Partial<StopCall>) =>
    journey('400', '400', [[busstasjonen, '14:12'], [krokasskiftet, '14:47']], {
      typicalDelay: { p50Seconds: 360, p90Seconds: 900 },
      ...options,
    });

  it('marks a vehicle without real-time data as on the timetable, and light rail as exact', () => {
    const [trip] = trips(path, [...tram, ...bus({ realtime: false, started: false })], '13:00');
    const [first, second] = trip.rows;

    expect(trip.departureMarking).toEqual({ kind: 'scheduled' });
    expect(trip.departure.realtime).toBe(false);
    expect(first).toMatchObject({ marking: { kind: 'scheduled' }, precise: true, started: false });
    expect(second).toMatchObject({ marking: { kind: 'scheduled' }, precise: false, started: false });
    expect(trip.arrivalRealtime).toBe(false);
    // The times are the timetable's, used as they are.
    expect(second).toMatchObject({ transfer: { marginSeconds: 360 } });
    expect(formatClock(trip.arrival)).toBe('14:47');
  });

  it('marks a vehicle as real time only when it is under way, whatever flag Entur has set', () => {
    const marking = (options: Partial<StopCall>, expected?: string) => {
      const calls = journey('400', '400', [[busstasjonen, '14:12', { expected }], [krokasskiftet, '14:47']], options);
      const [trip] = trips([ride('400', busstasjonen, krokasskiftet)], calls, '13:00');
      return trip.departureMarking;
    };

    expect(marking({ started: true, realtime: true })).toEqual({ kind: 'realtime' });
    expect(marking({ started: true, realtime: true }, '14:15')).toEqual({ kind: 'deviation', scheduledClock: '14:12' });
    // Entur flags journeys hours ahead; until the vehicle has left its first stop the forecast is not measured.
    expect(marking({ started: false, realtime: true })).toEqual({ kind: 'scheduled' });
    expect(marking({ started: true, realtime: false })).toEqual({ kind: 'scheduled' });
    expect(marking({ started: false, realtime: false })).toEqual({ kind: 'scheduled' });
  });

  it('shows that Entur expects a vehicle that has not started at another time than the timetable, without calling it real time', () => {
    const notStarted = (expected: string) => {
      const calls = journey('400', '400', [[busstasjonen, '14:12', { expected }], [krokasskiftet, '14:47']], { started: false });
      return trips([ride('400', busstasjonen, krokasskiftet)], calls, '13:00')[0];
    };

    expect(notStarted('14:15').departureMarking).toEqual({ kind: 'deviation', scheduledClock: '14:12' });
    expect(notStarted('14:10').departureMarking).toEqual({ kind: 'deviation', scheduledClock: '14:12' });
    expect(notStarted('14:15').rows[0]).toMatchObject({ marking: { kind: 'deviation', scheduledClock: '14:12' }, started: false });
    // Seconds within the same minute are no deviation, and the vehicle is still not under way.
    expect(notStarted('14:12:40').departureMarking).toEqual({ kind: 'scheduled' });
  });

  it('still tells the typical delay of a vehicle that has not started when its forecast deviates', () => {
    const calls = journey('400', '400', [[busstasjonen, '14:12', { expected: '14:15' }], [krokasskiftet, '14:47', { expected: '14:50' }]], {
      started: false,
      typicalDelay: { p50Seconds: 120, p90Seconds: 300 },
    });
    const [trip] = trips([ride('400', busstasjonen, krokasskiftet)], calls, '13:00');
    expect(trip.typicalArrivalDelay).toEqual({ p50Seconds: 120, p90Seconds: 300 });
    expect(trip.arrivalRealtime).toBe(false);
  });

  it('tells no typical delay when the median is less than a minute', () => {
    const shown = (p50Seconds: number) => {
      const [trip] = trips(path, [...tram, ...bus({ started: false, typicalDelay: { p50Seconds, p90Seconds: 240 } })], '13:00');
      return trip.typicalArrivalDelay;
    };

    expect(shown(0)).toBeNull();
    expect(shown(29)).toBeNull();
    expect(shown(-120)).toBeNull();
    // Half a minute and more is told as one minute.
    expect(shown(30)).toEqual({ p50Seconds: 30, p90Seconds: 240 });
    expect(shown(60)).toEqual({ p50Seconds: 60, p90Seconds: 240 });

    // What Entur gave is still on the vehicle's row.
    const [trip] = trips(path, [...tram, ...bus({ started: false, typicalDelay: { p50Seconds: 0, p90Seconds: 240 } })], '13:00');
    expect(trip.rows[1]).toMatchObject({ typicalDelay: { arrival: { p50Seconds: 0, p90Seconds: 240 } } });
  });

  it('still counts with the forecast Entur gives for a vehicle that has not started', () => {
    const calls = journey('400', '400', [[busstasjonen, '14:12', { expected: '14:15' }], [krokasskiftet, '14:47', { expected: '14:52' }]], {
      started: false,
    });
    const [trip] = trips([ride('400', busstasjonen, krokasskiftet)], calls, '13:00');
    expect(formatClock(trip.departure.expected)).toBe('14:15');
    expect(formatClock(trip.arrival)).toBe('14:52');
  });

  it("gives Entur's typical delay at the last stop for a last vehicle that is not under way", () => {
    const [notStarted] = trips(path, [...tram, ...bus({ started: false })], '13:00');
    expect(notStarted.typicalArrivalDelay).toEqual({ p50Seconds: 360, p90Seconds: 900 });
    expect(notStarted.rows[1]).toMatchObject({ marking: { kind: 'scheduled' }, started: false });
    expect(notStarted.arrivalRealtime).toBe(false);

    const [underway] = trips(path, [...tram, ...bus({ started: true })], '13:00');
    expect(underway.typicalArrivalDelay).toBeNull();
    expect(underway.rows[1]).toMatchObject({ marking: { kind: 'realtime' }, started: true });
    expect(underway.arrivalRealtime).toBe(true);
    // The vehicle's own typical delay is still there for the screen to use.
    expect(underway.rows[1]).toMatchObject({ typicalDelay: { arrival: { p50Seconds: 360, p90Seconds: 900 } } });
  });

  it('takes a boat that Entur has flagged but that has not left as exact, without a typical delay', () => {
    const boat = journey('2075', '2075', [[strandkaien, '14:20'], [kleppesto, '14:34']], {
      transportMode: 'water',
      realtime: true,
      started: false,
      typicalDelay: { p50Seconds: 120, p90Seconds: 240 },
    });
    const [trip] = trips([ride('2075', strandkaien, kleppesto, 'water')], boat, '13:00');
    expect(trip.rows[0]).toMatchObject({ marking: { kind: 'scheduled' }, precise: true });
    expect(trip.typicalArrivalDelay).toBeNull();
  });

  it('gives no typical delay where Entur has none, nor for light rail and boat', () => {
    const [none] = trips(path, [...tram, ...bus({ started: false, typicalDelay: null })], '13:00');
    expect(none.typicalArrivalDelay).toBeNull();

    const boat = journey('490', '490', [[strandkaien, '14:20'], [kleppesto, '14:34']], {
      transportMode: 'water',
      realtime: false,
      started: false,
      typicalDelay: { p50Seconds: 60, p90Seconds: 120 },
    });
    const [byBoat] = trips([ride('490', strandkaien, kleppesto, 'water')], boat, '13:00');
    expect(byBoat.typicalArrivalDelay).toBeNull();
  });

  it('passes on that Entur calls the forecast inaccurate', () => {
    const [trip] = trips(path, [...tram, ...bus({ predictionInaccurate: true })], '13:00');
    expect(trip.rows.map((row) => row.kind === 'ride' && row.predictionInaccurate)).toEqual([false, true]);
  });

  it('compares the travel time now with the timetable', () => {
    const late = journey('400', '400', [
      [busstasjonen, '14:12', { expected: '14:15' }],
      [krokasskiftet, '14:47', { expected: '14:58' }],
    ]);
    const [trip] = trips(path, [...tram, ...late], '13:00');
    expect(trip.scheduledDurationSeconds).toBe(78 * 60);
    expect(trip.durationSeconds).toBe(89 * 60);
  });
});

describe('a trip that passes midnight', () => {
  const NEXT = '2026-11-17';
  const path = [walk(work, birkelandsskiftet, 600), ride('50E', birkelandsskiftet, busstasjonen), ride('400', busstasjonen, krokasskiftet)];
  const calls = [
    ...journey('50E', '50E', [
      [birkelandsskiftet, '23:20'],
      [busstasjonen, '23:58:30'],
    ]),
    // The service date stays the day the journey belongs to, also for calls after midnight.
    ...journey('400', '400', [
      [busstasjonen, '00:03', { day: NEXT }],
      [krokasskiftet, '00:38', { day: NEXT, expected: '00:40:15' }],
    ]),
    ...journey('400-last', '400', [
      [busstasjonen, '23:50'],
      [krokasskiftet, '00:25', { day: NEXT }],
    ]),
  ];

  it('counts the transfer time and the travel time across the change of date', () => {
    const [trip] = trips(path, calls, '23:00', { transferWalks: [transferWalk(busstasjonen, undefined, busstasjonen, undefined, 90)] });

    // 23:58:30 to 00:03:00 is 270 seconds, less 90.
    expect(table(trip)).toEqual(['Gå Jobb → Birkelandsskiftet 600 s', '50E Birkelandsskiftet', '400 Bergen busstasjon 3:00']);
    expect(trip.leaveAt).toBe(clock(at('23:10')));
    expect(trip.arrival).toBe(clock(at('00:40:15', NEXT)));
    expect(formatClock(trip.arrival)).toBe('00:40');
    expect(trip.durationSeconds).toBe(90 * 60 + 15);
    expect(trip.scheduledDurationSeconds).toBe(88 * 60);
  });

  it('does not take the earlier bus for a later one because its clock reads lower', () => {
    const [trip] = trips(path, calls, '23:00');
    const last = trip.rows[trip.rows.length - 1];
    expect(last).toMatchObject({ kind: 'ride', serviceJourneyId: 'journey:400' });
  });

  it('offers a first departure after midnight when asked before it', () => {
    const [trip] = trips([ride('400', busstasjonen, krokasskiftet)], calls, '23:55');
    expect(formatClock(trip.departure.expected)).toBe('00:03');
  });
});

describe('staying on the same vehicle over two legs', () => {
  const path = [ride('50E, 51', birkelandsskiftet, dolvik), ride('50E', dolvik, mohlenpris), ride('410', mohlenpris, krokasskiftet)];
  const through = journey('50E', '50E', [
    [birkelandsskiftet, '15:30', { platform: 'D' }],
    [dolvik, '15:41', { platform: 'A' }],
    [mohlenpris, '15:58'],
  ]);
  const home = journey('410', '410', [[mohlenpris, '16:03'], [krokasskiftet, '16:35']]);

  it('is one row with no transfer, from where the traveller boards to where they get off', () => {
    const [trip] = trips(path, [...through, ...home], '15:00');

    expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '410 Møhlenpris 5:00']);
    expect(trip.rows[0]).toMatchObject({ from: birkelandsskiftet, to: mohlenpris, arrival: { expected: at('15:58') } });
  });

  it('is the same trip as riding the direct leg, and is listed once', () => {
    const direct = [ride('50E', birkelandsskiftet, mohlenpris), ride('410', mohlenpris, krokasskiftet)];
    const both = [...trips(path, [...through, ...home], '15:00'), ...trips(direct, [...through, ...home], '15:00')];

    expect(both).toHaveLength(2);
    expect(both[0].id).toBe(both[1].id);
    expect(rankTrips(both)).toHaveLength(1);
  });

  it('is a transfer when the journey of the same name the next day is the one that leaves', () => {
    const NEXT = '2026-11-17';
    const lastOfTheDay = journey('50E', '50E', [[birkelandsskiftet, '23:30', { platform: 'D' }], [dolvik, '23:41', { platform: 'A' }]]);
    const firstOfTheNext = journey(
      '50E',
      '50E',
      [[birkelandsskiftet, '23:55', { platform: 'D' }], [dolvik, '00:06', { platform: 'A', day: NEXT }], [mohlenpris, '00:20', { day: NEXT }]],
      { day: NEXT },
    );
    const nightBus = journey('410', '410', [[mohlenpris, '00:30', { day: NEXT }], [krokasskiftet, '01:00', { day: NEXT }]], { day: NEXT });

    const [trip] = trips(path, [...lastOfTheDay, ...firstOfTheNext, ...nightBus], '23:00');
    expect(table(trip)).toEqual(['50E Birkelandsskiftet D', '50E Dolvik A 25:00', '410 Møhlenpris 10:00']);
  });

  it('still changes vehicle where another line is taken to the stop in between', () => {
    const other = journey('51', '51', [[birkelandsskiftet, '15:25', { platform: 'D' }], [dolvik, '15:36', { platform: 'A' }]]);
    const found = trips(path, [...other, ...through, ...home], '15:00');
    expect(found.map(table)).toEqual([
      ['51 Birkelandsskiftet D', '50E Dolvik A 5:00', '410 Møhlenpris 5:00'],
      ['50E Birkelandsskiftet D', '410 Møhlenpris 5:00'],
    ]);
  });
});

describe('a path without departures', () => {
  it('gives no trips when a leg has no ride, or the path has no vehicle', () => {
    const path = [ride('50E', birkelandsskiftet, mohlenpris), ride('410', mohlenpris, krokasskiftet)];
    const onlyFirst = journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:58']]);
    expect(trips(path, onlyFirst, '15:00')).toEqual([]);
    expect(trips([walk(work, grana, 224)], onlyFirst, '15:00')).toEqual([]);
  });
});

describe('rankTrips', () => {
  const direct = (id: string, line: string, departs: string, arrives: string) =>
    trips([ride(line, birkelandsskiftet, krokasskiftet)], journey(id, line, [[birkelandsskiftet, departs], [krokasskiftet, arrives]]), '15:00')[0];
  const names = (ranked: PlannedTrip[]) => ranked.map((trip) => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row.line] : [])).join('+'));

  it('puts the trip that gets there first on top, whenever it leaves', () => {
    const ranked = rankTrips([direct('a', '50E', '15:10', '16:40'), direct('b', '51', '15:30', '16:20'), direct('c', '53', '15:05', '16:30')]);
    expect(names(ranked)).toEqual(['51', '53', '50E']);
  });

  const viaBusstasjonen = (id: string, tram: string, departs: string, changes: string, bus: string) =>
    trips(
      [ride(tram, birkelandsskiftet, busstasjonen), ride(bus, busstasjonen, krokasskiftet)],
      [
        ...journey(`${id}-first`, tram, [[birkelandsskiftet, departs], [busstasjonen, changes]]),
        ...journey(`${id}-last`, bus, [[busstasjonen, '15:55'], [krokasskiftet, '16:30']]),
      ],
      '15:00',
    )[0];

  it('puts the one that starts last first among trips arriving together', () => {
    const ranked = rankTrips([viaBusstasjonen('a', '1', '15:20', '15:50', '400'), direct('b', '50E', '15:10', '16:30'), direct('c', '51', '15:25', '16:30')]);
    expect(names(ranked)).toEqual(['51', '1+400', '50E']);
  });

  it('then the one whose tightest transfer is largest, then the one with the fewest vehicles', () => {
    // Named so that the order of their names is the opposite of the order wanted.
    const tight = viaBusstasjonen('a-tight', '1', '15:20', '15:53', '400');
    const roomy = viaBusstasjonen('z-roomy', '2', '15:20', '15:45', '410');
    const noTransfer = direct('direct', '50E', '15:20', '16:30');
    // A trip without a transfer has nothing that can fail, and so comes before any with one.
    expect(names(rankTrips([tight, roomy, noTransfer]))).toEqual(['50E', '2+410', '1+400']);

    const three = trips(
      [ride('3', birkelandsskiftet, dolvik), ride('4', dolvik, busstasjonen), ride('403', busstasjonen, krokasskiftet)],
      [
        ...journey('x', '3', [[birkelandsskiftet, '15:20'], [dolvik, '15:25']]),
        ...journey('y', '4', [[dolvik, '15:35'], [busstasjonen, '15:45']]),
        ...journey('z', '403', [[busstasjonen, '15:55'], [krokasskiftet, '16:30']]),
      ],
      '15:00',
    )[0];
    // Both have ten minutes as their tightest transfer.
    expect(names(rankTrips([three, roomy]))).toEqual(['2+410', '3+4+403']);
    // Ten minutes twice is better than two minutes once, though it is one more vehicle.
    expect(names(rankTrips([tight, three]))).toEqual(['3+4+403', '1+400']);
  });
});

describe('cardsOf', () => {
  const afternoon = [
    ...journey('57', '57', [[grana, '15:23'], [birkelandsskiftet, '15:26', { platform: 'C' }]]),
    ...journey('50E', '50E', [[birkelandsskiftet, '15:30', { platform: 'D' }], [dolvik, '15:41'], [mohlenpris, '15:58']]),
    ...journey('23', '23', [[dolvik, '15:45'], [storavatnet, '16:10']]),
    ...journey('410', '410', [[mohlenpris, '16:03'], [storavatnet, '16:15'], [krokasskiftet, '16:35']]),
    ...journey('400', '400', [[mohlenpris, '16:23'], [storavatnet, '16:35'], [krokasskiftet, '16:55']]),
  ];
  const byBus = [walk(work, grana, 240), ride('57', grana, birkelandsskiftet)];
  const onFoot = [walk(work, birkelandsskiftet, 1200)];
  const viaMohlenpris = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)];
  const viaStoravatnet = [ride('50E', birkelandsskiftet, dolvik), ride('23', dolvik, storavatnet), ride('400, 410', storavatnet, krokasskiftet)];
  const all = [byBus, onFoot].flatMap((start) => [viaMohlenpris, viaStoravatnet].map((rest) => [...start, ...rest]));
  const ranked = rankTrips(all.flatMap((path) => trips(path, afternoon, '15:00')));
  const short = (trip: PlannedTrip) =>
    `${formatClock(trip.leaveAt ?? trip.departure.expected)}–${formatClock(trip.arrival)} ${table(trip).slice(1).join(' · ')}`;

  it('makes one card of the trips that end on the same vehicle', () => {
    expect(ranked).toHaveLength(4);
    const cards = cardsOf(ranked);

    expect(cards.map(short)).toEqual(['15:19–16:35 57 Grana · 50E Birkelandsskiftet D 4:00 · 410 Møhlenpris 5:00']);
    expect(cards[0].alternatives.map(short)).toEqual([
      // Leaves as late, but the tightest transfer is smaller.
      '15:19–16:35 57 Grana · 50E Birkelandsskiftet D 4:00 · 23 Dolvik 4:00 · 410 Storavatnet 5:00',
      // The same two ways with the walk, which must start earlier.
      '15:10–16:35 50E Birkelandsskiftet D · 410 Møhlenpris 5:00',
      '15:10–16:35 50E Birkelandsskiftet D · 23 Dolvik 4:00 · 410 Storavatnet 5:00',
    ]);
  });

  it('takes the journey of the same name on another day as another vehicle', () => {
    const NEXT = '2026-11-17';
    const night = [
      ...journey('400', '400', [[busstasjonen, '23:50'], [krokasskiftet, '00:25', { day: NEXT }]]),
      ...journey('400', '400', [[busstasjonen, '00:20'], [krokasskiftet, '00:55']], { day: NEXT }),
    ];
    const cards = cardsOf(rankTrips(trips([ride('400', busstasjonen, krokasskiftet)], night, '23:00')));
    expect(cards.map((card) => `${formatClock(card.arrival)} ${card.alternatives.length}`)).toEqual(['00:25 0', '00:55 0']);
  });

  it('keeps another vehicle as a card of its own, sorted by arrival', () => {
    const later = [
      ...journey('50E-later', '50E', [[birkelandsskiftet, '15:50', { platform: 'D' }], [dolvik, '16:01'], [mohlenpris, '16:18']]),
    ];
    const cards = cardsOf(rankTrips(all.flatMap((path) => trips(path, [...afternoon, ...later], '15:00'))));
    expect(cards.map((card) => `${formatClock(card.arrival)} ${card.alternatives.length}`)).toEqual(['16:35 3', '16:55 0']);
  });

  it('chooses where to get off the last vehicle, and how to walk from there, by when the traveller is there', () => {
    const blomsterdalenWalk = toAddress([ride('400', krokasskiftet, dolvik), ride('51', dolvik, blomsterdalen), walk(blomsterdalen, work, 692)], 1);
    const birkelandsskiftetWalk = toAddress(
      [ride('400', krokasskiftet, dolvik), ride('51', dolvik, birkelandsskiftet), walk(birkelandsskiftet, work, 1205)],
      1,
    );
    const morning = [
      ...journey('400', '400', [[krokasskiftet, '07:07'], [dolvik, '07:49']]),
      ...journey('51', '51', [[dolvik, '07:54'], [birkelandsskiftet, '08:02'], [blomsterdalen, '08:05']]),
    ];
    const cards = cardsOf(rankTrips([birkelandsskiftetWalk, blomsterdalenWalk].flatMap((path) => trips(path, morning, '07:00'))));

    expect(cards).toHaveLength(1);
    // Off at Blomsterdalen 08:05 and 11:32 on foot, against Birkelandsskiftet 08:02 and 20:05 on foot.
    expect(formatClock(cards[0].arrival)).toBe('08:16');
    expect(cards[0].to).toEqual(work);
    expect(cards[0].alternatives.map((trip) => formatClock(trip.arrival))).toEqual(['08:22']);
  });

  describe('the way between the last stop and the address', () => {
    const tram = stop('Birkelandsskiftet bybane');
    const adlandsflaten = stop('Ådlandsflaten');
    const lagunen = stop('Lagunen');
    const toTram = [ride('400', krokasskiftet, busstasjonen), ride('1', busstasjonen, tram, 'tram')];
    const walkFromTram = [walk(tram, work, 1225)];
    const busFromTram = [ride('53, 56', birkelandsskiftet, adlandsflaten), walk(adlandsflaten, work, 668)];
    const morning = [
      ...journey('400', '400', [[krokasskiftet, '13:47'], [busstasjonen, '14:21']]),
      ...journey('1', '1', [[busstasjonen, '14:25'], [lagunen, '14:46'], [tram, '14:54']], { transportMode: 'tram', realtime: false, started: false }),
      ...journey('56', '56', [[birkelandsskiftet, '15:02'], [adlandsflaten, '15:04']]),
    ];
    const cards = (paths: TripPath[], calls = morning, now = '13:00') =>
      cardsOf(rankTrips(paths.flatMap((path) => trips(path, calls, now))));
    const short = (trip: PlannedTrip) => `${formatClock(trip.arrival)} ${table(trip).join(' · ')}`;

    it('does not make a card of its own: walking and taking a bus from the same light rail are one card', () => {
      const [card, ...others] = cards([toAddress([...toTram, ...walkFromTram], 1), toAddress([...toTram, ...busFromTram], 2)]);

      expect(others).toEqual([]);
      // 14:54 and 20:25 on foot is 15:14:25. The bus is at Ådlandsflaten 15:04, and 11:08 on foot from there is 15:15:08.
      expect(short(card)).toBe('15:14 400 Krokåsskiftet · 1 Bergen busstasjon 4:00 · Gå Birkelandsskiftet bybane → Jobb 1225 s');
      expect(card.alternatives.map(short)).toEqual([
        '15:15 400 Krokåsskiftet · 1 Bergen busstasjon 4:00 · 56 Birkelandsskiftet 8:00 · Gå Ådlandsflaten → Jobb 668 s',
      ]);
    });

    it('takes the bus from the stop when that gets the traveller there first', () => {
      const earlier = morning.map((call) => (call.line === '56' ? { ...call, expectedArrival: at(call.stopPlaceId === adlandsflaten.id ? '15:00' : '14:58'), expectedDeparture: at(call.stopPlaceId === adlandsflaten.id ? '15:00' : '14:58') } : call));
      const [card, ...others] = cards([toAddress([...toTram, ...walkFromTram], 1), toAddress([...toTram, ...busFromTram], 2)], earlier);

      expect(others).toEqual([]);
      expect(short(card)).toBe('15:11 400 Krokåsskiftet · 1 Bergen busstasjon 4:00 · 56 Birkelandsskiftet 4:00 · Gå Ådlandsflaten → Jobb 668 s');
      expect(card.alternatives).toHaveLength(1);
    });

    it('keeps two vehicles to the stop as two cards though the same bus is taken from there', () => {
      const byBus = [ride('400', krokasskiftet, busstasjonen), ride('50E', busstasjonen, birkelandsskiftet)];
      const calls = [...morning, ...journey('50E', '50E', [[busstasjonen, '14:24'], [birkelandsskiftet, '14:58']])];
      const found = cards([toAddress([...toTram, ...busFromTram], 2), toAddress([...byBus, ...busFromTram], 2)], calls);

      // Both are there at the same time; the light rail has the larger tightest transfer and comes first.
      expect(found.map(short)).toEqual([
        '15:15 400 Krokåsskiftet · 1 Bergen busstasjon 4:00 · 56 Birkelandsskiftet 8:00 · Gå Ådlandsflaten → Jobb 668 s',
        '15:15 400 Krokåsskiftet · 50E Bergen busstasjon 3:00 · 56 Birkelandsskiftet 4:00 · Gå Ådlandsflaten → Jobb 668 s',
      ]);
      expect(found.map((card) => card.alternatives.length)).toEqual([0, 0]);
    });

    it('is one card with the vehicle that goes on past the stop, when the traveller stays on it', () => {
      const through = [
        ...journey('400', '400', [[krokasskiftet, '07:07'], [dolvik, '07:49']]),
        ...journey('51', '51', [[dolvik, '07:54'], [birkelandsskiftet, '08:02'], [blomsterdalen, '08:05']]),
      ];
      const toBirkelandsskiftet = [ride('400', krokasskiftet, dolvik), ride('51', dolvik, birkelandsskiftet)];
      const found = cards(
        [
          // Off at Birkelandsskiftet and on foot, or on with the same bus to Blomsterdalen, saved as a way to the address.
          toAddress([...toBirkelandsskiftet, walk(birkelandsskiftet, work, 1205)], 1),
          toAddress([...toBirkelandsskiftet, ride('51, 53', birkelandsskiftet, blomsterdalen), walk(blomsterdalen, work, 692)], 2),
        ],
        through,
        '07:00',
      );

      expect(found.map(short)).toEqual(['08:16 400 Krokåsskiftet · 51 Dolvik 5:00 · Gå Blomsterdalen → Jobb 692 s']);
      expect(found[0].alternatives.map(short)).toEqual(['08:22 400 Krokåsskiftet · 51 Dolvik 5:00 · Gå Birkelandsskiftet → Jobb 1205 s']);
    });

    it('does not matter home from work, where the way from the address comes first and the last vehicle decides', () => {
      const home = [
        ...journey('57', '57', [[grana, '15:23'], [birkelandsskiftet, '15:26']]),
        ...journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:58']]),
        ...journey('410', '410', [[mohlenpris, '16:03'], [krokasskiftet, '16:35']]),
      ];
      const rest = [ride('50E', birkelandsskiftet, mohlenpris), ride('410', mohlenpris, krokasskiftet)];
      const found = cardsOf(
        rankTrips(
          [[walk(work, grana, 240), ride('57', grana, birkelandsskiftet), ...rest], [walk(work, birkelandsskiftet, 1200), ...rest]].flatMap((path) =>
            trips(path, home, '15:00'),
          ),
        ),
      );
      expect(found.map((card) => `${formatClock(card.leaveAt ?? '')}–${formatClock(card.arrival)} ${card.alternatives.length}`)).toEqual(['15:19–16:35 1']);
    });
  });

  it('gives no cards for no trips', () => {
    expect(cardsOf([])).toEqual([]);
  });
});

/**
 * A trip from Birkelandsskiftet to Krokåsskiftet that leaves and arrives at the
 * given clocks. With a transfer time, it changes vehicle on the way with that
 * much to spare; without, it is one vehicle all the way.
 */
function tripAt(name: string, departs: string, arrives: string, marginSeconds?: number): PlannedTrip {
  if (marginSeconds === undefined) {
    const calls = journey(name, name, [[birkelandsskiftet, departs], [krokasskiftet, arrives]]);
    return trips([ride(name, birkelandsskiftet, krokasskiftet)], calls, '12:00')[0];
  }
  const changes = new Date(new Date(at(departs)).getTime() + 10 * 60_000);
  const onward = new Date(changes.getTime() + marginSeconds * 1000);
  const clockOf = (time: Date) => time.toISOString().slice(11, 19);
  const day = '2026-11-16';
  // Written in UTC, which is an hour behind the clocks of the other calls.
  const utc = (time: Date) => `${day}T${clockOf(time)}+00:00`;
  const calls = [
    ...journey(`${name}-first`, name, [[birkelandsskiftet, departs], [busstasjonen, departs]]).map((call) =>
      call.stopPlaceId === busstasjonen.id ? { ...call, aimedArrival: utc(changes), expectedArrival: utc(changes) } : call,
    ),
    ...journey(`${name}-last`, `${name}x`, [[busstasjonen, arrives], [krokasskiftet, arrives]]).map((call) =>
      call.stopPlaceId === busstasjonen.id ? { ...call, aimedDeparture: utc(onward), expectedDeparture: utc(onward) } : call,
    ),
  ];
  return trips([ride(name, birkelandsskiftet, busstasjonen), ride(`${name}x`, busstasjonen, krokasskiftet)], calls, '12:00')[0];
}

const named = (found: PlannedTrip[]) => found.map((trip) => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row.line] : []))[0]);

describe('the cards of the front page, the best one first', () => {
  const order = (...found: PlannedTrip[]) => named(cardsBestFirst(rankTrips(found)));

  it('has the margin of a best trip when every transfer has a minute or more', () => {
    expect(holdsWithMargin(tripAt('a', '15:00', '16:00', 60))).toBe(true);
    expect(holdsWithMargin(tripAt('b', '15:00', '16:00', 59))).toBe(false);
    expect(holdsWithMargin(tripAt('direct', '15:00', '16:00'))).toBe(true);
  });

  it('puts the trip that is there first with a minute on every transfer on top, and the rest by when they are there', () => {
    const risky = tripAt('risky', '15:00', '16:20', 30);
    const best = tripAt('best', '15:00', '16:30', 100);
    const later = tripAt('later', '15:00', '16:40', 400);
    const last = tripAt('last', '15:00', '16:50', 10);
    // The risky one is there ten minutes before the best, and stands under it.
    expect(order(later, last, risky, best)).toEqual(['best', 'risky', 'later', 'last']);
  });

  it('is sorted by when the traveller is there when no trip has a minute on every transfer', () => {
    expect(order(tripAt('b', '15:00', '16:30', 59), tripAt('a', '15:00', '16:20', 0))).toEqual(['a', 'b']);
    expect(order()).toEqual([]);
  });

  it('keeps two cards that are there in the same minute in the same order as the seconds move', () => {
    // The later start comes first of two that are there at 16:30, whichever is there first by the second.
    expect(order(tripAt('early', '15:00', '16:30:10'), tripAt('late', '15:05', '16:30:50'))).toEqual(['late', 'early']);
    expect(order(tripAt('early', '15:00', '16:30:50'), tripAt('late', '15:05', '16:30:10'))).toEqual(['late', 'early']);
    // A minute apart on the screen, the one that is there first comes first.
    expect(order(tripAt('early', '15:00', '16:30:59'), tripAt('late', '15:05', '16:31:00'))).toEqual(['early', 'late']);
  });

  it('counts the start in whole minutes too', () => {
    // Both start at 15:00 as shown. The seconds of the start do not decide; the larger tightest transfer does.
    const tighter = tripAt('tighter', '15:00:50', '16:30', 200);
    const roomier = tripAt('roomier', '15:00:10', '16:30', 400);
    expect(order(tighter, roomier)).toEqual(['roomier', 'tighter']);
  });

  it('takes the best among cards that are there in the same minute by the same order', () => {
    // Both hold. The comfortable one comes first, as within a card.
    const yellow = tripAt('yellow', '15:05', '16:30:10', 100);
    const green = tripAt('green', '15:00', '16:30:50', 400);
    expect(order(yellow, green, tripAt('risky', '15:00', '16:10', 5))).toEqual(['green', 'risky', 'yellow']);
  });

  describe('within one card', () => {
    const sameCard = (trip: PlannedTrip): PlannedTrip => ({ ...trip, cardKey: 'same' });

    it('shows a trip with a minute on every transfer before one that is there sooner without', () => {
      const sooner = sameCard(tripAt('sooner', '15:00', '16:20', 0));
      const safer = sameCard(tripAt('safer', '15:00', '16:30', 100));
      const [card] = cardsBestFirst(rankTrips([sooner, safer]));

      expect(named([card])).toEqual(['safer']);
      expect(named(card.alternatives)).toEqual(['sooner']);
      // By rank alone the one that is there first is the card.
      expect(named(cardsOf(rankTrips([sooner, safer])))).toEqual(['sooner']);
    });

    it('shows the first by rank among those with a minute on every transfer, and when none has it', () => {
      const first = sameCard(tripAt('first', '15:00', '16:20', 60));
      const second = sameCard(tripAt('second', '15:00', '16:30', 400));
      expect(named(cardsBestFirst(rankTrips([second, first])))).toEqual(['first']);

      const risky = sameCard(tripAt('risky', '15:00', '16:20', 10));
      const riskier = sameCard(tripAt('riskier', '15:00', '16:30', 0));
      const [card] = cardsBestFirst(rankTrips([riskier, risky]));
      expect(named([card])).toEqual(['risky']);
      expect(named(card.alternatives)).toEqual(['riskier']);
    });
  });
});

describe('comfortable transfers', () => {
  it('are those with more than three minutes to spare', () => {
    expect(isComfortable(tripAt('a', '15:00', '16:00', 181))).toBe(true);
    expect(isComfortable(tripAt('b', '15:00', '16:00', 180))).toBe(false);
    expect(isComfortable(tripAt('c', '15:00', '16:00', 0))).toBe(false);
  });

  it('are all of them: one tight transfer among several makes the trip tight', () => {
    const three = [ride('3', birkelandsskiftet, dolvik), ride('4', dolvik, busstasjonen), ride('403', busstasjonen, krokasskiftet)];
    const calls = (second: string) => [
      ...journey('x', '3', [[birkelandsskiftet, '15:20'], [dolvik, '15:25']]),
      ...journey('y', '4', [[dolvik, second], [busstasjonen, '15:45']]),
      ...journey('z', '403', [[busstasjonen, '15:55'], [krokasskiftet, '16:30']]),
    ];
    expect(isComfortable(trips(three, calls('15:35'), '15:00')[0])).toBe(true);
    expect(isComfortable(trips(three, calls('15:27'), '15:00')[0])).toBe(false);
  });

  it('are not needed on a trip with one vehicle, which counts as comfortable', () => {
    expect(isComfortable(tripAt('a', '15:00', '16:00'))).toBe(true);
  });

  it('come before a later start among trips that are there together', () => {
    // The tight one lets the traveller leave four minutes later; the comfortable one is still preferred.
    const tight = tripAt('tight', '14:41', '16:07', 158);
    const comfortable = tripAt('comfortable', '14:37', '16:07', 413);
    expect(named(rankTrips([tight, comfortable]))).toEqual(['comfortable', 'tight']);
  });

  it('do not come before being there earlier', () => {
    const tight = tripAt('tight', '14:41', '16:06', 158);
    const comfortable = tripAt('comfortable', '14:37', '16:07', 413);
    expect(named(rankTrips([comfortable, tight]))).toEqual(['tight', 'comfortable']);
  });

  it('leave the later start to decide between two comfortable trips, and between two tight ones', () => {
    expect(named(rankTrips([tripAt('early', '14:37', '16:07', 600), tripAt('late', '14:41', '16:07', 200)]))).toEqual(['late', 'early']);
    expect(named(rankTrips([tripAt('early', '14:37', '16:07', 170), tripAt('late', '14:41', '16:07', 20)]))).toEqual(['late', 'early']);
  });

  it('decide which trip of a card is the card', () => {
    const tight = { ...tripAt('tight', '14:41', '16:07', 158), cardKey: 'same' };
    const comfortable = { ...tripAt('comfortable', '14:37', '16:07', 413), cardKey: 'same' };
    const [card] = cardsOf(rankTrips([tight, comfortable]));
    expect(named([card])).toEqual(['comfortable']);
    expect(named(card.alternatives)).toEqual(['tight']);
  });
});

describe('hideBeaten', () => {
  const cards = (...found: PlannedTrip[]): TripCard[] => cardsOf(rankTrips(found));
  const split = (...found: PlannedTrip[]) => {
    const { shown, hidden } = hideBeaten(cards(...found));
    return { shown: named(shown), hidden: named(hidden) };
  };

  it('hides a card when another starts later and is there at the same time', () => {
    expect(split(tripAt('early', '15:00', '16:30'), tripAt('late', '15:10', '16:30'))).toEqual({ shown: ['late'], hidden: ['early'] });
  });

  it('hides a card when another starts at the same time and is there sooner', () => {
    expect(split(tripAt('slow', '15:00', '16:40'), tripAt('fast', '15:00', '16:30'))).toEqual({ shown: ['fast'], hidden: ['slow'] });
  });

  it('hides a card when another both starts later and is there sooner', () => {
    expect(split(tripAt('worse', '15:00', '16:40'), tripAt('better', '15:10', '16:30'))).toEqual({ shown: ['better'], hidden: ['worse'] });
  });

  it('shows both when one starts later and the other is there sooner', () => {
    expect(split(tripAt('first', '15:00', '16:30'), tripAt('second', '15:10', '16:40'))).toEqual({ shown: ['first', 'second'], hidden: [] });
  });

  it('shows both of two cards that start and are there at the same moments, in the order they are ranked', () => {
    // Neither is better than the other on start or arrival. The larger tightest transfer ranks first.
    const tighter = tripAt('tighter', '15:00', '16:30', 200);
    const roomier = tripAt('roomier', '15:00', '16:30', 400);
    expect(split(tighter, roomier)).toEqual({ shown: ['roomier', 'tighter'], hidden: [] });
    expect(split(roomier, tighter)).toEqual({ shown: ['roomier', 'tighter'], hidden: [] });
  });

  it('does not hide a card with only comfortable transfers because of a card with a tight one', () => {
    const comfortable = tripAt('comfortable', '15:00', '16:30', 400);
    const tight = tripAt('tight', '15:10', '16:30', 100);
    // Both are there at the same time, so the comfortable one ranks first though it starts earlier.
    expect(split(comfortable, tight)).toEqual({ shown: ['comfortable', 'tight'], hidden: [] });
    // Nor one without a transfer, which is as comfortable as it gets.
    expect(split(tripAt('direct', '15:00', '16:30'), tight)).toEqual({ shown: ['direct', 'tight'], hidden: [] });
  });

  it('hides a card with a tight transfer because of a comfortable one, or of another tight one', () => {
    const tight = tripAt('tight', '15:00', '16:30', 100);
    expect(split(tight, tripAt('comfortable', '15:10', '16:30', 400))).toEqual({ shown: ['comfortable'], hidden: ['tight'] });
    expect(split(tight, tripAt('tightToo', '15:10', '16:30', 70))).toEqual({ shown: ['tightToo'], hidden: ['tight'] });
  });

  it('does not hide any card because of one with a transfer of less than a minute', () => {
    const early = tripAt('early', '15:00', '16:30', 100);
    // It starts later and is there at the same time, but with 59 seconds it may not hold.
    expect(split(early, tripAt('risky', '15:10', '16:30', 59))).toEqual({ shown: ['risky', 'early'], hidden: [] });
    expect(split(early, tripAt('holds', '15:10', '16:30', 60))).toEqual({ shown: ['holds'], hidden: ['early'] });
    // Nor a card without a transfer, nor another risky one.
    expect(split(tripAt('direct', '15:00', '16:40'), tripAt('risky', '15:10', '16:30', 0))).toEqual({ shown: ['risky', 'direct'], hidden: [] });
    expect(split(tripAt('riskyToo', '15:00', '16:30', 10), tripAt('risky', '15:10', '16:30', 59))).toEqual({ shown: ['risky', 'riskyToo'], hidden: [] });
  });

  it('hides a card with a transfer of less than a minute because of one that holds', () => {
    expect(split(tripAt('risky', '15:00', '16:30', 30), tripAt('holds', '15:10', '16:30', 100))).toEqual({ shown: ['holds'], hidden: ['risky'] });
  });

  it('shows a card it is told to keep, whatever beats it', () => {
    const found = cards(tripAt('early', '15:00', '16:30'), tripAt('late', '15:10', '16:30'));
    const early = found.find((card) => named([card])[0] === 'early');
    const { shown, hidden } = hideBeaten(found, early);
    expect({ shown: named(shown), hidden: named(hidden) }).toEqual({ shown: ['late', 'early'], hidden: [] });
  });

  it('hides a comfortable card because of another comfortable one', () => {
    expect(split(tripAt('early', '15:00', '16:30', 400), tripAt('late', '15:10', '16:30', 200))).toEqual({ shown: ['late'], hidden: ['early'] });
  });

  it('hides every card in a chain where each is beaten by the next', () => {
    const found = split(tripAt('a', '15:00', '16:30'), tripAt('b', '15:05', '16:30'), tripAt('c', '15:10', '16:30'));
    expect(found).toEqual({ shown: ['c'], hidden: ['b', 'a'] });
  });

  it('keeps the shown cards sorted by when the traveller is there, and the hidden ones too', () => {
    const found = split(
      tripAt('a', '15:00', '16:30'),
      tripAt('b', '15:20', '16:50'),
      tripAt('c', '15:40', '17:10'),
      tripAt('slowA', '14:50', '16:45'),
      tripAt('slowB', '15:15', '17:00'),
    );
    expect(found).toEqual({ shown: ['a', 'b', 'c'], hidden: ['slowA', 'slowB'] });
  });

  it('counts the start as when the traveller must leave the address', () => {
    const onFoot = trips(
      [walk(work, birkelandsskiftet, 1200), ride('50E', birkelandsskiftet, krokasskiftet)],
      journey('50E', '50E', [[birkelandsskiftet, '15:30'], [krokasskiftet, '16:30']]),
      '12:00',
    )[0];
    const byBus = trips(
      [walk(work, grana, 240), ride('57', grana, krokasskiftet)],
      journey('57', '57', [[grana, '15:25'], [krokasskiftet, '16:30']]),
      '12:00',
    )[0];
    // The 57 leaves its stop first, but the traveller leaves work eleven minutes later for it.
    const { shown, hidden } = hideBeaten(cards(onFoot, byBus));
    expect(named(shown)).toEqual(['57']);
    expect(named(hidden)).toEqual(['50E']);
  });

  it('keeps the trips behind a hidden card', () => {
    const behind = { ...tripAt('behind', '14:50', '16:30'), cardKey: 'early' };
    const early = { ...tripAt('early', '15:00', '16:30'), cardKey: 'early' };
    const { hidden } = hideBeaten(cards(behind, early, tripAt('late', '15:10', '16:30')));
    expect(named(hidden)).toEqual(['early']);
    expect(named(hidden[0].alternatives)).toEqual(['behind']);
  });

  it('gives nothing for no cards', () => {
    expect(hideBeaten([])).toEqual({ shown: [], hidden: [] });
  });
});

describe('on board the first vehicle', () => {
  const path = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)];
  const calls = [
    ...journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:57']]),
    ...journey('410', '410', [[mohlenpris, '16:02'], [krokasskiftet, '16:35']]),
  ];

  it('does not offer a first vehicle that has left, unless the traveller is on it', () => {
    expect(trips(path, calls, '15:40')).toEqual([]);

    const [trip] = trips(path, calls, '15:40', {}, { boarded: true });
    expect(table(trip)).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 5:00']);
    expect(formatClock(trip.arrival)).toBe('16:35');
  });

  it('still needs a way on from the vehicle', () => {
    const gone = calls.map((call) => (call.line === '410' ? { ...call, cancelled: true } : call));
    expect(trips(path, gone, '15:40', {}, { boarded: true })).toEqual([]);
  });
});

describe('with a least transfer time asked for', () => {
  const path = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)];
  const calls = [
    ...journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:58']]),
    ...journey('a', '410', [[mohlenpris, '15:58:59'], [krokasskiftet, '16:32']]),
    ...journey('b', '410', [[mohlenpris, '15:59:00'], [krokasskiftet, '16:33']]),
    ...journey('c', '410', [[mohlenpris, '16:20'], [krokasskiftet, '16:53']]),
  ];

  it('takes the first departure that leaves that much to spare, to the second', () => {
    // Without it, the bus 59 seconds after the 50E is the trip.
    expect(table(trips(path, calls, '15:00')[0])).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 0:59']);

    const [trip] = trips(path, calls, '15:00', {}, { minMarginSeconds: 60 });
    expect(table(trip)).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 1:00']);
    expect(formatClock(trip.arrival)).toBe('16:33');

    const [later] = trips(path, calls, '15:00', {}, { minMarginSeconds: 61 });
    expect(table(later)).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 22:00']);
  });

  it('gives no trip when no departure leaves that much, and counts before any grace', () => {
    expect(trips(path, calls, '15:00', {}, { minMarginSeconds: 1321 })).toEqual([]);
    const [trip] = trips(path, calls, '15:00', {}, { minMarginSeconds: 60, missedGraceSeconds: 60 });
    expect(table(trip)).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 1:00']);
  });

  it('asks it of every transfer of the trip', () => {
    const three = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, storavatnet), ride('400', storavatnet, krokasskiftet)];
    const more = [
      ...journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:58']]),
      ...journey('on', '410', [[mohlenpris, '16:02'], [storavatnet, '16:15']]),
      ...journey('tight', '400', [[storavatnet, '16:15:30'], [krokasskiftet, '16:35']]),
      ...journey('safe', '400', [[storavatnet, '16:35'], [krokasskiftet, '16:55']]),
    ];
    expect(table(trips(three, more, '15:00')[0])).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 4:00', '400 Storavatnet 0:30']);
    expect(table(trips(three, more, '15:00', {}, { minMarginSeconds: 60 })[0])).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris 4:00', '400 Storavatnet 20:00']);
  });
});

describe('with a rule of its own for which transfers are taken', () => {
  const path = [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)];
  const calls = [
    ...journey('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:58']]),
    ...journey('a', '410', [[mohlenpris, '15:57:30'], [krokasskiftet, '16:32']]),
    ...journey('b', '410', [[mohlenpris, '16:05'], [krokasskiftet, '16:40']]),
  ];

  it('asks the rule about each transfer, with the two rides and the transfer time', () => {
    const asked: string[] = [];
    const [trip] = trips(path, calls, '15:00', {}, {
      allowTransfer: (from, to, marginSeconds) => {
        asked.push(`${from.line} → ${to.serviceJourneyId} ${marginSeconds}`);
        return to.serviceJourneyId === 'journey:a';
      },
    });
    expect(asked).toEqual(['50E → journey:a -30', '50E → journey:b 420']);
    // The rule took the bus that left half a minute before, and not the one that is caught.
    expect(table(trip)).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris −0:30']);
  });

  it('counts before the limits, and gives no trip when the rule takes no transfer', () => {
    const none = { allowTransfer: () => false, missedGraceSeconds: 60 };
    expect(trips(path, calls, '15:00', {}, none)).toEqual([]);
    const all = { allowTransfer: () => true, minMarginSeconds: 600 };
    expect(table(trips(path, calls, '15:00', {}, all)[0])).toEqual(['50E Birkelandsskiftet', '410 Møhlenpris −0:30']);
  });
});

describe('what a missed transfer costs', () => {
  const adlandsflaten = stop('Ådlandsflaten');
  const lightRail = ride('1', busstasjonen, birkelandsskiftet, 'tram');
  // From Birkelandsskiftet the traveller walks, or takes the 56 two stops and walks from there.
  const walking: TripPath = toAddress([ride('400', krokasskiftet, busstasjonen), lightRail, walk(birkelandsskiftet, work, 1200)], 1);
  const byBus: TripPath = toAddress(
    [ride('400', krokasskiftet, busstasjonen), lightRail, ride('56', birkelandsskiftet, adlandsflaten), walk(adlandsflaten, work, 660)],
    2,
  );
  const calls = [
    ...journey('400', '400', [[krokasskiftet, '07:09'], [busstasjonen, '07:48']]),
    ...journey('1-a', '1', [[busstasjonen, '07:50'], [birkelandsskiftet, '08:24']]),
    ...journey('1-b', '1', [[busstasjonen, '07:55'], [birkelandsskiftet, '08:29']]),
    ...journey('56', '56', [[birkelandsskiftet, '08:31'], [adlandsflaten, '08:36']]),
  ];
  const all = (paths: TripPath[]) => {
    const byStop = groupCallsByStop(calls);
    return tripsOnPaths(paths, (leg) => ridesOnLeg(leg, byStop), walkLookup({ transferWalks: [], walkOverrides: {} }), new Date(at('07:00')));
  };
  const ifMissed = (trip: PlannedTrip) =>
    trip.rows.flatMap((row) => (row.kind === 'ride' && row.transfer ? [row.transfer.arrivalIfMissed && formatClock(row.transfer.arrivalIfMissed)] : []));

  it('is the next departure along the path, when there is only that path', () => {
    const [trip] = all([walking]);
    expect(formatClock(trip.arrival)).toBe('08:44');
    // The next light rail is at Birkelandsskiftet at 08:29, twenty minutes from work.
    expect(ifMissed(trip)).toEqual(['08:49']);
  });

  it('is the next possible trip onward by any path that has come the same way', () => {
    const [onFoot, onThe56] = all([walking, byBus]);

    // The first light rail is too early for the 56 to be of use: both trips are there at 08:44 or later.
    expect(formatClock(onFoot.arrival)).toBe('08:44');
    expect(formatClock(onThe56.arrival)).toBe('08:47');
    // After the next light rail the 56 is there at 08:47, before the walk at 08:49. That holds whichever trip was planned.
    expect(ifMissed(onFoot)).toEqual(['08:47']);
    // Missing the 56, the last one, leaves the walk from Birkelandsskiftet, which the other path makes: 08:24 and twenty minutes.
    expect(ifMissed(onThe56)).toEqual(['08:47', '08:44']);
  });

  it('does not count a path that has come another way to the stop', () => {
    const other: TripPath = toAddress(
      [ride('410', krokasskiftet, busstasjonen), lightRail, ride('56', birkelandsskiftet, adlandsflaten), walk(adlandsflaten, work, 660)],
      2,
    );
    const [onFoot] = all([walking, other]);
    expect(ifMissed(onFoot)).toEqual(['08:49']);
  });
});
