import { appendLeg } from '@/mapping/build';
import { chainKey } from '@/mapping/pattern';
import type { Leg, StopRef } from '@/model/types';

const byparken: StopRef = { id: 'NSR:StopPlace:2', name: 'Byparken' };
/** Birkelandsskiftet as the stop search names it, and as trips do. */
const searched: StopRef = { id: 'NSR:StopPlace:58537', name: 'Birkelandsskiftet terminal' };
const inTrips: StopRef = { id: 'NSR:StopPlace:30168', name: 'Birkelandsskiftet terminal' };
const mohlenpris: StopRef = { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' };

const tram: Leg = { kind: 'transit', from: { id: 'NSR:StopPlace:30169', name: 'Bybanen' }, to: byparken, lines: ['1'], mode: 'tram' };
const walk: Leg = { kind: 'walk', from: byparken, to: searched, seconds: 600 };
const bus: Leg = { kind: 'transit', from: inTrips, to: mohlenpris, lines: ['50E'], mode: 'bus' };

describe('appendLeg', () => {
  it('makes a walk end where the next ride starts, with the stop Entur uses in trips', () => {
    const legs = appendLeg(appendLeg(appendLeg([], tram), walk), bus);
    expect(legs[1]).toEqual({ kind: 'walk', from: byparken, to: inTrips, seconds: 600 });
    expect(chainKey(legs)).toBe(`t:${tram.from.id}>${byparken.id}|w:${byparken.id}>${inTrips.id}|t:${inTrips.id}>${mohlenpris.id}`);
  });

  it('leaves a walk that already ends where the ride starts', () => {
    const exact: Leg = { ...walk, to: inTrips };
    expect(appendLeg([tram, exact], bus)).toEqual([tram, exact, bus]);
  });

  it('adds rides and walks after a ride as they are', () => {
    expect(appendLeg([tram], walk)).toEqual([tram, walk]);
    expect(appendLeg([tram], bus)).toEqual([tram, bus]);
  });
});
