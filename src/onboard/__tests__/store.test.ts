import type { StopCall } from '@/entur/calls';
import type { JourneyCall } from '@/entur/journey';
import { setLogSinks } from '@/logging/logger';
import {
  birkelandsskiftet,
  busesHome,
  krokasskiftet,
  mohlenpris,
  paths,
  routes,
  the410,
  the50E,
} from '@/onboard/__fixtures__/from-work';
import { at } from '@/engine/__fixtures__/calls';
import { planOnBoard } from '@/onboard/follow';
import { afterLook } from '@/onboard/session';
import { createOnBoardStore, type Look } from '@/onboard/store';

beforeEach(() => setLogSinks([]));

/** What Entur says: the calls of each journey, and the calls at the stops onward. */
function world() {
  const journeys: Record<string, JourneyCall[]> = {};
  let calls: StopCall[] = busesHome;
  let failing = false;
  const look: Look = async (session, now = new Date()) => {
    if (failing) throw new Error('Entur is down');
    const journey = journeys[session.following.serviceJourneyId] ?? [];
    const plan = planOnBoard('fromWork', paths, journey, calls, routes, now, session.following, session.memory);
    return { plan, ...afterLook(session, plan) };
  };
  return {
    look,
    set: (id: string, journey: JourneyCall[]) => (journeys[id] = journey),
    calls: (next: StopCall[]) => (calls = next),
    fail: (value: boolean) => (failing = value),
  };
}

/** A moment, in the fixtures' Norwegian time. */
const moment = (clock: string) => new Date(at(clock));

function boardThe50E() {
  const entur = world();
  entur.set('journey:50E', the50E());
  const store = createOnBoardStore(entur.look);
  store.start('fromWork', {
    serviceJourneyId: 'journey:50E',
    date: '2026-11-16',
    boardedAt: birkelandsskiftet.id,
    line: '50E',
    destination: 'Bergen busstasjon',
  }, moment('15:35'));
  return { entur, store };
}

