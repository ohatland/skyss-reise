import { describeChain, describeConnections, describeStats, describeStops } from '@/mapping/describe';
import {
  connectionsFor,
  groupAlternatives,
  mergePatterns,
  shortStopName,
  sortLines,
  toPattern,
} from '@/mapping/pattern';
import type { TripLegResponse, TripPatternResponse } from '@/mapping/query';
import { HOME, TRIP_TYPES, WORK } from '@/model/places';
import { placeSide, type Place } from '@/model/types';

const stops = {
  grana: { id: 'NSR:StopPlace:29485', name: 'Grana' },
  birkelandsskiftet: { id: 'NSR:StopPlace:30168', name: 'Birkelandsskiftet terminal' },
  dolvik: { id: 'NSR:StopPlace:30146', name: 'Dolvik terminal' },
  friedaFasmer: { id: 'NSR:StopPlace:3', name: 'Frieda Fasmer rv. 555' },
  storavatnet: { id: 'NSR:StopPlace:31984', name: 'Storavatnet terminal' },
  mohlenpris: { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' },
  bybanestopp: { id: 'NSR:StopPlace:30169', name: 'Birkelandsskiftet terminal' },
  byparken: { id: 'NSR:StopPlace:2', name: 'Byparken' },
  strandkaien: { id: 'NSR:StopPlace:59223', name: 'Strandkaiterminalen båtkai' },
  kleppestoKai: { id: 'NSR:StopPlace:32539', name: 'Kleppestø båtkai' },
  kleppesto: { id: 'NSR:StopPlace:30815', name: 'Kleppestø terminal' },
  krokasskiftet: { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' },
};
type StopKey = keyof typeof stops;

const at = (key: StopKey | null) => ({
  name: key ? stops[key].name : 'Origin',
  quay: key ? { stopPlace: stops[key] } : null,
});

function ride(line: string, from: StopKey, to: StopKey, mode = 'bus'): TripLegResponse {
  return {
    mode,
    distance: 5000,
    duration: 600,
    line: { id: `SKY:Line:${line}`, publicCode: line },
    fromPlace: at(from),
    toPlace: at(to),
  };
}

/** A walk; null is the address at either end of the trip. */
function walk(from: StopKey | null, to: StopKey | null, meters: number, seconds = meters): TripLegResponse {
  return { mode: 'foot', distance: meters, duration: seconds, line: null, fromPlace: at(from), toPlace: at(to) };
}

function trip(durationMinutes: number, legs: TripLegResponse[]): TripPatternResponse {
  return { duration: durationMinutes * 60, aimedStartTime: '', aimedEndTime: '', legs };
}

function patterns(trips: TripPatternResponse[], from: Place, to: Place) {
  return trips.map((t) => {
    const p = toPattern(t, from, to);
    if (!p) throw new Error('expected a pattern');
    return p;
  });
}

const walkToBirkelandsskiftet = walk(null, 'birkelandsskiftet', 1467, 1212);
const walkToGrana = walk(null, 'grana', 257, 224);

describe('toPattern', () => {
  it('keeps the walk from work to the first stop as a leg, with its walking time', () => {
    const [p] = patterns(
      [
        trip(68, [
          walkToGrana,
          ride('57', 'grana', 'birkelandsskiftet'),
          walk('birkelandsskiftet', 'birkelandsskiftet', 40),
          ride('50E', 'birkelandsskiftet', 'mohlenpris'),
          ride('410', 'mohlenpris', 'krokasskiftet'),
        ]),
      ],
      WORK,
      HOME,
    );

    expect(p.legs.map((leg) => leg.kind)).toEqual(['walk', 'transit', 'transit', 'transit']);
    expect(p.legs[0]).toEqual({
      kind: 'walk',
      from: { id: 'place:work', name: 'Jobb' },
      to: stops.grana,
      seconds: 224,
    });
    expect(p.lineIds).toEqual(['SKY:Line:57', 'SKY:Line:50E', 'SKY:Line:410']);
  });

  it('drops a short walk between platforms but keeps a long walk between stops', () => {
    const [p] = patterns(
      [
        trip(97, [
          walkToBirkelandsskiftet,
          ride('1', 'birkelandsskiftet', 'byparken', 'tram'),
          walk('byparken', 'strandkaien', 668),
          ride('490', 'strandkaien', 'kleppestoKai', 'water'),
          walk('kleppestoKai', 'kleppesto', 120),
          ride('400', 'kleppesto', 'krokasskiftet'),
        ]),
      ],
      WORK,
      HOME,
    );

    expect(describeChain(p.legs)).toBe('Gå → 1 → Gå → 490 → 400');
  });

  it('returns null for a suggestion that is only walking', () => {
    expect(toPattern(trip(90, [walk(null, null, 6000)]), WORK, HOME)).toBeNull();
  });
});

describe('mergePatterns from an address', () => {
  const fromWork = TRIP_TYPES.fromWork;
  const side = placeSide(fromWork);

  const merged = mergePatterns(
    patterns(
      [
        trip(77, [walkToBirkelandsskiftet, ride('50E', 'birkelandsskiftet', 'mohlenpris'), ride('400', 'mohlenpris', 'krokasskiftet')]),
        trip(69, [walkToGrana, ride('57', 'grana', 'birkelandsskiftet'), ride('50E', 'birkelandsskiftet', 'mohlenpris'), ride('410', 'mohlenpris', 'krokasskiftet')]),
        trip(70, [walkToBirkelandsskiftet, ride('51', 'birkelandsskiftet', 'dolvik'), ride('23', 'dolvik', 'storavatnet'), ride('400', 'storavatnet', 'krokasskiftet')]),
        trip(82, [walkToGrana, ride('57', 'grana', 'birkelandsskiftet'), ride('50E', 'birkelandsskiftet', 'dolvik'), ride('23E', 'dolvik', 'storavatnet'), ride('400', 'storavatnet', 'krokasskiftet')]),
        trip(103, [walkToBirkelandsskiftet, ride('1', 'birkelandsskiftet', 'byparken', 'tram'), walk('byparken', 'strandkaien', 668), ride('490', 'strandkaien', 'kleppestoKai', 'water'), ride('400', 'kleppesto', 'krokasskiftet')]),
      ],
      WORK,
      HOME,
    ),
    fromWork,
  );
  const viaMohlenpris = merged.find((a) => a.group === 'Via Møhlenpris')!;
  const viaStoravatnet = merged.find((a) => a.group === 'Via Storavatnet')!;

  it('makes one alternative of trips that differ only in how the traveller gets to the first stop', () => {
    expect(merged.map((a) => a.group)).toEqual(['Via Møhlenpris', 'Via Storavatnet', 'Med båt']);
    expect(describeChain(viaMohlenpris.legs)).toBe('50E → 400, 410');
    expect(viaMohlenpris.anchor).toEqual(stops.birkelandsskiftet);
  });

  it('collects the lines of one stretch into one leg, in timetable order', () => {
    expect(describeChain(viaStoravatnet.legs)).toBe('50E, 51 → 23, 23E → 400');
  });

  it('reports the range of door-to-door travel times and the transfers on the way', () => {
    expect(viaMohlenpris).toMatchObject({
      minDurationSeconds: 69 * 60,
      maxDurationSeconds: 77 * 60,
      transfers: 1,
      timesFound: 2,
      tripType: 'fromWork',
    });
    expect(describeStats(viaMohlenpris)).toBe('69–77 min · 1 bytte');
  });

  it('gives every alternative from the same stop all the ways of getting there, walking first', () => {
    const expected = 'Fra jobb: gå 20 min · 57 fra Grana';
    expect(describeConnections(viaMohlenpris, side, 'Jobb')).toBe(expected);
    expect(describeConnections(viaStoravatnet, side, 'Jobb')).toBe(expected);
    expect(merged.find((a) => a.usesBoat)?.connections).toHaveLength(2);
  });

  it('names every boarding stop', () => {
    expect(describeStops(viaStoravatnet.legs, side)).toBe('Birkelandsskiftet · Dolvik · Storavatnet');
  });

  it('never marks the boat as rare for being slow', () => {
    expect(merged.find((a) => a.usesBoat)?.rare).toBe(false);
  });

  it('saves each connection once however many alternatives share it', () => {
    expect(connectionsFor(merged).map((c) => describeChain(c.legs))).toEqual(['Gå', 'Gå → 57']);
  });

  it('gives a shared connection to both stops of a terminal with two stop places', () => {
    const tram = ride('1', 'bybanestopp', 'byparken', 'tram');
    const onward = ride('400', 'byparken', 'krokasskiftet');
    const bus = [ride('50E', 'birkelandsskiftet', 'mohlenpris'), ride('400', 'mohlenpris', 'krokasskiftet')];
    const from57 = [walkToGrana, ride('57', 'grana', 'birkelandsskiftet')];

    const both = mergePatterns(
      patterns(
        [
          trip(80, [walk(null, 'bybanestopp', 1500, 1260), tram, onward]),
          trip(75, [...from57, walk('birkelandsskiftet', 'bybanestopp', 60), tram, onward]),
          trip(77, [walkToBirkelandsskiftet, ...bus]),
          trip(69, [...from57, ...bus]),
        ],
        WORK,
        HOME,
      ),
      fromWork,
    );

    expect(both.map((a) => describeConnections(a, side, 'Jobb')).sort()).toEqual([
      'Fra jobb: gå 20 min · 57 fra Grana',
      'Fra jobb: gå 21 min · 57 fra Grana',
    ]);
  });

  it('marks a much slower bus route as rare', () => {
    const withSlow = mergePatterns(
      patterns(
        [
          trip(50, [walkToBirkelandsskiftet, ride('51', 'birkelandsskiftet', 'dolvik'), ride('23', 'dolvik', 'storavatnet'), ride('400', 'storavatnet', 'krokasskiftet')]),
          trip(80, [walkToBirkelandsskiftet, ride('50E', 'birkelandsskiftet', 'mohlenpris'), ride('400', 'mohlenpris', 'krokasskiftet')]),
        ],
        WORK,
        HOME,
      ),
      fromWork,
    );
    expect(withSlow.find((a) => a.group === 'Via Møhlenpris')?.rare).toBe(true);
    expect(withSlow.find((a) => a.group === 'Via Storavatnet')?.rare).toBe(false);
  });
});

describe('mergePatterns to an address', () => {
  const toWork = TRIP_TYPES.toWork;
  const side = placeSide(toWork);
  const trunk = [
    ride('400', 'krokasskiftet', 'friedaFasmer'),
    ride('23E', 'friedaFasmer', 'dolvik'),
    ride('51', 'dolvik', 'birkelandsskiftet'),
  ];

  const merged = mergePatterns(
    patterns(
      [
        trip(82, [...trunk, walk('birkelandsskiftet', null, 1467, 1212)]),
        trip(76, [...trunk, ride('57', 'birkelandsskiftet', 'grana'), walk('grana', null, 257, 224)]),
      ],
      HOME,
      WORK,
    ),
    toWork,
  );

  it('ends the alternative at the first stop the traveller can walk to work from', () => {
    expect(merged).toHaveLength(1);
    expect(describeChain(merged[0].legs)).toBe('400 → 23E → 51');
    expect(merged[0].anchor).toEqual(stops.birkelandsskiftet);
    expect(merged[0]).toMatchObject({ minDurationSeconds: 76 * 60, maxDurationSeconds: 82 * 60, transfers: 2 });
  });

  it('describes the ways on from there', () => {
    expect(describeConnections(merged[0], side, 'Jobb')).toBe('Til jobb: gå 20 min · 57 til Grana');
  });

  it('names the transfer stops and where the traveller gets off', () => {
    expect(describeStops(merged[0].legs, side)).toBe('Frieda Fasmer rv. 555 · Dolvik · Birkelandsskiftet');
  });
});

describe('groupAlternatives', () => {
  it('puts the boat last even when it is not the slowest', () => {
    const fast = { group: 'Med båt', minDurationSeconds: 100 } as never;
    const slow = { group: 'Via Møhlenpris', minDurationSeconds: 200 } as never;
    expect(groupAlternatives([fast, slow]).map((g) => g.name)).toEqual(['Via Møhlenpris', 'Med båt']);
  });
});

describe('helpers', () => {
  it('sorts line codes numerically, with letter suffixes after the plain number', () => {
    expect(sortLines(['400', '23E', '50E', '23', '1', '410', '23'])).toEqual(['1', '23', '23E', '50E', '400', '410']);
  });

  it('shortens terminal and quay names', () => {
    expect(shortStopName('Storavatnet terminal')).toBe('Storavatnet');
    expect(shortStopName('Kleppestø båtkai')).toBe('Kleppestø');
    expect(shortStopName('Møhlenpris')).toBe('Møhlenpris');
  });
});
