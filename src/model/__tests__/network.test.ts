import { describeChain } from '@/mapping/describe';
import { buildNetwork, findPaths } from '@/model/network';
import type { Leg, StopRef, TransferWalk } from '@/model/types';

const stop = (name: string): StopRef => ({ id: `stop:${name}`, name });
const krokasskiftet = stop('Krokåsskiftet');
const kleppesto = stop('Kleppestø');
const storavatnet = stop('Storavatnet');
const sandslivegen = stop('Sandslivegen');
const dolvik = stop('Dolvik');
const birkelandsskiftet = stop('Birkelandsskiftet');
const bybanestopp = stop('Birkelandsskiftet bybane');
const byparken = stop('Byparken');
const strandkaien = stop('Strandkaiterminalen');

const ride = (lines: string, from: StopRef, to: StopRef): Leg => ({
  kind: 'transit',
  from,
  to,
  lines: lines.split(', '),
  mode: 'bus',
});
const walk = (from: StopRef, to: StopRef): Leg => ({ kind: 'walk', from, to, seconds: 300 });

const direct = [ride('400, 410', krokasskiftet, storavatnet), ride('23', storavatnet, sandslivegen), ride('1', sandslivegen, birkelandsskiftet)];
const viaKleppesto = [
  ride('403', krokasskiftet, kleppesto),
  ride('407', kleppesto, storavatnet),
  ride('23', storavatnet, dolvik),
  ride('50E', dolvik, birkelandsskiftet),
];

const chains = (paths: Leg[][]) => paths.map(describeChain).sort();

describe('buildNetwork', () => {
  it('keeps each leg once and collects the lines of every alternative that uses it', () => {
    const network = buildNetwork([
      [ride('400', krokasskiftet, storavatnet), ride('23', storavatnet, dolvik)],
      [ride('410', krokasskiftet, storavatnet), ride('23E', storavatnet, dolvik)],
    ]);
    expect(network.legs.map((leg) => (leg.kind === 'transit' ? leg.lines.join(', ') : 'gå'))).toEqual([
      '400, 410',
      '23, 23E',
    ]);
  });

  it('links two stops of one terminal where the mapping saw a change between them', () => {
    const between: TransferWalk = {
      key: 'q:buss>q:bane',
      from: { id: 'q:buss', platform: null, stop: birkelandsskiftet },
      to: { id: 'q:bane', platform: null, stop: bybanestopp },
      fromLines: ['57'],
      toLines: ['1'],
      seconds: 75,
    };
    const sameStop: TransferWalk = { ...between, key: 'q:buss>q:buss', to: between.from };

    const network = buildNetwork([], [between, sameStop]);
    expect([...network.links]).toEqual([`${birkelandsskiftet.id}>${bybanestopp.id}`]);
  });
});

describe('findPaths', () => {
  it('combines legs across the saved alternatives', () => {
    const network = buildNetwork([direct, viaKleppesto]);

    expect(chains(findPaths(network, [krokasskiftet], birkelandsskiftet))).toEqual([
      '400, 410 → 23 → 1',
      '400, 410 → 23 → 50E',
      '403 → 407 → 23 → 1',
      '403 → 407 → 23 → 50E',
    ]);
  });

  it('respects the limit on vehicles', () => {
    const network = buildNetwork([direct, viaKleppesto]);
    expect(chains(findPaths(network, [krokasskiftet], birkelandsskiftet, { maxVehicles: 3 }))).toEqual([
      '400, 410 → 23 → 1',
      '400, 410 → 23 → 50E',
    ]);
  });

  it('starts from any of the given stops', () => {
    const network = buildNetwork([direct, viaKleppesto]);
    expect(chains(findPaths(network, [sandslivegen, dolvik], birkelandsskiftet))).toEqual(['1', '50E']);
  });

  it('follows a walking leg between two vehicles, but never ends on one', () => {
    const network = buildNetwork([
      [ride('1', birkelandsskiftet, byparken), walk(byparken, strandkaien), ride('490', strandkaien, kleppesto)],
      [ride('50E', birkelandsskiftet, byparken)],
    ]);

    expect(chains(findPaths(network, [birkelandsskiftet], kleppesto))).toEqual(['1, 50E → Gå → 490']);
    expect(findPaths(network, [birkelandsskiftet], strandkaien)).toEqual([]);
  });

  it('changes between the linked stops of a terminal', () => {
    const link: TransferWalk = {
      key: 'q:buss>q:bane',
      from: { id: 'q:buss', platform: null, stop: birkelandsskiftet },
      to: { id: 'q:bane', platform: null, stop: bybanestopp },
      fromLines: ['57'],
      toLines: ['1'],
      seconds: 75,
    };
    const network = buildNetwork([[ride('57', dolvik, birkelandsskiftet)], [ride('1', bybanestopp, byparken)]], [link]);

    expect(chains(findPaths(network, [dolvik], byparken))).toEqual(['57 → 1']);
    expect(findPaths(buildNetwork(network.legs.map((leg) => [leg])), [dolvik], byparken)).toEqual([]);
  });

  it('never passes the same stop twice', () => {
    const network = buildNetwork([
      [ride('400', krokasskiftet, storavatnet), ride('23', storavatnet, dolvik)],
      [ride('23', dolvik, storavatnet), ride('50E', dolvik, birkelandsskiftet)],
    ]);
    expect(chains(findPaths(network, [krokasskiftet], birkelandsskiftet))).toEqual(['400 → 23 → 50E']);
  });
});
