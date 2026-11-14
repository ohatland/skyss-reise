import { boardButtonText } from '@/core/front-page';
import {
  arrivalLabel,
  boardingOf,
  noCardsText,
  onBoardCards,
  onBoardHeading,
  questionText,
  rowsOnBoard,
  strandedAtStop,
} from '@/core/on-board';
import type { RideRow, TripCard, TripRow } from '@/engine/trips';
import type { OnBoardPlan } from '@/onboard/follow';
import type { FollowedVehicle, VehicleStop } from '@/onboard/vehicle';

const work = { id: 'place:work', name: 'Jobb' };
const krokas = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const mohlenpris = { id: 'NSR:StopPlace:30918', name: 'Møhlenpris' };
const birkeland = { id: 'NSR:StopPlace:58537', name: 'Birkelandsskiftet terminal' };

function ride(line: string, from = birkeland, to = mohlenpris, departure = '2026-11-16T15:09:00Z'): RideRow {
  const time = { aimed: departure, expected: departure, realtime: true };
  return {
    kind: 'ride',
    line,
    mode: 'bus',
    destination: 'Bergen busstasjon',
    serviceJourneyId: `SJ:${line}`,
    date: '2026-11-16',
    from,
    fromPlatform: null,
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

function card(rows: TripRow[], to = krokas, arrival = '2026-11-16T15:35:00Z'): TripCard {
  return {
    id: rows.map((row) => (row.kind === 'ride' ? row.line : 'walk')).join('|'),
    cardKey: rows.map((row) => (row.kind === 'ride' ? row.line : 'walk')).join('|'),
    rows,
    from: birkeland,
    to,
    leaveAt: null,
    departure: (rows.find((row) => row.kind === 'ride') as RideRow).departure,
    departureMarking: { kind: 'realtime' },
    arrival,
    arrivalRealtime: true,
    durationSeconds: 0,
    scheduledDurationSeconds: 0,
    typicalArrivalDelay: null,
    alternatives: [],
  };
}

const stopAt = (stop: typeof mohlenpris) => ({ stop }) as VehicleStop;
const vehicle = (gotOff: VehicleStop | null = null) => ({ line: '50E', destination: 'Bergen busstasjon', gotOff }) as FollowedVehicle;

describe('the heading', () => {
  it('names the line and where it goes while the traveller is on board', () => {
    expect(onBoardHeading(vehicle())).toBe('Du er på 50E mot Bergen busstasjon');
  });

  it('names the stop while the traveller waits there', () => {
    expect(onBoardHeading(vehicle(stopAt(mohlenpris)))).toBe('Du venter på Møhlenpris');
  });
});

describe('the question', () => {
  it('asks whether the traveller got off, by the stop', () => {
    expect(questionText({ kind: 'gotOff', stop: birkeland, platform: 'D' })).toBe('Gikk du av på Birkelandsskiftet terminal?');
  });

  it('asks whether the traveller is on the next vehicle, by its line', () => {
    const next = { serviceJourneyId: 'SJ:410', date: '2026-11-16', line: '410', destination: 'Krokåsskiftet', stop: mohlenpris, platform: 'S', departure: '' };
    expect(questionText({ kind: 'boarded', vehicle: next })).toBe('Er du på 410 nå?');
  });
});

describe('the button that starts on board', () => {
  it('names the line and departure of the first vehicle', () => {
    expect(boardButtonText(card([{ kind: 'walk', position: 'start', from: work, to: birkeland, seconds: 1200 }, ride('50E')]))).toBe(
      'Jeg er på 50E fra 16:09',
    );
  });
});

describe('starting on board from a card', () => {
  it('is on its first vehicle, from where it is boarded', () => {
    const trip = card([{ kind: 'walk', position: 'start', from: work, to: birkeland, seconds: 1200 }, ride('50E'), ride('410', mohlenpris, krokas)]);
    expect(boardingOf(trip)).toEqual({
      serviceJourneyId: 'SJ:50E',
      date: '2026-11-16',
      boardedAt: birkeland.id,
      line: '50E',
      destination: 'Bergen busstasjon',
    });
  });
});

describe('the cards on board', () => {
  const plan = card([ride('50E'), ride('410', mohlenpris, krokas)]);
  const later = card([ride('50E', birkeland, krokas)], krokas, '2026-11-16T15:41:00Z');
  const muchLater = card([ride('50E'), ride('400', mohlenpris, krokas)], krokas, '2026-11-16T16:20:00Z');

  it('leave out the vehicle the traveller is on', () => {
    expect(rowsOnBoard(plan).map((row) => row.kind === 'ride' && row.line)).toEqual(['410']);
    expect(rowsOnBoard(later)).toEqual([]);
  });

  it('have the plan first and marked, with the headings and the label on the first card only', () => {
    const cards = onBoardCards({ trips: [plan, later], hidden: [muchLater], activePlan: plan }, false);
    expect(cards.map((one) => [one.trip, one.best, one.showLabel, one.showColumnHeadings])).toEqual([
      [plan, true, true, true],
      [later, false, false, false],
    ]);
  });

  it('have those more than half an hour after the plan when asked for', () => {
    const cards = onBoardCards({ trips: [plan, later], hidden: [muchLater], activePlan: plan }, true);
    expect(cards.map((one) => one.trip)).toEqual([plan, later, muchLater]);
  });

  it('have the label on every card when they end at different places', () => {
    const toWork = card([ride('50E')], work);
    expect(arrivalLabel(toWork)).toBe('Fremme jobb');
    const cards = onBoardCards({ trips: [plan, toWork], hidden: [], activePlan: plan }, false);
    expect(cards.map((one) => one.showLabel)).toEqual([true, true]);
  });
});

describe('without cards', () => {
  const none = { trips: [], hidden: [] } as Pick<OnBoardPlan, 'trips' | 'hidden'>;

  it('says so when Entur does not know the journey', () => {
    expect(noCardsText({ ...none, vehicle: null })).toBe('Fant ikke turen hos Entur.');
  });

  it('says there is no saved way on from a stop the traveller waits at', () => {
    expect(noCardsText({ ...none, vehicle: vehicle(stopAt(mohlenpris)) })).toBe('Ingen lagrede reiser videre fra Møhlenpris.');
  });

  it('says there is no trip on, on board', () => {
    expect(noCardsText({ ...none, vehicle: vehicle() })).toBe('Ingen reiser videre akkurat nå.');
  });

  it('offers to end the trip only at a stop with no saved way on', () => {
    expect(strandedAtStop({ ...none, vehicle: vehicle(stopAt(mohlenpris)) })).toBe(true);
    expect(strandedAtStop({ ...none, vehicle: vehicle() })).toBe(false);
    expect(strandedAtStop({ ...none, vehicle: null })).toBe(false);
    expect(strandedAtStop({ trips: [card([ride('50E')])], hidden: [], vehicle: vehicle(stopAt(mohlenpris)) })).toBe(false);
  });

  it('is nothing when there are cards', () => {
    expect(noCardsText({ trips: [card([ride('50E')])], hidden: [], vehicle: vehicle() })).toBeNull();
  });
});
