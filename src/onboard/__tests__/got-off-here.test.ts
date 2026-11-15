import { at } from '@/engine/__fixtures__/calls';
import { setLogSinks } from '@/logging/logger';
import {
  birkelandsskiftet,
  busstasjonen,
  danmarksplass,
  krokasskiftet,
  mohlenpris,
  onThe410,
  onThe50E,
  planOf,
  see,
  the410,
  the50E,
} from '@/onboard/__fixtures__/from-work';
import { silentTwin } from '@/onboard/__fixtures__/vehicle';
import { answer, gotOffHere, stopVehicleIsAt, tripIsOver } from '@/onboard/session';

beforeEach(() => setLogSinks([]));

const moment = (clock: string) => new Date(at(clock));
const onBoard = see(onThe50E, '15:40', the50E()).session;

describe('stopVehicleIsAt', () => {
  it('is the stop the vehicle stands at', () => {
    const { plan } = see(onBoard, '15:45:10', the50E({ left: 1, standing: true }));
    expect(stopVehicleIsAt(plan.vehicle!, moment('15:45:10'))?.stop).toEqual(danmarksplass);
  });

  it('is the last stop it came to, when it has gone on from it', () => {
    const { plan } = see(onBoard, '15:59', the50E({ left: 3 }));
    expect(stopVehicleIsAt(plan.vehicle!, moment('15:59'))?.stop).toEqual(mohlenpris);
  });

  it('is none before the vehicle has come to a stop after the one boarded at', () => {
    const { plan } = see(onBoard, '15:40', the50E({ left: 1 }));
    expect(stopVehicleIsAt(plan.vehicle!, moment('15:40'))).toBeNull();
  });

  it('goes by the time for a vehicle that does not report', () => {
    const silent = (now: string) => silentTwin(the50E({ left: 0 }), at(now));
    const { plan } = see(onThe50E, '15:50', silent('15:50'));
    expect(plan.vehicle?.live).toBe(false);
    expect(stopVehicleIsAt(plan.vehicle!, moment('15:50'))?.stop).toEqual(danmarksplass);
  });
});

describe('"Jeg har gått av"', () => {
  it('has the traveller wait where the vehicle is, kept as their answer', () => {
    const { plan, session } = see(onBoard, '15:58:20', the50E({ left: 2, standing: true }));
    const off = gotOffHere(session, plan.vehicle!, moment('15:58:25'))!;

    expect(off.answer).toEqual({
      question: { kind: 'gotOff', stop: mohlenpris, platform: 'N' },
      yes: true,
      source: 'traveller',
      at: moment('15:58:25').toISOString(),
    });
    expect(off.session.answers).toEqual([off.answer]);
    expect(off.session.following).toEqual({
      serviceJourneyId: 'journey:50E',
      date: '2026-11-16',
      boardedAt: birkelandsskiftet.id,
      gotOffAt: mohlenpris.id,
    });

    const next = see(off.session, '15:58:40', the50E({ left: 3 }));
    expect(next.plan.vehicle?.gotOff?.stop).toEqual(mohlenpris);
    expect(planOf(next.plan)).toEqual(['50E Birkelandsskiftet→Møhlenpris', '410 Møhlenpris→Krokåsskiftet']);
    expect(next.question).toBeNull();
    expect(next.session.expected?.next?.line).toBe('410');
  });

  it('replaces a question about another stop, which is then not asked', () => {
    // The plan had Møhlenpris; the vehicle has gone on, and the traveller says they got off there.
    const asked = see(onBoard, '15:59', the50E({ left: 3 }));
    expect(asked.question).toEqual({ kind: 'gotOff', stop: mohlenpris, platform: 'N' });

    // Said no, then got off at the bus station after all.
    const stayed = answer(asked.session, { question: asked.question!, yes: false, source: 'traveller', at: at('15:59:05') });
    const there = see(stayed, '16:05:10', the50E({ left: 3, standing: true }));
    expect(there.question).toEqual({ kind: 'gotOff', stop: busstasjonen, platform: null });
    const off = gotOffHere(there.session, there.plan.vehicle!, moment('16:05:15'))!;
    expect(off.session.following.gotOffAt).toBe(busstasjonen.id);
    expect(off.session.expected).toBeNull();

    const after = see(off.session, '16:05:30', the50E({ left: 3, standing: true }));
    expect(after.question).toBeNull();
    expect(planOf(after.plan)).toEqual(['50E Birkelandsskiftet→Bergen busstasjon', '400 Bergen busstasjon→Krokåsskiftet']);
  });

  it('at a stop the traveller said they stayed on at, has them off there after all', () => {
    const asked = see(onBoard, '15:58:20', the50E({ left: 2, standing: true }));
    const stayed = answer(asked.session, { question: asked.question!, yes: false, source: 'traveller', at: at('15:58:25') });
    expect(stayed.following.stayedOnAt).toBe(mohlenpris.id);

    const looked = see(stayed, '15:58:30', the50E({ left: 2, standing: true }));
    const off = gotOffHere(looked.session, looked.plan.vehicle!, moment('15:58:35'))!;
    expect(off.session.following.stayedOnAt).toBeUndefined();
    expect(off.session.following.gotOffAt).toBe(mohlenpris.id);
    expect(see(off.session, '15:58:40', the50E({ left: 3 })).plan.vehicle?.gotOff?.stop).toEqual(mohlenpris);
  });

  it('at a stop with no saved way on, leaves the traveller waiting there with no trips', () => {
    const { plan, session } = see(onBoard, '15:45:10', the50E({ left: 1, standing: true }));
    const off = gotOffHere(session, plan.vehicle!, moment('15:45:15'))!;
    expect(off.session.following.gotOffAt).toBe(danmarksplass.id);

    const after = see(off.session, '15:46', the50E({ left: 2 }));
    expect(after.plan.vehicle?.gotOff?.stop).toEqual(danmarksplass);
    expect(after.plan.trips).toEqual([]);
    expect(after.question).toBeNull();
    expect(tripIsOver(after.session)).toBe(false);
  });

  it('is not possible before the vehicle has come to a stop', () => {
    const { plan, session } = see(onBoard, '15:40', the50E({ left: 1 }));
    expect(gotOffHere(session, plan.vehicle!, moment('15:40'))).toBeNull();
  });
});

describe('tripIsOver', () => {
  const under = see(onThe410, '16:10', the410({ left: 1 }), []);

  it('is not while the traveller is on board, or waits for a vehicle on', () => {
    expect(tripIsOver(under.session)).toBe(false);
    const asked = see(onBoard, '15:58:20', the50E({ left: 2, standing: true }));
    const waiting = answer(asked.session, { question: asked.question!, yes: true, source: 'traveller', at: at('15:58:25') });
    expect(tripIsOver(waiting)).toBe(false);
  });

  it('is once the traveller says yes at the stop where the trip ends', () => {
    const there = see(under.session, '16:35:10', the410({ left: 1, standing: true }), []);
    expect(there.question).toEqual({ kind: 'gotOff', stop: krokasskiftet, platform: null });
    expect(tripIsOver(answer(there.session, { question: there.question!, yes: true, source: 'traveller', at: at('16:35:20') }))).toBe(true);
  });

  it('is after the traveller has got off by the button where the trip ends, at the next look', () => {
    const there = see(under.session, '16:35:10', the410({ left: 1, standing: true }), []);
    const off = gotOffHere(there.session, there.plan.vehicle!, moment('16:35:15'))!;
    expect(tripIsOver(off.session)).toBe(false);
    expect(tripIsOver(see(off.session, '16:35:30', the410({ left: 1, standing: true }), []).session)).toBe(true);
  });
});
