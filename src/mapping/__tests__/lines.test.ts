import { lookupTimes, stretches, withLegLines } from '@/mapping/lines';
import type { Connection, Leg, MappedAlternative, StopRef } from '@/model/types';

const K: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const KL: StopRef = { id: 'NSR:StopPlace:30815', name: 'Kleppestø terminal' };
const QUAY: StopRef = { id: 'NSR:StopPlace:32539', name: 'Kleppestø båtkai' };
const STRAND: StopRef = { id: 'NSR:StopPlace:59223', name: 'Strandkaiterminalen båtkai' };
const F: StopRef = { id: 'NSR:StopPlace:31000', name: 'Frieda Fasmer rv. 555' };
const KOK: StopRef = { id: 'NSR:StopPlace:59582', name: 'Kokstadskiftet' };
const G: StopRef = { id: 'NSR:StopPlace:29485', name: 'Grana' };
const WORK: StopRef = { id: 'place:work', name: 'Jobb' };

const ride = (lines: string[], from: StopRef, to: StopRef, mode = 'bus'): Leg => ({ kind: 'transit', from, to, lines, mode });
const walk = (from: StopRef, to: StopRef): Leg => ({ kind: 'walk', from, to, seconds: 300 });

const alternative = (legs: Leg[], connections: Connection[] = []): MappedAlternative =>
  ({ key: legs.map((l) => `${l.from.id}>${l.to.id}`).join('|'), tripType: 'toWork', legs, connections }) as MappedAlternative;

const toGrana: Connection = {
  key: 'grana',
  tripType: 'toWork',
  anchor: KOK,
  legs: [ride(['57'], KOK, G), walk(G, WORK)],
};

const boat = alternative([ride(['400'], K, KL), ride(['490'], QUAY, STRAND, 'water')]);
const viaFrieda = alternative([ride(['400'], K, F), ride(['23E'], F, KOK)], [toGrana]);
const viaFriedaToo = alternative([ride(['400', '410'], K, F), ride(['24'], F, KOK)], [toGrana]);

const linesOf = (legs: Leg[]) => legs.map((leg) => (leg.kind === 'transit' ? leg.lines : 'walk'));

describe('lookupTimes', () => {
  it('keeps the start times an hour apart, from the first', () => {
    expect(lookupTimes(['06:30', '06:50', '07:10', '07:30', '07:50', '08:10', '08:30'])).toEqual([
      '06:30',
      '07:30',
      '08:30',
    ]);
    expect(lookupTimes(['14:30', '14:50', '15:10', '15:30', '15:50', '16:10', '16:30', '16:50'])).toEqual([
      '14:30',
      '15:30',
      '16:30',
    ]);
  });

  it('keeps the only start time, and none when there is none', () => {
    expect(lookupTimes(['07:00'])).toEqual(['07:00']);
    expect(lookupTimes([])).toEqual([]);
  });
});

describe('stretches', () => {
  it('lists each pair of stops once, rides on the way to the address included, walks left out', () => {
    const pairs = stretches([boat, viaFrieda, viaFriedaToo]).map((leg) => `${leg.from.name} → ${leg.to.name}`);
    expect(pairs).toEqual([
      'Krokåsskiftet → Kleppestø terminal',
      'Kleppestø båtkai → Strandkaiterminalen båtkai',
      'Krokåsskiftet → Frieda Fasmer rv. 555',
      'Frieda Fasmer rv. 555 → Kokstadskiftet',
      'Kokstadskiftet → Grana',
    ]);
  });
});

describe('withLegLines', () => {
  it('adds the lines looked up on a stretch to the ones the suggestions used', () => {
    const [filled] = withLegLines([boat], { [`${K.id}>${KL.id}`]: ['403', '400'] });
    expect(linesOf(filled.legs)).toEqual([['400', '403'], ['490']]);
  });

  it('gives a stretch the same lines in every alternative that rides it', () => {
    const [first, second] = withLegLines([viaFrieda, viaFriedaToo], {});
    expect(linesOf(first.legs)).toEqual([['400', '410'], ['23E', '24']]);
    expect(linesOf(second.legs)).toEqual([['400', '410'], ['23E', '24']]);
  });

  it('fills the rides on the way to the address as well, and leaves walks alone', () => {
    const [filled] = withLegLines([viaFrieda], { [`${KOK.id}>${G.id}`]: ['57', '56'] });
    expect(linesOf(filled.connections[0].legs)).toEqual([['56', '57'], 'walk']);
    expect(filled.connections[0].legs[1]).toEqual(walk(G, WORK));
  });

  it('keeps a line the suggestions used even when the lookup did not find it', () => {
    const [filled] = withLegLines([boat], { [`${K.id}>${KL.id}`]: ['403'], [`${QUAY.id}>${STRAND.id}`]: [] });
    expect(linesOf(filled.legs)).toEqual([['400', '403'], ['490']]);
  });

  it('does not change the alternatives it was given', () => {
    withLegLines([boat], { [`${K.id}>${KL.id}`]: ['403'] });
    expect(linesOf(boat.legs)).toEqual([['400'], ['490']]);
  });
});