describe('the trip on board', () => {
  it('starts with the vehicle boarded, and no plan until the first look', () => {
    const { store } = boardThe50E();
    const state = store.get()!;
    expect(state.boarded).toEqual({ line: '50E', destination: 'Bergen busstasjon' });
    expect(state.session.following).toEqual({ serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id });
    expect(state.plan).toBeNull();
    expect(state.over).toBe(false);
  });

  it('tells those who listen when it changes', async () => {
    const { store } = boardThe50E();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.refresh(moment('15:40'));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await store.refresh(moment('15:41'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('has the plan from each look, and logs it', async () => {
    const { store } = boardThe50E();
    await store.refresh(moment('15:40'));
    const state = store.get()!;
    expect(state.plan?.activePlan?.rows.filter((row) => row.kind === 'ride').map((row) => row.kind === 'ride' && row.line)).toEqual(['50E', '410']);
    expect(state.question).toBeNull();
    expect(state.log.legs.map((leg) => leg.line)).toEqual(['50E']);
  });

  it('keeps the plan when a look fails, and says so', async () => {
    const { store, entur } = boardThe50E();
    await store.refresh(moment('15:40'));
    const plan = store.get()!.plan;
    entur.fail(true);
    await store.refresh(moment('15:41'));
    expect(store.get()!.failed).toBe(true);
    expect(store.get()!.plan).toBe(plan);
    entur.fail(false);
    await store.refresh(moment('15:42'));
    expect(store.get()!.failed).toBe(false);
  });
});

describe('the question', () => {
  it('is asked, and answered by the traveller as an event', async () => {
    const { store, entur } = boardThe50E();
    await store.refresh(moment('15:40'));
    entur.set('journey:50E', the50E({ left: 2, standing: true }));
    await store.refresh(moment('15:58:20'));
    expect(store.get()!.question).toEqual({ kind: 'gotOff', stop: mohlenpris, platform: 'N' });

    store.answer(true, moment('15:58:30'));
    const state = store.get()!;
    expect(state.question).toBeNull();
    expect(state.session.following.gotOffAt).toBe(mohlenpris.id);
    expect(state.session.answers).toHaveLength(1);
    expect(state.session.answers[0].source).toBe('traveller');
    expect(state.log.events.some((event) => event.kind === 'answer')).toBe(true);
    expect(state.over).toBe(false);
  });

  it('stays until it is answered, though a look asks nothing', async () => {
    const { store, entur } = boardThe50E();
    entur.set('journey:50E', the50E({ left: 2, standing: true }));
    await store.refresh(moment('15:58:20'));
    const asked = store.get()!.question;
    expect(asked).not.toBeNull();
    // Entur no longer knows the journey: the look has no vehicle and asks nothing.
    entur.set('journey:50E', []);
    await store.refresh(moment('15:58:40'));
    expect(store.get()!.question).toEqual(asked);
  });

  it('is replaced by the next one', async () => {
    const { store, entur } = boardThe50E();
    await store.refresh(moment('15:40'));
    entur.set('journey:50E', the50E({ left: 3 }));
    await store.refresh(moment('15:59'));
    expect(store.get()!.question?.kind).toBe('gotOff');
    // The 410 has left Møhlenpris: the app asks whether the traveller is on it.
    entur.calls(busesHome.filter((call) => call.serviceJourneyId !== 'journey:a'));
    await store.refresh(moment('16:03'));
    expect(store.get()!.question).toMatchObject({ kind: 'boarded', vehicle: { line: '410' } });
  });

  it('is not undone by a look that was under way when it was answered', async () => {
    const { store, entur } = boardThe50E();
    entur.set('journey:50E', the50E({ left: 2, standing: true }));
    await store.refresh(moment('15:58:20'));
    const pending = store.refresh(moment('15:58:25'));
    store.answer(false, moment('15:58:26'));
    await pending;
    expect(store.get()!.session.following.stayedOnAt).toBe(mohlenpris.id);
    expect(store.get()!.question).toBeNull();
  });
});

describe('getting off', () => {
  it('has the traveller wait where the vehicle is', async () => {
    const { store, entur } = boardThe50E();
    entur.set('journey:50E', the50E({ left: 1, standing: true }));
    await store.refresh(moment('15:45:10'));
    expect(store.gotOff(moment('15:45:15'))).toBe(true);
    expect(store.get()!.session.following.gotOffAt).toBe('stop:Danmarksplass');
    // Only once.
    expect(store.gotOff(moment('15:45:20'))).toBe(false);
  });

  it('at a stop with no saved way on, can be followed by ending the trip', async () => {
    const { store, entur } = boardThe50E();
    entur.set('journey:50E', the50E({ left: 1, standing: true }));
    await store.refresh(moment('15:45:10'));
    store.gotOff(moment('15:45:15'));
    await store.refresh(moment('15:45:30'));
    expect(store.get()!.plan?.trips).toEqual([]);
    expect(store.get()!.over).toBe(false);

    store.finish(moment('15:46'));
    expect(store.get()!.over).toBe(true);
    expect(store.get()!.log.finishedAt).toBe(moment('15:46').toISOString());
  });

  it('is not possible before the app knows where the vehicle is', async () => {
    const { store } = boardThe50E();
    expect(store.gotOff(moment('15:36'))).toBe(false);
    await store.refresh(moment('15:40'));
    expect(store.gotOff(moment('15:40'))).toBe(false);
  });
});

describe('the end of the trip', () => {
  function boardThe410() {
    const entur = world();
    entur.set('journey:a', the410({ left: 1 }));
    entur.calls([]);
    const store = createOnBoardStore(entur.look);
    store.start('fromWork', { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id, line: '410', destination: 'Krokåsskiftet' }, moment('16:03'));
    return { entur, store };
  }

  it('comes when the traveller says yes at the stop where the trip ends', async () => {
    const { store, entur } = boardThe410();
    await store.refresh(moment('16:10'));
    entur.set('journey:a', the410({ left: 1, standing: true }));
    await store.refresh(moment('16:35:10'));
    expect(store.get()!.question).toEqual({ kind: 'gotOff', stop: krokasskiftet, platform: null });

    store.answer(true, moment('16:35:20'));
    const state = store.get()!;
    expect(state.over).toBe(true);
    expect(state.question).toBeNull();
    expect(state.log.finishedAt).toBe(moment('16:35:20').toISOString());
  });

  it('comes at the next look when the traveller got off by the button where it ends', async () => {
    const { store, entur } = boardThe410();
    entur.set('journey:a', the410({ left: 1, standing: true }));
    await store.refresh(moment('16:35:10'));
    store.gotOff(moment('16:35:15'));
    expect(store.get()!.over).toBe(false);
    await store.refresh(moment('16:35:30'));
    expect(store.get()!.over).toBe(true);
  });

  it('leaves nothing when the trip is ended', async () => {
    const { store } = boardThe410();
    store.end();
    expect(store.get()).toBeNull();
    await store.refresh(moment('16:10'));
    expect(store.get()).toBeNull();
  });
});
