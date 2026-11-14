import {
  boardingText,
  cardLabels,
  defaultTripType,
  labelsOnEveryCard,
  missedTransferText,
  typicalDelayText,
  walkMinutes,
  walkText,
} from '@/core/front-page';
import type { PlannedTrip, RideRow, WalkRow } from '@/engine/trips';

const work = { id: 'place:work', name: 'Jobb' };
const krokas = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const grana = { id: 'NSR:StopPlace:29485', name: 'Grana' };
const birkeland = { id: 'NSR:StopPlace:58537', name: 'Birkelandsskiftet' };

function ride(from = krokas, to = grana, platform: string | null = null): RideRow {
  const time = { aimed: '2026-11-16T06:07:00Z', expected: '2026-11-16T06:09:00Z', realtime: true };
  return {
    kind: 'ride',
    line: '400',
    mode: 'bus',
    destination: 'Bergen',
    serviceJourneyId: 'SJ:1',
    date: '2026-11-16',
    from,
    fromPlatform: platform,
    to,
    toPlatform: null,
    departure: time,
    arrival: time,
    marking: { kind: 'realtime' },
    started: true,
    precise: false,
    predictionInaccurate: false,
    typicalDelay: { departure: null, arrival: null },
    transfer: null,
  };
}

function walk(position: WalkRow['position'], from: WalkRow['from'], to: WalkRow['to']): WalkRow {
  return { kind: 'walk', position, from, to, seconds: 224 };
}

function trip(overrides: Partial<PlannedTrip>): PlannedTrip {
  return {
    id: 'trip',
    cardKey: 'card',
    rows: [ride()],
    from: krokas,
    to: work,
    leaveAt: null,
    departure: ride().departure,
    departureMarking: { kind: 'realtime' },
    arrival: '2026-11-16T07:16:00Z',
    arrivalRealtime: true,
    durationSeconds: 0,
    scheduledDurationSeconds: 0,
    typicalArrivalDelay: null,
    ...overrides,
  };
}

describe('defaultTripType', () => {
  it('opens on Til jobb before noon and Fra jobb from noon, Norwegian time', () => {
    expect(defaultTripType(new Date('2026-11-16T10:59:00Z'))).toBe('toWork'); // 11:59 in winter
    expect(defaultTripType(new Date('2026-11-16T11:00:00Z'))).toBe('fromWork'); // 12:00
    expect(defaultTripType(new Date('2026-07-01T09:59:00Z'))).toBe('toWork'); // 11:59 in summer
    expect(defaultTripType(new Date('2026-07-01T10:00:00Z'))).toBe('fromWork');
    expect(defaultTripType(new Date('2026-11-16T23:30:00Z'))).toBe('toWork'); // 00:30 the next day
  });
});

describe('cardLabels', () => {
  it('names the stop the first vehicle leaves from when the trip starts at a stop', () => {
    expect(cardLabels(trip({}))).toEqual({ start: 'Avgang Krokåsskiftet', end: 'Fremme jobb' });
  });

  it('says when to leave work when the trip starts walking', () => {
    const fromWork = trip({
      from: work,
      to: krokas,
      leaveAt: '2026-11-16T14:19:00Z',
      rows: [walk('start', work, grana), ride(grana, krokas)],
    });
    expect(cardLabels(fromWork)).toEqual({ start: 'Gå fra jobb', end: 'Fremme Krokåsskiftet' });
  });
});

describe('labelsOnEveryCard', () => {
  it('keeps the labels on the first card when every card starts and ends at the same place', () => {
    expect(labelsOnEveryCard([trip({}), trip({})])).toBe(false);
  });

  it('puts them on every card when the cards end at different stops', () => {
    expect(labelsOnEveryCard([trip({}), trip({ to: birkeland })])).toBe(true);
  });
});

describe('rows', () => {
  it('describes walks by where they go', () => {
    expect(walkText(walk('start', work, grana))).toBe('til Grana');
    expect(walkText(walk('end', grana, work))).toBe('fra Grana');
    expect(walkText(walk('between', grana, birkeland))).toBe('fra Grana til Birkelandsskiftet');
  });

  it('rounds walks to whole minutes, at least one', () => {
    expect(walkMinutes(224)).toBe(4);
    expect(walkMinutes(1200)).toBe(20);
    expect(walkMinutes(10)).toBe(1);
  });

  it('adds the platform to the stop where there is one', () => {
    expect(boardingText(ride(birkeland, grana, 'C'))).toBe('Birkelandsskiftet, plattform C');
    expect(boardingText(ride())).toBe('Krokåsskiftet');
  });
});

describe('typicalDelayText', () => {
  it('tells the typical delay in whole minutes', () => {
    expect(typicalDelayText(trip({ typicalArrivalDelay: { p50Seconds: 370, p90Seconds: 600 } }))).toBe(
      'Typisk fremme 6 min senere',
    );
  });

  it('says nothing when it rounds to zero or there is none', () => {
    expect(typicalDelayText(trip({ typicalArrivalDelay: { p50Seconds: 20, p90Seconds: 60 } }))).toBeNull();
    expect(typicalDelayText(trip({}))).toBeNull();
  });
});

describe('missedTransferText', () => {
  const changeTo = (marginSeconds: number, arrivalIfMissed: string | null): RideRow => ({
    ...ride(grana, birkeland),
    serviceJourneyId: `SJ:${marginSeconds}`,
    transfer: { marginSeconds, status: marginSeconds < 0 ? 'missed' : marginSeconds > 180 ? 'good' : 'tight', walkSeconds: 0, arrivalIfMissed },
  });

  it('tells when the traveller is there if a transfer forecast as missed is not caught', () => {
    const red = trip({ rows: [ride(), changeTo(-10, '2026-11-16T07:29:40Z')] });
    // 07:29 UTC is 08:29 in Norway in winter.
    expect(missedTransferText(red)).toBe('Rekker du den ikke: fremme 08:29');
  });

  it('tells nothing for a trip whose transfers are caught, however tight', () => {
    expect(missedTransferText(trip({ rows: [ride(), changeTo(0, '2026-11-16T07:29:00Z')] }))).toBeNull();
    expect(missedTransferText(trip({ rows: [ride(), changeTo(400, '2026-11-16T07:29:00Z')] }))).toBeNull();
    expect(missedTransferText(trip({}))).toBeNull();
  });

  it('tells nothing when there is no way on after the missed transfer', () => {
    expect(missedTransferText(trip({ rows: [ride(), changeTo(-10, null)] }))).toBeNull();
  });

  it('tells of the first missed transfer when a trip has two', () => {
    const twice = trip({ rows: [ride(), changeTo(-27, '2026-11-16T18:26:00Z'), changeTo(-43, '2026-11-16T18:22:00Z')] });
    expect(missedTransferText(twice)).toBe('Rekker du den ikke: fremme 19:26');
  });
});
