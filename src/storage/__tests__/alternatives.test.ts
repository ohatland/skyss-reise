import AsyncStorage from '@react-native-async-storage/async-storage';

import { setLogSinks } from '@/logging/logger';
import type { Alternative, Connection, Leg, QuayRef, StopRef, TransferWalk } from '@/model/types';
import {
  addAlternative,
  loadRoutes,
  mergeTransferWalkLists,
  NO_ROUTES,
  readRoutes,
  removeAlternative,
  saveMapping,
  setLegLines,
  setWalkOverride,
  type SavedRoutes,
} from '@/storage/alternatives';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

const stop = (name: string): StopRef => ({ id: `stop:${name}`, name });
const birkelandsskiftet = stop('Birkelandsskiftet');
const mohlenpris = stop('Møhlenpris');
const krokasskiftet = stop('Krokåsskiftet');
const dolvik = stop('Dolvik');
const grana = stop('Grana');
const work: StopRef = { id: 'place:work', name: 'Jobb' };

const ride = (lines: string, from: StopRef, to: StopRef): Leg => ({
  kind: 'transit',
  from,
  to,
  lines: lines.split(', '),
  mode: 'bus',
});
const alternative = (key: string, legs: Leg[], tripType: Alternative['tripType'] = 'fromWork'): Alternative => ({
  key,
  tripType,
  legs,
});
const connection = (key: string, anchor: StopRef, legs: Leg[], tripType: Alternative['tripType'] = 'fromWork'): Connection => ({
  key,
  tripType,
  anchor,
  legs,
});
const quay = (id: string, s: StopRef): QuayRef => ({ id, platform: null, stop: s });
const transfer = (key: string, fromLines: string[], toLines: string[], seconds: number): TransferWalk => ({
  key,
  from: quay('q:a', mohlenpris),
  to: quay('q:b', mohlenpris),
  fromLines,
  toLines,
  seconds,
});

const viaMohlenpris = alternative('mohlenpris', [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)]);
const viaDolvik = alternative('dolvik', [ride('51', birkelandsskiftet, dolvik), ride('400', dolvik, krokasskiftet)]);
const walkToBirkelandsskiftet = connection('walk', birkelandsskiftet, [
  { kind: 'walk', from: work, to: birkelandsskiftet, seconds: 1212 },
]);

async function seed(routes: Partial<SavedRoutes>) {
  await AsyncStorage.setItem('alternatives:v4', JSON.stringify({ ...NO_ROUTES, ...routes }));
}

