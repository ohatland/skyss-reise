import { nextWeekday, osloIso, osloOffsetMinutes, parseClock, timesInWindow } from '@/core/oslo-time';
import { setLogSinks } from '@/logging/logger';
import { buildTripQuery, type TripPatternResponse, type TripSearchParams } from '@/mapping/query';
import { dominantLines, extendWithVia, runMapping, totalSearches } from '@/mapping/run';
import { DEFAULT_VIA_STOPS, HOME, TRIP_TYPES, WORK } from '@/model/places';

beforeEach(() => setLogSinks([]));

const stop = (id: string, name: string) => ({
  name,
  quay: { id: `quay:${id}`, publicCode: null, stopPlace: { id, name } },
});
const leg = (line: string, from: [string, string], to: [string, string]) => ({
  mode: 'bus',
  distance: 5000,
  duration: 600,
  line: { id: `SKY:Line:${line}`, publicCode: line },
  fromPlace: stop(...from),
  toPlace: stop(...to),
});
const B: [string, string] = ['NSR:StopPlace:58537', 'Birkelandsskiftet terminal'];
const M: [string, string] = ['NSR:StopPlace:30918', 'Møhlenpris'];
const S: [string, string] = ['NSR:StopPlace:58538', 'Sandslivegen'];
const K: [string, string] = ['NSR:StopPlace:32541', 'Krokåsskiftet'];

const trip = (minutes: number, legs: ReturnType<typeof leg>[]): TripPatternResponse => ({
  duration: minutes * 60,
  aimedStartTime: '',
  aimedEndTime: '',
  legs,
});

