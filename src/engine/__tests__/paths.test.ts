import { ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths, type TripPath } from '@/engine/paths';
import { describeChain } from '@/mapping/describe';
import type { Alternative, Connection, Leg, StopRef, TripTypeId } from '@/model/types';

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const grana = stop('Grana');
const birkelandsskiftet = stop('Birkelandsskiftet');
const bybanestopp = stop('Birkelandsskiftet bybane');
const kokstadskiftet = stop('Kokstadskiftet');
const dolvik = stop('Dolvik');
const sandslivegen = stop('Sandslivegen');
const mohlenpris = stop('Møhlenpris');
const storavatnet = stop('Storavatnet');
const blomsterdalen = stop('Blomsterdalen');

let nextKey = 0;
const alternative = (legs: Leg[], tripType: TripTypeId = 'fromWork'): Alternative => ({
  key: `a${nextKey++}`,
  tripType,
  legs,
});
const connection = (anchor: StopRef, legs: Leg[], tripType: TripTypeId = 'fromWork'): Connection => ({
  key: `c${nextKey++}`,
  tripType,
  anchor,
  legs,
});

/** "Gå Jobb>Grana · 57 Grana>Birkelandsskiftet", so that the stops show as well as the lines. */
const describe_ = (path: TripPath) =>
  path.legs.map((leg) => `${leg.kind === 'walk' ? 'Gå' : leg.lines.join(', ')} ${leg.from.name}>${leg.to.name}`).join(' · ');
const chains = (paths: TripPath[]) => paths.map((path) => describeChain(path.legs)).sort();

const viaMohlenpris = alternative([ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)]);
const viaStoravatnet = alternative([
  ride('50E, 51', birkelandsskiftet, dolvik),
  ride('23, 23E', dolvik, storavatnet),
  ride('400, 410', storavatnet, krokasskiftet),
]);
const walkToBirkelandsskiftet = connection(birkelandsskiftet, [walk(work, birkelandsskiftet, 1212)]);
const busToBirkelandsskiftet = connection(birkelandsskiftet, [walk(work, grana, 224), ride('57', grana, birkelandsskiftet)]);

const routes = (alternatives: Alternative[], connections: Connection[], transferWalks = [] as ReturnType<typeof transferWalk>[]) => ({
  alternatives,
  connections,
  transferWalks,
});