beforeEach(async () => {
  setLogSinks([]);
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('reading', () => {
  it('reads nothing saved as no routes', async () => {
    expect(await readRoutes()).toEqual(NO_ROUTES);
  });

  it('shows a failed read as nothing saved, but readRoutes passes the failure on', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    expect(await loadRoutes()).toEqual(NO_ROUTES);
    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    await expect(readRoutes()).rejects.toThrow('lagringsfeil');
  });
});

describe('a failed read never leads to a write', () => {
  const writes: [string, () => Promise<SavedRoutes>][] = [
    ['setWalkOverride', () => setWalkOverride('q:a>q:b', 30)],
    ['setLegLines', () => setLegLines('fromWork', 'mohlenpris', 1, ['400'])],
    ['removeAlternative', () => removeAlternative('fromWork', 'dolvik')],
    ['addAlternative', () => addAlternative(viaDolvik)],
    [
      'saveMapping',
      () => saveMapping('fromWork', { found: [viaMohlenpris], chosen: ['mohlenpris'], connections: [], transferWalks: [] }),
    ],
  ];

  it.each(writes)('%s keeps what was saved', async (_, write) => {
    await seed({ alternatives: [viaMohlenpris, viaDolvik], connections: [walkToBirkelandsskiftet] });
    const before = await readRoutes();
    storage.setItem.mockClear();

    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    await expect(write()).rejects.toThrow('lagringsfeil');

    expect(storage.setItem).not.toHaveBeenCalled();
    expect(await readRoutes()).toEqual(before);
  });

  it('lets the next change go ahead after a failed one', async () => {
    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    await expect(setWalkOverride('q:a>q:b', 30)).rejects.toThrow();
    expect((await setWalkOverride('q:a>q:b', 45)).walkOverrides).toEqual({ 'q:a>q:b': 45 });
  });
});

describe('changes one after another', () => {
  it('runs two quick changes in turn, so the second builds on the first', async () => {
    await seed({ alternatives: [viaMohlenpris] });
    await Promise.all([
      setLegLines('fromWork', 'mohlenpris', 1, ['400']),
      setLegLines('fromWork', 'mohlenpris', 0, ['50E', '51']),
    ]);
    const [saved] = (await readRoutes()).alternatives;
    expect(saved.legs.map((leg) => (leg.kind === 'transit' ? leg.lines.join(', ') : ''))).toEqual(['50E, 51', '400']);
  });

  it('applies two quick line changes on one leg to the lines as saved, so neither is lost', async () => {
    await seed({ alternatives: [alternative('k', [ride('400, 403, 410', krokasskiftet, mohlenpris)])] });
    await Promise.all([
      setLegLines('fromWork', 'k', 0, (lines) => lines.filter((l) => l !== '410')),
      setLegLines('fromWork', 'k', 0, (lines) => lines.filter((l) => l !== '403')),
    ]);
    expect((await readRoutes()).alternatives[0].legs[0]).toMatchObject({ lines: ['400'] });
  });

  it('never leaves a leg without a line', async () => {
    await seed({ alternatives: [alternative('k', [ride('400', krokasskiftet, mohlenpris)])] });
    await setLegLines('fromWork', 'k', 0, () => []);
    expect((await readRoutes()).alternatives[0].legs[0]).toMatchObject({ lines: ['400'] });
  });
});

describe('saveMapping', () => {
  it('keeps an alternative built while the results were open', async () => {
    await seed({ alternatives: [viaMohlenpris], connections: [walkToBirkelandsskiftet] });
    const built = alternative('built', [ride('23', grana, krokasskiftet)]);
    const toGrana = connection('grana', grana, [{ kind: 'walk', from: work, to: grana, seconds: 224 }]);
    // The traveller builds one from the results screen, then saves the results.
    await addAlternative(built, [toGrana]);

    await saveMapping('fromWork', {
      found: [viaMohlenpris, viaDolvik],
      chosen: ['mohlenpris', 'dolvik'],
      connections: [walkToBirkelandsskiftet],
      transferWalks: [],
    });

    const saved = await readRoutes();
    expect(saved.alternatives.map((a) => a.key).sort()).toEqual(['built', 'dolvik', 'mohlenpris']);
    expect(saved.connections.map((c) => c.key).sort()).toEqual(['grana', 'walk']);
  });

  it('keeps the lines the traveller set on a saved alternative the run finds again', async () => {
    await seed({ alternatives: [viaMohlenpris] });
    await setLegLines('fromWork', 'mohlenpris', 1, ['400']);

    await saveMapping('fromWork', { found: [viaMohlenpris], chosen: ['mohlenpris'], connections: [], transferWalks: [] });

    const [saved] = (await readRoutes()).alternatives;
    expect(saved.legs[1]).toMatchObject({ lines: ['400'] });
  });

  it('removes a found alternative the traveller left unchosen, and keeps those the run did not find', async () => {
    const older = alternative('older', [ride('67', dolvik, krokasskiftet)]);
    await seed({ alternatives: [viaMohlenpris, older] });

    await saveMapping('fromWork', { found: [viaMohlenpris, viaDolvik], chosen: ['dolvik'], connections: [], transferWalks: [] });

    expect((await readRoutes()).alternatives.map((a) => a.key).sort()).toEqual(['dolvik', 'older']);
  });

  it('leaves the other trip type alone', async () => {
    const morning = alternative('morning', [ride('400', krokasskiftet, mohlenpris)], 'toWork');
    const morningWalk = connection('morning-walk', mohlenpris, [], 'toWork');
    await seed({ alternatives: [morning], connections: [morningWalk] });

    await saveMapping('fromWork', { found: [viaDolvik], chosen: ['dolvik'], connections: [], transferWalks: [] });

    const saved = await readRoutes();
    expect(saved.alternatives.map((a) => a.key).sort()).toEqual(['dolvik', 'morning']);
    expect(saved.connections).toEqual([morningWalk]);
  });

  it('does not store what the run measured', async () => {
    const mapped = { ...viaDolvik, minDurationSeconds: 3600, rare: false } as Alternative;
    await saveMapping('fromWork', { found: [mapped], chosen: ['dolvik'], connections: [], transferWalks: [] });
    expect((await readRoutes()).alternatives).toEqual([viaDolvik]);
  });

  it('adds the lines of a transfer seen again to those seen before', async () => {
    await seed({ transferWalks: [transfer('q:a>q:b', ['53'], ['400'], 150)] });

    await saveMapping('fromWork', {
      found: [],
      chosen: [],
      connections: [],
      transferWalks: [transfer('q:a>q:b', ['50E'], ['400', '410'], 152)],
    });

    expect((await readRoutes()).transferWalks).toEqual([transfer('q:a>q:b', ['50E', '53'], ['400', '410'], 152)]);
  });
});

describe('mergeTransferWalkLists', () => {
  it('keeps transfers the run did not see and adds new ones', () => {
    const known = transfer('k1', ['1'], ['2'], 10);
    const seen = transfer('k2', ['3'], ['4'], 20);
    expect(mergeTransferWalkLists([known], [seen])).toEqual([known, seen]);
  });
});

describe('the other changes', () => {
  it('adds an alternative with only the connections not known already', async () => {
    await seed({ connections: [walkToBirkelandsskiftet] });
    const changed = { ...walkToBirkelandsskiftet, legs: [] };
    const saved = await addAlternative(viaDolvik, [changed]);
    expect(saved.connections).toEqual([walkToBirkelandsskiftet]);
    expect(saved.alternatives).toEqual([viaDolvik]);
  });

  it('sets and clears the traveller’s own walking time', async () => {
    expect((await setWalkOverride('q:a>q:b', 30)).walkOverrides).toEqual({ 'q:a>q:b': 30 });
    expect((await setWalkOverride('q:a>q:b', null)).walkOverrides).toEqual({});
  });

  it('removes one alternative of one trip type', async () => {
    const morning = alternative('dolvik', viaDolvik.legs, 'toWork');
    await seed({ alternatives: [viaDolvik, morning] });
    expect((await removeAlternative('fromWork', 'dolvik')).alternatives).toEqual([morning]);
  });
});
