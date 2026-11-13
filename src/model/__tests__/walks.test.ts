import { mergeTransferWalks, toPattern } from '@/mapping/pattern';
import type { TripLegResponse, TripPlaceResponse } from '@/mapping/query';
import { HOME, WORK } from '@/model/places';
import type { Connection, Leg, QuayRef, StopRef, TransferWalk } from '@/model/types';
import {
  connectionWalks,
  effectiveSeconds,
  formatWalkTime,
  parseWalkTime,
  platformLabel,
  vehicleRows,
  type WalkTimes,
} from '@/model/walks';

const birkelandsskiftet: StopRef = { id: 'NSR:StopPlace:30168', name: 'Birkelandsskiftet terminal' };
const bybanestopp: StopRef = { id: 'NSR:StopPlace:30169', name: 'Birkelandsskiftet terminal' };
const mohlenpris: StopRef = { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' };
const busstasjonen: StopRef = { id: 'NSR:StopPlace:30810', name: 'Bergen busstasjon' };
const lagunen: StopRef = { id: 'NSR:StopPlace:59849', name: 'Lagunen terminal' };
const byparken: StopRef = { id: 'NSR:StopPlace:2', name: 'Byparken' };
const strandkaien: StopRef = { id: 'NSR:StopPlace:59223', name: 'Strandkaiterminalen båtkai' };
const kleppestoKai: StopRef = { id: 'NSR:StopPlace:32539', name: 'Kleppestø båtkai' };
const kleppesto: StopRef = { id: 'NSR:StopPlace:30815', name: 'Kleppestø terminal' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const grana: StopRef = { id: 'NSR:StopPlace:29485', name: 'Grana' };
const work: StopRef = { id: 'place:work', name: 'Jobb' };

const quay = (stop: StopRef, id: string, platform: string | null = null): QuayRef => ({ id, platform, stop });
const transfer = (
  from: QuayRef,
  to: QuayRef,
  seconds: number,
  fromLines: string[],
  toLines: string[],
): TransferWalk => ({ key: `${from.id}>${to.id}`, from, to, fromLines, toLines, seconds });

const ride = (line: string, from: StopRef, to: StopRef): Leg => ({ kind: 'transit', from, to, lines: [line], mode: 'bus' });

const boat: Leg[] = [
  ride('1', bybanestopp, byparken),
  { kind: 'walk', from: byparken, to: strandkaien, seconds: 520 },
  ride('490', strandkaien, kleppestoKai),
  ride('400', kleppesto, krokasskiftet),
];

const noTimes: WalkTimes = { transferWalks: [], overrides: {} };

describe('vehicleRows', () => {
  it('gives each vehicle after the first the walk before it', () => {
    const rows = vehicleRows(boat, {
      transferWalks: [transfer(quay(kleppestoKai, 'q:kai'), quay(kleppesto, 'q:terminal'), 95, ['490'], ['400'])],
      overrides: {},
    });

    expect(rows.map((r) => r.lines[0])).toEqual(['1', '490', '400']);
    expect(rows[0].walks).toEqual([]);
    expect(rows[1].walks).toMatchObject([{ from: byparken, to: strandkaien, enturSeconds: 520, ownSeconds: null }]);
    expect(rows[2].walks).toMatchObject([{ key: 'q:kai>q:terminal', enturSeconds: 95, ownSeconds: null }]);
  });

  it('keeps crossing the road apart from staying on the same side of a stop', () => {
    const inbound = quay(mohlenpris, 'q:mot-sentrum');
    const outbound = quay(mohlenpris, 'q:fra-sentrum');
    const times: WalkTimes = {
      transferWalks: [
        transfer(inbound, outbound, 152, ['50E'], ['400', '410']),
        transfer(inbound, inbound, 0, ['50E'], ['3']),
      ],
      overrides: { 'q:mot-sentrum>q:fra-sentrum': 30 },
    };

    const [, to400] = vehicleRows([ride('50E', birkelandsskiftet, mohlenpris), ride('400', mohlenpris, krokasskiftet)], times);
    const [, to3] = vehicleRows([ride('50E', birkelandsskiftet, mohlenpris), ride('3', mohlenpris, byparken)], times);

    expect(to400.walks.map((w) => [w.key, w.enturSeconds, effectiveSeconds(w)])).toEqual([
      ['q:mot-sentrum>q:fra-sentrum', 152, 30],
    ]);
    expect(to3.walks.map((w) => [w.key, effectiveSeconds(w), platformLabel(w)])).toEqual([
      ['q:mot-sentrum>q:mot-sentrum', 0, 'samme plattform'],
    ]);
    expect(platformLabel(to400.walks[0])).toBe('annen plattform');
  });

  it('names the platforms where a terminal has several ways between two legs', () => {
    const rows = vehicleRows([ride('400', krokasskiftet, busstasjonen), ride('600', busstasjonen, lagunen)], {
      transferWalks: [
        transfer(quay(busstasjonen, 'q:Q', 'Q'), quay(busstasjonen, 'q:L', 'L'), 183, ['400'], ['600']),
        transfer(quay(busstasjonen, 'q:Q', 'Q'), quay(busstasjonen, 'q:M', 'M'), 212, ['400'], ['600']),
      ],
      overrides: {},
    });
    expect(rows[1].walks.map(platformLabel)).toEqual(['Q → L', 'Q → M']);
  });

  it('gives a transfer the mapping never saw one walk without an estimate', () => {
    const [walk] = vehicleRows(boat, noTimes)[2].walks;
    expect(walk).toMatchObject({ key: `${kleppestoKai.id}>${kleppesto.id}`, enturSeconds: null, ownSeconds: null });
    expect(platformLabel(walk)).toBeNull();
    expect(effectiveSeconds(walk)).toBe(0);
  });

  it("uses the traveller's own time for a walking leg where one is set", () => {
    const key = `${byparken.id}>${strandkaien.id}`;
    const [walk] = vehicleRows(boat, { transferWalks: [], overrides: { [key]: 360 } })[1].walks;

    expect(walk.ownSeconds).toBe(360);
    expect(effectiveSeconds(walk)).toBe(360);
    expect(effectiveSeconds(vehicleRows(boat, noTimes)[1].walks[0])).toBe(520);
  });
});

describe('connectionWalks', () => {
  const connection = (legs: Leg[]): Connection => ({ key: 'k', tripType: 'fromWork', anchor: birkelandsskiftet, legs });

  it('lists each walk once across the connections', () => {
    const toGrana: Leg = { kind: 'walk', from: work, to: grana, seconds: 224 };
    const walks = connectionWalks(
      [
        connection([{ kind: 'walk', from: work, to: birkelandsskiftet, seconds: 1212 }]),
        connection([toGrana, ride('57', grana, birkelandsskiftet)]),
        connection([toGrana, ride('57', grana, birkelandsskiftet), { kind: 'walk', from: birkelandsskiftet, to: bybanestopp, seconds: 60 }]),
      ],
      { transferWalks: [], overrides: { [`${work.id}>${grana.id}`]: 180 } },
    );

    expect(walks.map((w) => `${w.from.name} → ${w.to.name}`)).toEqual([
      'Jobb → Birkelandsskiftet terminal',
      'Jobb → Grana',
      'Birkelandsskiftet terminal → Birkelandsskiftet terminal',
    ]);
    expect(walks[1]).toMatchObject({ enturSeconds: 224, ownSeconds: 180 });
  });
});

describe('walking time text', () => {
  it('formats seconds as minutes and seconds', () => {
    expect(formatWalkTime(270)).toBe('4:30');
    expect(formatWalkTime(1212)).toBe('20:12');
    expect(formatWalkTime(0)).toBe('0:00');
  });

  it.each([
    ['4', 240],
    ['4:30', 270],
    ['4.30', 270],
    [' 20:05 ', 1205],
    ['0:45', 45],
  ] as const)('reads %s', (text, seconds) => {
    expect(parseWalkTime(text)).toBe(seconds);
  });

  it.each(['', 'fire', '4:75', '4:3:0', '-2'])('rejects %s', (text) => {
    expect(parseWalkTime(text)).toBeNull();
  });
});

describe('transfer walks from a mapping run', () => {
  const at = (stop: StopRef | null, quayId?: string, platform: string | null = null): TripPlaceResponse => ({
    name: stop?.name ?? 'Origin',
    quay: stop ? { id: quayId ?? `q:${stop.id}`, publicCode: platform, stopPlace: stop } : null,
  });
  const bus = (line: string, from: TripPlaceResponse, to: TripPlaceResponse): TripLegResponse => ({
    mode: 'bus',
    distance: 5000,
    duration: 600,
    line: { id: `SKY:Line:${line}`, publicCode: line },
    fromPlace: from,
    toPlace: to,
  });
  const foot = (from: TripPlaceResponse, to: TripPlaceResponse, meters: number, seconds: number): TripLegResponse => ({
    mode: 'foot',
    distance: meters,
    duration: seconds,
    line: null,
    fromPlace: from,
    toPlace: to,
  });
  const pattern = (legs: TripLegResponse[]) => toPattern({ duration: 3600, aimedStartTime: '', aimedEndTime: '', legs }, WORK, HOME)!;

  it('records the walk between two platforms of one stop, by platform', () => {
    const p = pattern([
      foot(at(null), at(birkelandsskiftet), 1467, 1212),
      bus('50E', at(birkelandsskiftet), at(mohlenpris, 'q:mot-sentrum')),
      foot(at(mohlenpris, 'q:mot-sentrum'), at(mohlenpris, 'q:fra-sentrum'), 90, 152),
      bus('400', at(mohlenpris, 'q:fra-sentrum'), at(krokasskiftet)),
    ]);

    expect(p.transfers).toEqual([
      {
        key: 'q:mot-sentrum>q:fra-sentrum',
        from: { id: 'q:mot-sentrum', platform: null, stop: mohlenpris },
        to: { id: 'q:fra-sentrum', platform: null, stop: mohlenpris },
        fromLines: ['50E'],
        toLines: ['400'],
        seconds: 152,
      },
    ]);
  });

  it('records zero where the next vehicle leaves from the platform the traveller arrived at', () => {
    const p = pattern([
      foot(at(null), at(grana), 257, 224),
      bus('57', at(grana), at(byparken, 'q:a', 'A')),
      bus('400', at(byparken, 'q:a', 'A'), at(krokasskiftet)),
    ]);
    expect(p.transfers).toMatchObject([{ key: 'q:a>q:a', seconds: 0, from: { platform: 'A' } }]);
  });

  it('leaves out a transfer that has a walking leg of its own', () => {
    const p = pattern([
      foot(at(null), at(bybanestopp), 1500, 1260),
      bus('1', at(bybanestopp), at(byparken)),
      foot(at(byparken), at(strandkaien), 668, 520),
      bus('490', at(strandkaien), at(kleppestoKai)),
    ]);
    expect(p.transfers).toEqual([]);
  });

  it('takes the median where the same transfer was seen several times', () => {
    const seen = (seconds: number) =>
      pattern([
        foot(at(null), at(grana), 257, 224),
        bus('57', at(grana), at(birkelandsskiftet, 'q:buss')),
        foot(at(birkelandsskiftet, 'q:buss'), at(bybanestopp, 'q:bane'), 60, seconds),
        bus('1', at(bybanestopp, 'q:bane'), at(byparken)),
      ]);

    expect(mergeTransferWalks([seen(60), seen(90), seen(75)])).toMatchObject([
      { key: 'q:buss>q:bane', seconds: 75, fromLines: ['57'], toLines: ['1'] },
    ]);
  });
});