describe('oslo time', () => {
  it('knows the offset in winter and summer', () => {
    expect(osloOffsetMinutes(new Date('2026-11-16T12:00:00Z'))).toBe(60);
    expect(osloOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(120);
  });

  it('builds timestamps with the right offset', () => {
    expect(osloIso('2026-11-16', '14:30')).toBe('2026-11-16T14:30:00+01:00');
    expect(osloIso('2026-07-01', '06:45')).toBe('2026-07-01T06:45:00+02:00');
  });

  it('finds the next weekday, skipping the weekend', () => {
    expect(nextWeekday(new Date('2026-11-13T22:00:00+01:00'))).toBe('2026-11-16');
    expect(nextWeekday(new Date('2026-11-16T08:00:00+01:00'))).toBe('2026-11-17');
    expect(nextWeekday(new Date('2026-11-14T23:30:00+01:00'))).toBe('2026-11-16');
  });

  it.each([
    ['6:30', '06:30'],
    ['06:30', '06:30'],
    ['14.05', '14:05'],
    [' 23:59 ', '23:59'],
  ] as const)('reads %s as a time of day', (text, clock) => {
    expect(parseClock(text)).toBe(clock);
  });

  it.each(['', '6', '24:00', '12:60', 'halv sju', '6:3'])('rejects %s as a time of day', (text) => {
    expect(parseClock(text)).toBeNull();
  });

  it('gives no start times when the window ends before it begins', () => {
    expect(timesInWindow('17:00', '14:30', 20)).toEqual([]);
  });

  it('lists start times through the window, end included', () => {
    expect(timesInWindow('14:30', '17:00', 20)).toEqual(['14:30', '14:50', '15:10', '15:30', '15:50', '16:10', '16:30', '16:50']);
    expect(timesInWindow('06:30', '07:30', 30)).toEqual(['06:30', '07:00', '07:30']);
  });
});

describe('buildTripQuery', () => {
  const base: TripSearchParams = { from: WORK, to: HOME, dateTime: '2026-11-16T15:00:00+01:00' };

  it('searches from the work coordinates to the home stop, only with what the ticket covers', () => {
    const query = buildTripQuery(base);
    expect(query).toContain('from: {coordinates: {latitude: 60.283051, longitude: 5.242414}, name: "Jobb"}');
    expect(query).toContain('to: {place: "NSR:StopPlace:32541"}');
    expect(query).toContain('whiteListed: {authorities: ["SKY:Authority:SKY","VYG:Authority:VYT"]}');
    expect(query).toContain('ignoreRealtimeUpdates: true');
    expect(query).not.toContain('banned');
    expect(query).not.toContain('via');
  });

  it('can ask for walking the whole way', () => {
    expect(buildTripQuery({ ...base, onFoot: true })).toContain('modes: {directMode: foot, transportModes: []}');
    expect(buildTripQuery(base)).not.toContain('modes:');
  });

  it('adds banned lines, via stop and the looser search settings when asked', () => {
    const query = buildTripQuery({
      ...base,
      bannedLines: ['SKY:Line:50E', 'SKY:Line:51'],
      viaStopPlaceId: 'NSR:StopPlace:59223',
      walkReluctance: 1.5,
      maximumAdditionalTransfers: 2,
      transferPenalty: 0,
    });
    expect(query).toContain('banned: {lines: ["SKY:Line:50E","SKY:Line:51"]}');
    expect(query).toContain('via: [{visit: {stopLocationIds: ["NSR:StopPlace:59223"]}}]');
    expect(query).toContain('walkReluctance: 1.5');
    expect(query).toContain('maximumAdditionalTransfers: 2');
    expect(query).toContain('transferPenalty: 0');
  });
});

describe('dominantLines', () => {
  it('home from work: ranks lines by use but spares the last vehicle, which ends at the home stop', () => {
    const patterns = [
      { lineIds: ['SKY:Line:50E', 'SKY:Line:400'] },
      { lineIds: ['SKY:Line:50E', 'SKY:Line:410'] },
      { lineIds: ['SKY:Line:51', 'SKY:Line:23', 'SKY:Line:400'] },
    ] as never;
    expect(dominantLines(patterns, 2, TRIP_TYPES.fromWork)).toEqual(['SKY:Line:50E', 'SKY:Line:23']);
  });

  it('to work: spares the first vehicle, which leaves from the home stop', () => {
    const patterns = [
      { lineIds: ['SKY:Line:400', 'SKY:Line:23', 'SKY:Line:50E'] },
      { lineIds: ['SKY:Line:400', 'SKY:Line:23E', 'SKY:Line:51'] },
      { lineIds: ['SKY:Line:410', 'SKY:Line:50E'] },
      { lineIds: ['SKY:Line:400', 'SKY:Line:51'] },
    ] as never;
    expect(dominantLines(patterns, 2, TRIP_TYPES.toWork)).toEqual(['SKY:Line:50E', 'SKY:Line:51']);
  });
});

describe('runMapping', () => {
  const config = {
    tripType: TRIP_TYPES.fromWork,
    date: '2026-11-16',
    times: ['15:00', '15:20'],
    viaStops: DEFAULT_VIA_STOPS,
  };

  it('searches every time in every pass and reports progress', async () => {
    const calls: TripSearchParams[] = [];
    const progress: [number, number][] = [];

    const result = await runMapping(config, {
      search: async (params) => {
        calls.push(params);
        return [trip(60, [leg('50E', B, M), leg('400', M, K)])];
      },
      onProgress: (done, total) => progress.push([done, total]),
    });

    // At most 14; one pass is skipped, since only 50E can be searched without.
    expect(totalSearches(config)).toBe(14);
    expect(calls).toHaveLength(12);
    expect(result.searches).toBe(12);
    expect(progress[progress.length - 1]).toEqual([12, 12]);
    expect(calls.every((c) => c.from === WORK && c.to === HOME)).toBe(true);
    expect(new Set(calls.map((c) => c.dateTime))).toEqual(
      new Set(['2026-11-16T15:00:00+01:00', '2026-11-16T15:20:00+01:00']),
    );
    expect(calls.filter((c) => c.viaStopPlaceId).map((c) => c.viaStopPlaceId)).toEqual(
      expect.arrayContaining(DEFAULT_VIA_STOPS.map((s) => s.id)),
    );
  });

  it('bans the dominant lines cumulatively: one in the first pass, two in the second', async () => {
    const calls: TripSearchParams[] = [];
    const result = await runMapping(config, {
      search: async (params) => {
        calls.push(params);
        return [trip(60, [leg('50E', B, M), leg('400', M, K)]), trip(65, [leg('51', B, S), leg('400', S, K)])];
      },
    });

    expect(result.bannedLines).toEqual(['SKY:Line:50E', 'SKY:Line:51']);
    expect(calls.filter((c) => c.bannedLines).map((c) => c.bannedLines)).toEqual([
      ['SKY:Line:50E'],
      ['SKY:Line:50E'],
      ['SKY:Line:50E', 'SKY:Line:51'],
      ['SKY:Line:50E', 'SKY:Line:51'],
    ]);
  });

  it('to work: bans the lines further on, never the bus from the home stop', async () => {
    const calls: TripSearchParams[] = [];
    await runMapping(
      { ...config, tripType: TRIP_TYPES.toWork, viaStops: [] },
      {
        search: async (params) => {
          calls.push(params);
          return [trip(60, [leg('400', K, M), leg('50E', M, B)]), trip(65, [leg('400', K, S), leg('51', S, B)])];
        },
      },
    );

    const banned = calls.flatMap((c) => c.bannedLines ?? []);
    expect(banned).not.toContain('SKY:Line:400');
    expect(new Set(banned)).toEqual(new Set(['SKY:Line:50E', 'SKY:Line:51']));
  });

  it('skips a pass that would repeat a search, and counts only the searches made', async () => {
    const calls: TripSearchParams[] = [];
    const progress: [number, number][] = [];
    const result = await runMapping(
      { ...config, viaStops: [] },
      {
        // Every trip is direct, so there is no line to search without.
        search: async (params) => {
          calls.push(params);
          return [trip(60, [leg('400', B, K)])];
        },
        onProgress: (done, total) => progress.push([done, total]),
      },
    );

    expect(calls).toHaveLength(6);
    expect(calls.some((c) => c.bannedLines)).toBe(false);
    expect(result.searches).toBe(6);
    expect(progress[progress.length - 1]).toEqual([6, 6]);
  });

  it('runs no more searches at once than the limit', async () => {
    let running = 0;
    let most = 0;
    await runMapping(config, {
      concurrency: 2,
      search: async () => {
        running++;
        most = Math.max(most, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        running--;
        return [trip(60, [leg('50E', B, M), leg('400', M, K)])];
      },
    });
    expect(most).toBe(2);
  });

  it('searches again without the line that dominated the first passes', async () => {
    const result = await runMapping(config, {
      search: async (params) =>
        params.bannedLines?.includes('SKY:Line:50E')
          ? [trip(55, [leg('1', B, S), leg('400', S, K)])]
          : [trip(60, [leg('50E', B, M), leg('400', M, K)])],
    });

    expect(result.bannedLines[0]).toBe('SKY:Line:50E');
    expect(result.alternatives.map((a) => a.group).sort()).toEqual(['Via Møhlenpris', 'Via Sandslivegen']);
  });

  it('skips failed searches and counts them', async () => {
    let n = 0;
    const result = await runMapping(config, {
      search: async () => {
        if (n++ % 2 === 0) throw new Error('nettverksfeil');
        return [trip(60, [leg('50E', B, M), leg('400', M, K)])];
      },
    });

    expect(result.failedSearches).toBe(result.searches / 2);
    expect(result.alternatives).toHaveLength(1);
  });

  it('returns no alternatives when nothing is found', async () => {
    const result = await runMapping(config, { search: async () => [] });
    expect(result.alternatives).toEqual([]);
  });

  it('can be extended with a search through one more stop', async () => {
    const first = await runMapping(config, {
      search: async () => [trip(60, [leg('50E', B, M), leg('400', M, K)])],
    });
    const calls: TripSearchParams[] = [];

    const extended = await extendWithVia(first, config, { id: 'NSR:StopPlace:58538', name: 'Sandslivegen' }, {
      search: async (params) => {
        calls.push(params);
        return [trip(55, [leg('1', B, S), leg('400', S, K)])];
      },
    });

    expect(calls).toHaveLength(config.times.length);
    expect(calls.every((c) => c.viaStopPlaceId === 'NSR:StopPlace:58538')).toBe(true);
    expect(extended.searches).toBe(first.searches + config.times.length);
    expect(extended.alternatives.map((a) => a.group).sort()).toEqual(['Via Møhlenpris', 'Via Sandslivegen']);
    expect(first.alternatives).toHaveLength(1);
  });
});
