import { toStopHits } from '@/entur/stops';
import { setLogSinks } from '@/logging/logger';
import { findDirectLeg, findWalkSeconds } from '@/mapping/direct';
import type { TripLegResponse, TripPatternResponse, TripSearchParams } from '@/mapping/query';
import { HOME, WORK } from '@/model/places';
import type { StopRef } from '@/model/types';

beforeEach(() => setLogSinks([]));

/** The stop as the traveller searched for it, and as Entur names it in trips. */
const searchedBirkelandsskiftet: StopRef = { id: 'NSR:StopPlace:58537', name: 'Birkelandsskiftet terminal' };
const busStop: StopRef = { id: 'NSR:StopPlace:30168', name: 'Birkelandsskiftet terminal' };
const mohlenpris: StopRef = { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' };
const dolvik: StopRef = { id: 'NSR:StopPlace:30146', name: 'Dolvik terminal' };

const at = (stop: StopRef) => ({ name: stop.name, quay: { id: `q:${stop.id}`, publicCode: null, stopPlace: stop } });
const ride = (line: string, from: StopRef, to: StopRef): TripLegResponse => ({
  mode: 'bus',
  distance: 9000,
  duration: 1500,
  line: { id: `SKY:Line:${line}`, publicCode: line },
  fromPlace: at(from),
  toPlace: at(to),
});
const trip = (legs: TripLegResponse[], duration = 1800): TripPatternResponse => ({
  duration,
  aimedStartTime: '',
  aimedEndTime: '',
  legs,
});

const deps = (search: (params: TripSearchParams) => Promise<TripPatternResponse[]>) => ({
  search,
  date: '2026-11-16',
});

describe('findDirectLeg', () => {
  it('collects the lines that run directly, across the day', async () => {
    const calls: TripSearchParams[] = [];
    const found = await findDirectLeg(
      searchedBirkelandsskiftet,
      mohlenpris,
      deps(async (params) => {
        calls.push(params);
        return params.dateTime.includes('T07:00')
          ? [trip([ride('50E', busStop, mohlenpris)])]
          : [trip([ride('50E', busStop, mohlenpris)]), trip([ride('51', busStop, mohlenpris)])];
      }),
    );

    expect(calls.map((c) => c.dateTime)).toEqual([
      '2026-11-16T07:00:00+01:00',
      '2026-11-16T12:00:00+01:00',
      '2026-11-16T16:00:00+01:00',
    ]);
    expect(found?.lines).toEqual(['50E', '51']);
  });

  it('answers with the stops Entur uses in trips, not the ones searched for', async () => {
    const found = await findDirectLeg(
      searchedBirkelandsskiftet,
      mohlenpris,
      deps(async () => [trip([ride('50E', busStop, mohlenpris)])]),
    );
    expect(found?.from).toEqual(busStop);
    expect(found?.to).toEqual(mohlenpris);
  });

  it('finds the ride when Entur first walks from the stop searched for to the one it uses', async () => {
    const shortWalk: TripLegResponse = {
      mode: 'foot',
      distance: 80,
      duration: 70,
      line: null,
      fromPlace: at(searchedBirkelandsskiftet),
      toPlace: at(busStop),
    };
    const found = await findDirectLeg(
      searchedBirkelandsskiftet,
      mohlenpris,
      deps(async () => [trip([shortWalk, ride('50E', busStop, mohlenpris)])]),
    );
    expect(found).toMatchObject({ from: busStop, to: mohlenpris, lines: ['50E'] });
  });

  it('ignores suggestions that change vehicle on the way', async () => {
    const found = await findDirectLeg(
      searchedBirkelandsskiftet,
      mohlenpris,
      deps(async () => [trip([ride('51', busStop, dolvik), ride('50E', dolvik, mohlenpris)])]),
    );
    expect(found).toBeNull();
  });

  it('still answers when some of the searches fail', async () => {
    let n = 0;
    const found = await findDirectLeg(
      searchedBirkelandsskiftet,
      mohlenpris,
      deps(async () => {
        if (n++ === 0) throw new Error('nettverksfeil');
        return [trip([ride('50E', busStop, mohlenpris)])];
      }),
    );
    expect(found?.lines).toEqual(['50E']);
  });
});

describe('findDirectLeg when Entur does not answer', () => {
  it('fails rather than reporting no direct ride when every search fails', async () => {
    await expect(
      findDirectLeg(searchedBirkelandsskiftet, mohlenpris, deps(async () => Promise.reject(new Error('nettverksfeil')))),
    ).rejects.toThrow('nettverksfeil');
  });

  it('fails when nothing was found and some searches went unanswered, since those may have found it', async () => {
    let n = 0;
    await expect(
      findDirectLeg(
        searchedBirkelandsskiftet,
        mohlenpris,
        deps(async () => {
          if (n++ === 0) throw new Error('nettverksfeil');
          return [];
        }),
      ),
    ).rejects.toThrow('nettverksfeil');
  });

  it('reports no direct ride only when every search answered', async () => {
    expect(await findDirectLeg(searchedBirkelandsskiftet, mohlenpris, deps(async () => []))).toBeNull();
  });
});

describe('findWalkSeconds', () => {
  it("asks for the way on foot and returns Entur's walking time", async () => {
    const calls: TripSearchParams[] = [];
    const seconds = await findWalkSeconds(
      WORK,
      HOME,
      deps(async (params) => {
        calls.push(params);
        return [trip([], 1212)];
      }),
    );

    expect(seconds).toBe(1212);
    expect(calls).toMatchObject([{ onFoot: true, from: WORK, to: HOME }]);
  });

  it('returns null when Entur finds no way on foot', async () => {
    expect(await findWalkSeconds(WORK, HOME, deps(async () => []))).toBeNull();
  });
});

describe('toStopHits', () => {
  it('keeps stop places with their label and drops everything else', () => {
    expect(
      toStopHits({
        features: [
          { properties: { id: 'NSR:StopPlace:29485', name: 'Grana', label: 'Grana, Bergen' } },
          { properties: { id: 'KVE:TopographicPlace:4601', name: 'Bergen', label: 'Bergen' } },
          { properties: { id: 'NSR:StopPlace:35441', name: 'Grane' } },
        ],
      }),
    ).toEqual([
      { id: 'NSR:StopPlace:29485', name: 'Grana', label: 'Grana, Bergen' },
      { id: 'NSR:StopPlace:35441', name: 'Grane', label: 'Grane' },
    ]);
  });
});
