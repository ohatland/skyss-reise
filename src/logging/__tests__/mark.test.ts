import { at } from '@/engine/__fixtures__/calls';
import type { TripCard } from '@/engine/trips';
import { setLogSinks, type LogProperties } from '@/logging/logger';
import { frontPageSnapshot, MARK_CATEGORIES, onBoardSnapshot, publicStopName, sendMark, sendMarkNote } from '@/logging/mark';
import { look, onThe50E, the50E, work } from '@/onboard/__fixtures__/from-work';
import type { OnBoardState } from '@/onboard/store';
import { startLog } from '@/onboard/trip-log';

const events: { name: string; properties: LogProperties }[] = [];
beforeEach(() => {
  events.length = 0;
  setLogSinks([{ event: (name, properties) => events.push({ name, properties }), error: jest.fn() }]);
});

const plan = look(onThe50E, '15:40', the50E());
const state: OnBoardState = {
  session: onThe50E,
  boarded: { line: '50E', destination: 'Bergen busstasjon' },
  plan,
  question: null,
  failed: false,
  log: startLog('fromWork', new Date(at('15:35'))),
  over: false,
};

describe('what a mark holds on the front page', () => {
  const view = { tripType: 'fromWork' as const, plan, noRoutes: false, failed: false, showHidden: false };

  it('has the trip type, the moment of the plan and one entry per card with vehicles and times', () => {
    const snapshot = frontPageSnapshot(view) as Record<string, unknown>;
    const cards = snapshot.cardList as { best: boolean; arrival: string; departure: string; rides: { line: string; from: string; departure: string; marginSeconds: number | null }[] }[];

    expect(snapshot).toMatchObject({ screen: 'before_departure', tripType: 'fromWork', planAt: plan.at, failed: false, noRoutes: false });
    expect(cards).toHaveLength(plan.trips.length);
    expect(cards[0].best).toBe(true);
    expect(cards.slice(1).every((card) => !card.best)).toBe(true);
    expect(cards[0].rides.map((ride) => ride.line)).toEqual(['50E', '410']);
    expect(cards[0].rides[0]).toMatchObject({ from: 'Birkelandsskiftet', departure: expect.stringMatching(/^2026-11-16T/) });
    expect(cards[0].rides[1].marginSeconds).toEqual(expect.any(Number));
    expect(cards[0].arrival).toBe(plan.trips[0].arrival);
  });

  it('has no cards when there is no plan, and says why', () => {
    expect(frontPageSnapshot({ ...view, plan: null, noRoutes: true })).toMatchObject({ planAt: null, noRoutes: true, cardList: [] });
  });

  it('counts the hidden cards, and includes them only when they are shown', () => {
    const withHidden = { ...view, plan: { ...plan, hidden: [plan.trips[0]] } };
    expect(frontPageSnapshot(withHidden)).toMatchObject({ hiddenCards: 1, showHidden: false });
    expect((frontPageSnapshot(withHidden).cardList as unknown[]).length).toBe(plan.trips.length);
    expect((frontPageSnapshot({ ...withHidden, showHidden: true }).cardList as unknown[]).length).toBe(plan.trips.length + 1);
  });
});

describe('what a mark holds on board', () => {
  it('has the state of the session next to the cards', () => {
    const snapshot = onBoardSnapshot(state, false) as Record<string, unknown>;

    expect(snapshot).toMatchObject({
      screen: 'on_board',
      tripType: 'fromWork',
      planAt: plan.at,
      over: false,
      failed: false,
      session: { line: '50E', destination: 'Bergen busstasjon', serviceJourneyId: 'journey:50E', gotOff: false, answers: 0, question: null },
    });
    expect((snapshot.cardList as { best: boolean }[])[0].best).toBe(true);
  });

  it('has the question the screen asked', () => {
    const question = { kind: 'gotOff' as const, stop: plan.trips[0].rows.flatMap((row) => (row.kind === 'ride' ? [row.to] : []))[0], platform: null };
    expect(onBoardSnapshot({ ...state, question }, false)).toMatchObject({ session: { question: { kind: 'gotOff', stop: question.stop.name } } });
  });

  it('works before the first plan has come', () => {
    expect(onBoardSnapshot({ ...state, plan: null }, false)).toMatchObject({ planAt: null, cardList: [], session: { line: '50E', planHolds: null } });
  });
});

describe('the traveller’s own places', () => {
  it('are never in a mark: only the names of stops are', () => {
    expect(publicStopName(work)).toBeNull();
    expect(publicStopName({ id: 'NSR:StopPlace:1', name: 'Dolvik' })).toBe('Dolvik');

    const ends = (card: TripCard): TripCard => ({
      ...card,
      rows: card.rows.map((row) => (row.kind === 'ride' ? { ...row, to: work, from: work } : row)),
    });
    const atWork = { ...plan, trips: plan.trips.map(ends) };
    const text = JSON.stringify([
      frontPageSnapshot({ tripType: 'toWork', plan: atWork, noRoutes: false, failed: false, showHidden: false }),
      onBoardSnapshot({ ...state, plan: atWork }, false),
    ]);

    expect(text).not.toContain('Jobb');
    expect(text).not.toContain('place:');
  });
});

describe('pressing the flag', () => {
  it('sends the mark at once, with its id and the moment', () => {
    const now = new Date('2026-11-16T07:14:00Z');
    const id = sendMark(frontPageSnapshot({ tripType: 'toWork', plan, noRoutes: false, failed: false, showHidden: false }), now);

    expect(events).toHaveLength(1);
    expect(events[0].name).toBe('mark_created');
    expect(events[0].properties).toMatchObject({ markId: id, markedAt: now.toISOString(), screen: 'before_departure', tripType: 'toWork' });
    expect(id).not.toBe(sendMark({}, now));
  });

  it('sends the category and the note later, tied to the mark', () => {
    expect(sendMarkNote('abc', 'Feil tid', '  50E sto 3 min på Dolvik ', new Date('2026-11-16T07:15:00Z'))).toBe(true);
    expect(events[0]).toEqual({
      name: 'mark_noted',
      properties: { markId: 'abc', category: 'Feil tid', note: '50E sto 3 min på Dolvik', notedAt: '2026-11-16T07:15:00.000Z' },
    });
  });

  it('sends nothing when neither category nor note was given', () => {
    expect(sendMarkNote('abc', null, '   ')).toBe(false);
    expect(events).toHaveLength(0);
    expect(sendMarkNote('abc', 'Idé', '')).toBe(true);
    expect(events[0].properties).toMatchObject({ category: 'Idé', note: null });
  });

  it('has the five categories the user confirmed', () => {
    expect(MARK_CATEGORIES).toEqual(['Feil tid', 'Mangler alternativ', 'Uklart', 'Treg app', 'Idé']);
  });
});