describe('tripPaths from work', () => {
  it('joins every way from the address with every way on from the stop it leads to', () => {
    const paths = tripPaths(routes([viaMohlenpris, viaStoravatnet], [walkToBirkelandsskiftet, busToBirkelandsskiftet]), 'fromWork');

    expect(paths.map(describe_).sort()).toEqual([
      'Gå Jobb>Birkelandsskiftet · 50E Birkelandsskiftet>Møhlenpris · 400, 410 Møhlenpris>Krokåsskiftet',
      'Gå Jobb>Birkelandsskiftet · 50E, 51 Birkelandsskiftet>Dolvik · 23, 23E Dolvik>Storavatnet · 400, 410 Storavatnet>Krokåsskiftet',
      'Gå Jobb>Grana · 57 Grana>Birkelandsskiftet · 50E Birkelandsskiftet>Møhlenpris · 400, 410 Møhlenpris>Krokåsskiftet',
      'Gå Jobb>Grana · 57 Grana>Birkelandsskiftet · 50E, 51 Birkelandsskiftet>Dolvik · 23, 23E Dolvik>Storavatnet · 400, 410 Storavatnet>Krokåsskiftet',
    ]);
  });

  it('combines legs across the saved alternatives', () => {
    const dolvikToMohlenpris = alternative([
      ride('23, 51', kokstadskiftet, dolvik),
      ride('50E', dolvik, mohlenpris),
      ride('400, 410', mohlenpris, krokasskiftet),
    ]);
    const paths = tripPaths(routes([viaStoravatnet, dolvikToMohlenpris], [walkToBirkelandsskiftet]), 'fromWork');

    // The second is saved nowhere: it starts as one alternative and ends as the other.
    expect(chains(paths)).toEqual(['Gå → 50E, 51 → 23, 23E → 400, 410', 'Gå → 50E, 51 → 50E → 400, 410']);
  });

  it('starts only where a way from the address leads', () => {
    const fromKokstadskiftet = alternative([ride('23, 23E', kokstadskiftet, storavatnet), ride('400, 410', storavatnet, krokasskiftet)]);
    expect(tripPaths(routes([fromKokstadskiftet], [walkToBirkelandsskiftet]), 'fromWork')).toEqual([]);

    const walkThere = connection(kokstadskiftet, [walk(work, kokstadskiftet, 1493)]);
    expect(chains(tripPaths(routes([fromKokstadskiftet], [walkThere]), 'fromWork'))).toEqual(['Gå → 23, 23E → 400, 410']);
  });

  it('joins a way from the address that is saved for the stop beside the one it ends at', () => {
    const byLightRail = alternative([
      ride('1', bybanestopp, sandslivegen),
      ride('23, 23E', sandslivegen, storavatnet),
      ride('400, 410', storavatnet, krokasskiftet),
    ]);
    // The bus from Grana stops at the bus terminal; the connection is saved for the light rail stop beside it.
    const busToLightRail = connection(bybanestopp, [walk(work, grana, 224), ride('57', grana, birkelandsskiftet)]);

    const paths = tripPaths(routes([byLightRail], [busToLightRail]), 'fromWork');
    expect(paths.map(describe_)).toEqual([
      'Gå Jobb>Grana · 57 Grana>Birkelandsskiftet · 1 Birkelandsskiftet bybane>Sandslivegen · 23, 23E Sandslivegen>Storavatnet · 400, 410 Storavatnet>Krokåsskiftet',
    ]);
  });

  describe('two stops of one terminal', () => {
    const sandslivegenBane = stop('Sandslivegen bybane');
    const toLightRail = alternative([ride('51', birkelandsskiftet, sandslivegenBane), ride('1', sandslivegenBane, mohlenpris)]);
    const fromBusStop = alternative([ride('23, 23E', sandslivegen, storavatnet), ride('400, 410', storavatnet, krokasskiftet)]);

    it('are not changed between unless something says it can be done', () => {
      expect(tripPaths(routes([toLightRail, fromBusStop], [walkToBirkelandsskiftet]), 'fromWork')).toEqual([]);
    });

    it('are changed between where a mapping run saw it done', () => {
      const seen = [transferWalk(sandslivegenBane, 'A', sandslivegen, 'C', 78)];
      const paths = tripPaths(routes([toLightRail, fromBusStop], [walkToBirkelandsskiftet], seen), 'fromWork');
      expect(chains(paths)).toEqual(['Gå → 51 → 23, 23E → 400, 410']);
    });

    it('are changed between where a saved alternative does it', () => {
      const saved = alternative([
        ride('1', bybanestopp, sandslivegenBane),
        ride('23, 23E', sandslivegen, storavatnet),
        ride('400, 410', storavatnet, krokasskiftet),
      ]);
      const paths = tripPaths(routes([saved], [connection(bybanestopp, [walk(work, bybanestopp, 1262)])]), 'fromWork');
      expect(chains(paths)).toEqual(['Gå → 1 → 23, 23E → 400, 410']);
    });
  });

  it('counts the vehicles on the way from the address among the five a trip may have', () => {
    const a = stop('A');
    const b = stop('B');
    const c = stop('C');
    const long = alternative([
      ride('1', birkelandsskiftet, a),
      ride('2', a, b),
      ride('3', b, c),
      ride('4', c, storavatnet),
      ride('400', storavatnet, krokasskiftet),
    ]);
    const paths = tripPaths(routes([long], [walkToBirkelandsskiftet, busToBirkelandsskiftet]), 'fromWork');
    expect(chains(paths)).toEqual(['Gå → 1 → 2 → 3 → 4 → 400']);
  });

  it('never passes the same stop twice, also counting the way from the address', () => {
    const viaGrana = alternative([ride('57', birkelandsskiftet, grana), ride('99', grana, mohlenpris), ride('400', mohlenpris, krokasskiftet)]);
    const paths = tripPaths(routes([viaGrana], [walkToBirkelandsskiftet, busToBirkelandsskiftet]), 'fromWork');
    // Taking the 57 from Grana and then the 57 back to Grana is not a trip.
    expect(chains(paths)).toEqual(['Gå → 57 → 99 → 400']);
  });

  it('lists a path once though two connections give it', () => {
    const again = connection(birkelandsskiftet, [walk(work, birkelandsskiftet, 1250)]);
    const paths = tripPaths(routes([viaMohlenpris], [walkToBirkelandsskiftet, again]), 'fromWork');
    expect(paths).toHaveLength(1);
  });
});

describe('tripPaths to work', () => {
  const morning = alternative(
    [ride('400, 410', krokasskiftet, storavatnet), ride('23', storavatnet, dolvik), ride('51', dolvik, blomsterdalen)],
    'toWork',
  );
  const toBirkelandsskiftet = alternative(
    [ride('400, 410', krokasskiftet, storavatnet), ride('23', storavatnet, dolvik), ride('50E, 51', dolvik, birkelandsskiftet)],
    'toWork',
  );
  const walkFromBlomsterdalen = connection(blomsterdalen, [walk(blomsterdalen, work, 692)], 'toWork');
  const busFromBirkelandsskiftet = connection(
    birkelandsskiftet,
    [ride('57', birkelandsskiftet, grana), walk(grana, work, 222)],
    'toWork',
  );

  it('ends every way with the way from its last stop to the address', () => {
    const paths = tripPaths(routes([morning, toBirkelandsskiftet], [walkFromBlomsterdalen, busFromBirkelandsskiftet]), 'toWork');
    expect(paths.map(describe_).sort()).toEqual([
      '400, 410 Krokåsskiftet>Storavatnet · 23 Storavatnet>Dolvik · 50E, 51 Dolvik>Birkelandsskiftet · 57 Birkelandsskiftet>Grana · Gå Grana>Jobb',
      '400, 410 Krokåsskiftet>Storavatnet · 23 Storavatnet>Dolvik · 51 Dolvik>Blomsterdalen · Gå Blomsterdalen>Jobb',
    ]);
  });

  it('does not ride a leg, or take a way to the address, that is saved for the other trip type', () => {
    // Both would fit into a trip to work if they were not saved for the trip home.
    const homeward = alternative([ride('99', dolvik, blomsterdalen), ride('400', blomsterdalen, krokasskiftet)], 'fromWork');
    const homewardWay = connection(blomsterdalen, [ride('57', blomsterdalen, grana), walk(grana, work, 222)], 'fromWork');

    const paths = tripPaths(routes([morning, homeward], [walkFromBlomsterdalen, homewardWay]), 'toWork');
    expect(chains(paths)).toEqual(['400, 410 → 23 → 51 → Gå']);
  });

  it('tells how many of the last legs are the way from the stop to the address', () => {
    const paths = tripPaths(routes([morning, toBirkelandsskiftet], [walkFromBlomsterdalen, busFromBirkelandsskiftet]), 'toWork');
    expect(paths.map((path) => `${describeChain(path.legs)}: ${path.legsToAddress}`).sort()).toEqual([
      '400, 410 → 23 → 50E, 51 → 57 → Gå: 2',
      '400, 410 → 23 → 51 → Gå: 1',
    ]);

    // Home from work the way to the address comes first, and the trip ends at a stop.
    const home = tripPaths(routes([viaMohlenpris], [walkToBirkelandsskiftet, busToBirkelandsskiftet]), 'fromWork');
    expect(home.map((path) => path.legsToAddress)).toEqual([0, 0]);
  });

  it('uses only what is saved for the trip type asked for', () => {
    const everything = routes(
      [morning, toBirkelandsskiftet, viaMohlenpris, viaStoravatnet],
      [walkFromBlomsterdalen, busFromBirkelandsskiftet, walkToBirkelandsskiftet, busToBirkelandsskiftet],
    );
    expect(tripPaths(everything, 'toWork')).toHaveLength(2);
    expect(tripPaths(everything, 'fromWork')).toHaveLength(4);
  });

  it('gives nothing when nothing is saved', () => {
    expect(tripPaths(routes([], []), 'toWork')).toEqual([]);
    expect(tripPaths(routes([morning], []), 'toWork')).toEqual([]);
  });
});
