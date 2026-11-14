import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import type { StopCall, StopCallsResponse } from '@/entur/calls';
import type { JourneyCall, JourneyCallsResponse } from '@/entur/journey';
import { setLogSinks } from '@/logging/logger';
import type { Alternative, StopRef } from '@/model/types';
import { silentTwin, vehicle } from '@/onboard/__fixtures__/vehicle';
import { planOnBoard, type OnBoardPlan } from '@/onboard/follow';
import { afterLook, answer, nextStepOf, refresh, startSession, type Answer, type OnBoardSession, type Question } from '@/onboard/session';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const birkelandsskiftet = stop('Birkelandsskiftet');
const mohlenpris = stop('Møhlenpris');
const busstasjonen = stop('Bergen busstasjon');

const clock = (time: string) => new Date(at(time)).toISOString();

const alternatives: Alternative[] = [
  { key: 'mohlenpris', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)] },
  { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] },
];
const routes: SavedRoutes = {
  ...NO_ROUTES,
  alternatives,
  connections: [{ key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] }],
  transferWalks: [transferWalk(mohlenpris, 'N', mohlenpris, 'S', 152)],
};
const paths = tripPaths(routes, 'fromWork');

/** The 50E from Birkelandsskiftet, at Møhlenpris at 15:58:10 and at the bus station at 16:05. */
const the50E = (options: Parameters<typeof vehicle>[3] = { left: 1 }) =>
  vehicle(
    '50E',
    '50E',
    [
      [birkelandsskiftet, '15:30', { platform: 'D' }],
      [mohlenpris, '15:57', { expected: '15:58:10', platform: 'N' }],
      [busstasjonen, '16:05'],
    ],
    options,
  );
/** Buses home: from Møhlenpris at 16:02:30 and 16:20, and from the bus station at 16:30. */
const busA = journey('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']]);
const busB = journey('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']]);
const busC = journey('c', '400', [[busstasjonen, '16:30'], [krokasskiftet, '17:10']]);
const all = [...busA, ...busB, ...busC];

const started = startSession('fromWork', { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id });

const look = (session: OnBoardSession, now: string, journeyCalls: JourneyCall[], calls: StopCall[] = all): OnBoardPlan =>
  planOnBoard('fromWork', paths, journeyCalls, calls, routes, new Date(at(now)), session.following, session.memory);

/** Looks, and gives the session after it with the question asked. */
function see(session: OnBoardSession, now: string, journeyCalls: JourneyCall[], calls: StopCall[] = all) {
  const plan = look(session, now, journeyCalls, calls);
  return { plan, ...afterLook(session, plan) };
}

const reply = (session: OnBoardSession, question: Question, yes: boolean, now: string, source: Answer['source'] = 'traveller') =>
  answer(session, { question, yes, source, at: clock(now) });

/** The question as the screen is to put it. */
const text = (question: Question | null) =>
  question === null ? null : question.kind === 'gotOff' ? `Gikk du av på ${question.stop.name}?` : `Er du på ${question.vehicle.line} nå?`;
const planOf = (plan: OnBoardPlan) => plan.activePlan?.rows.flatMap((row) => (row.kind === 'ride' ? [`${row.line} ${row.from.name}→${row.to.name}`] : []));

beforeEach(() => setLogSinks([]));

describe('starting on board', () => {
  it('has the vehicle and the stop where the traveller boarded, and nothing to ask', () => {
    expect(started).toEqual({
      tripType: 'fromWork',
      following: { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id },
      expected: null,
      memory: null,
      answers: [],
    });
  });

  it('has a plan from the first look, and remembers what it tells the traveller to do next', () => {
    const { session, question, plan } = see(started, '15:40', the50E());

    expect(planOf(plan)).toEqual(['50E Birkelandsskiftet→Møhlenpris', '410 Møhlenpris→Krokåsskiftet']);
    expect(question).toBeNull();
    expect(session.expected).toEqual({
      alightAt: mohlenpris,
      alightPlatform: 'N',
      next: {
        serviceJourneyId: 'journey:a',
        date: '2026-11-16',
        line: '410',
        destination: 'Krokåsskiftet',
        stop: mohlenpris,
        platform: 'S',
        departure: at('16:02:30'),
      },
    });
    expect(nextStepOf(plan.activePlan!)).toEqual(session.expected);
  });
});

describe('"Gikk du av på {holdeplass}?"', () => {
  const onBoard = see(started, '15:40', the50E()).session;

  it('is asked when the vehicle has come to the stop where the plan has the traveller get off', () => {
    expect(text(see(onBoard, '15:57:50', the50E()).question)).toBeNull();

    const { question } = see(onBoard, '15:58:20', the50E({ left: 1, standing: true }));
    expect(question).toEqual({ kind: 'gotOff', stop: mohlenpris, platform: 'N' });
    expect(text(question)).toBe('Gikk du av på Møhlenpris?');
  });

  it('is asked at the first look too, when the vehicle is already there', () => {
    expect(text(see(started, '15:58:20', the50E({ left: 1, standing: true })).question)).toBe('Gikk du av på Møhlenpris?');
  });

  it('is still asked when the vehicle has gone on, though the plan is then another', () => {
    const { question, plan, session } = see(onBoard, '15:59', the50E({ left: 2 }));
    // From the vehicle, the only way on is now by the bus station.
    expect(planOf(plan)).toEqual(['50E Birkelandsskiftet→Bergen busstasjon', '400 Bergen busstasjon→Krokåsskiftet']);
    expect(text(question)).toBe('Gikk du av på Møhlenpris?');
    // It stays until it is answered.
    expect(text(see(session, '15:59:30', the50E({ left: 2 })).question)).toBe('Gikk du av på Møhlenpris?');
  });

  it('goes by the time for a vehicle that does not report', () => {
    const silent = (now: string) => silentTwin(the50E({ left: 0 }), at(now));
    const before = see(started, '15:56', silent('15:56'));
    expect(text(before.question)).toBeNull();
    // By the timetable it is at Møhlenpris at 15:57.
    expect(text(see(before.session, '15:57', silent('15:57')).question)).toBe('Gikk du av på Møhlenpris?');
  });

  describe('answered yes', () => {
    const asked = see(onBoard, '15:59', the50E({ left: 2 }));
    const waiting = reply(asked.session, asked.question!, true, '15:59:10');

    it('has the traveller wait at the stop, with the ways on from it', () => {
      expect(waiting.following).toEqual({ serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id, gotOffAt: mohlenpris.id });

      const { plan, question } = see(waiting, '15:59:30', the50E({ left: 2 }));
      expect(plan.vehicle?.gotOff?.stop).toEqual(mohlenpris);
      expect(planOf(plan)).toEqual(['50E Birkelandsskiftet→Møhlenpris', '410 Møhlenpris→Krokåsskiftet']);
      expect(plan.trips).toHaveLength(1);
      expect(question).toBeNull();
    });

    it('is kept as an event with who answered', () => {
      expect(waiting.answers).toEqual([
        { question: { kind: 'gotOff', stop: mohlenpris, platform: 'N' }, yes: true, source: 'traveller', at: clock('15:59:10') },
      ]);
    });
  });

  describe('answered no', () => {
    const asked = see(onBoard, '15:58:20', the50E({ left: 1, standing: true }));
    const stayed = reply(asked.session, asked.question!, false, '15:58:25');

    it('has the traveller still on board, with a new plan from the stops after it', () => {
      expect(stayed.following).toEqual({ serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id, stayedOnAt: mohlenpris.id });
      expect(stayed.expected).toBeNull();

      // The vehicle still stands at Møhlenpris. It is no longer a place to get off.
      const { plan, question, session } = see(stayed, '15:58:30', the50E({ left: 1, standing: true }));
      expect(plan.vehicle?.stops.map((ahead) => ahead.stop.name)).toEqual(['Bergen busstasjon']);
      expect(planOf(plan)).toEqual(['50E Birkelandsskiftet→Bergen busstasjon', '400 Bergen busstasjon→Krokåsskiftet']);
      expect(question).toBeNull();
      expect(session.expected?.alightAt).toEqual(busstasjonen);
    });

    it('is not asked again about that stop, but about the next one the plan names', () => {
      const next = see(stayed, '15:59:30', the50E({ left: 2 }));
      expect(next.question).toBeNull();
      const there = see(next.session, '16:05:10', the50E({ left: 2, standing: true }));
      expect(text(there.question)).toBe('Gikk du av på Bergen busstasjon?');
    });
  });

  it('is asked about the last stop too, where the trip ends', () => {
    const on410 = startSession('fromWork', { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });
    const the410 = (options: Parameters<typeof vehicle>[3]) =>
      vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']], options);

    const under = see(on410, '16:10', the410({ left: 1 }), []);
    expect(under.session.expected).toEqual({ alightAt: krokasskiftet, alightPlatform: null, next: null });
    expect(under.question).toBeNull();

    const there = see(under.session, '16:35:10', the410({ left: 1, standing: true }), []);
    expect(text(there.question)).toBe('Gikk du av på Krokåsskiftet?');
    const off = reply(there.session, there.question!, true, '16:35:20');
    expect(off.following.gotOffAt).toBe(krokasskiftet.id);
    expect(see(off, '16:36', the410({ left: 1, standing: true }), []).question).toBeNull();
  });
});

describe('"Er du på {linje} nå?"', () => {
  const onBoard = see(started, '15:40', the50E()).session;
  const asked = see(onBoard, '15:59', the50E({ left: 2 }));
  const waiting = see(reply(asked.session, asked.question!, true, '15:59:10'), '15:59:30', the50E({ left: 2 })).session;
  /** What leaves the stops once the 16:02:30 from Møhlenpris has gone. */
  const afterA = [...busB, ...busC];

  it('is not asked while the vehicle the plan names has yet to leave', () => {
    expect(see(waiting, '16:02:20', the50E({ left: 2 })).question).toBeNull();
    // Its time has come, but it is late and still there by Entur's forecast.
    const late = journey('a', '410', [[mohlenpris, '16:02:30', { expected: '16:03:10', platform: 'S' }], [krokasskiftet, '16:35']]);
    const held = see(waiting, '16:02:40', the50E({ left: 2 }), [...late, ...afterA]);
    expect(held.question).toBeNull();
    expect(held.session.expected?.next?.departure).toBe(at('16:03:10'));
  });

  it('is asked when that vehicle has left the stop', () => {
    const { question, plan } = see(waiting, '16:02:40', the50E({ left: 2 }), afterA);
    expect(text(question)).toBe('Er du på 410 nå?');
    expect(question).toMatchObject({ kind: 'boarded', vehicle: { serviceJourneyId: 'journey:a', line: '410', stop: mohlenpris, platform: 'S' } });
    // The plan has moved on to the next bus meanwhile.
    expect(planOf(plan)).toEqual(['50E Birkelandsskiftet→Møhlenpris', '410 Møhlenpris→Krokåsskiftet']);
    expect(plan.activePlan?.cardKey).toBe('journey:b@2026-11-16');
  });

  it('is not asked when the vehicle is gone from the plan before its time, as when it is cancelled', () => {
    const cancelled = busA.map((call) => ({ ...call, cancelled: true }));
    const { question, session } = see(waiting, '16:01', the50E({ left: 2 }), [...cancelled, ...afterA]);
    expect(question).toBeNull();
    // The plan now names the next bus, and that is the one asked about when it leaves.
    expect(session.expected?.next?.serviceJourneyId).toBe('journey:b');
    expect(text(see(session, '16:20:10', the50E({ left: 2 }), busC).question)).toBe('Er du på 410 nå?');
  });

  describe('answered yes', () => {
    const left = see(waiting, '16:02:40', the50E({ left: 2 }), afterA);
    const riding = reply(left.session, left.question!, true, '16:02:50', 'detected');

    it('follows the new vehicle from the stop where it was boarded', () => {
      expect(riding.following).toEqual({ serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });
      expect(riding.expected).toBeNull();

      const the410 = vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']], { left: 1 });
      const { plan, question } = see(riding, '16:03', the410, []);
      expect(plan.vehicle).toMatchObject({ line: '410', boarding: { stop: mohlenpris } });
      expect(planOf(plan)).toEqual(['410 Møhlenpris→Krokåsskiftet']);
      expect(question).toBeNull();
    });

    it('is kept as an event, also when the app answered it itself', () => {
      expect(riding.answers.map((given) => [given.question.kind, given.yes, given.source])).toEqual([
        ['gotOff', true, 'traveller'],
        ['boarded', true, 'detected'],
      ]);
    });
  });

  describe('answered no', () => {
    const left = see(waiting, '16:02:40', the50E({ left: 2 }), afterA);
    const still = reply(left.session, left.question!, false, '16:02:50');

    it('has the traveller still waiting at the stop, and is not asked again about that vehicle', () => {
      expect(still.following.gotOffAt).toBe(mohlenpris.id);
      expect(still.expected).toBeNull();

      const { question, session, plan } = see(still, '16:03', the50E({ left: 2 }), afterA);
      expect(question).toBeNull();
      expect(plan.activePlan?.cardKey).toBe('journey:b@2026-11-16');
      expect(session.expected?.next?.serviceJourneyId).toBe('journey:b');
    });

    it('is asked about that vehicle again only when the plan names it again, as when it was late and still there', () => {
      // Entur now has the 16:02:30 at 16:04. It had not left after all.
      const late = journey('a', '410', [[mohlenpris, '16:02:30', { expected: '16:04', platform: 'S' }], [krokasskiftet, '16:35']]);
      const back = see(still, '16:03', the50E({ left: 2 }), [...late, ...afterA]);
      expect(back.question).toBeNull();
      expect(back.session.expected?.next).toMatchObject({ serviceJourneyId: 'journey:a', departure: at('16:04') });
      expect(text(see(back.session, '16:04:10', the50E({ left: 2 }), afterA).question)).toBe('Er du på 410 nå?');
    });

    it('is asked about the next vehicle of the plan when that has left', () => {
      const next = see(still, '16:03', the50E({ left: 2 }), afterA).session;
      expect(text(see(next, '16:20:10', the50E({ left: 2 }), busC).question)).toBe('Er du på 410 nå?');
    });
  });

  describe('when the traveller has not said that they got off', () => {
    // The 50E has gone on from Møhlenpris, and the question about that has not been answered.
    const unanswered = see(onBoard, '15:59', the50E({ left: 2 })).session;

    it('is asked in place of that question once the vehicle the plan named has left', () => {
      expect(text(see(unanswered, '16:02:20', the50E({ left: 2 })).question)).toBe('Gikk du av på Møhlenpris?');
      expect(text(see(unanswered, '16:02:40', the50E({ left: 2 }), afterA).question)).toBe('Er du på 410 nå?');
    });

    it('answered yes, follows the new vehicle: the traveller got off and changed', () => {
      const { session, question } = see(unanswered, '16:02:40', the50E({ left: 2 }), afterA);
      expect(reply(session, question!, true, '16:03').following).toEqual({ serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });
    });

    it('answered no, asks whether they got off', () => {
      const { session, question } = see(unanswered, '16:02:40', the50E({ left: 2 }), afterA);
      const no = reply(session, question!, false, '16:03');
      expect(no.following.gotOffAt).toBeUndefined();

      const again = see(no, '16:03:10', the50E({ left: 2 }), afterA);
      expect(text(again.question)).toBe('Gikk du av på Møhlenpris?');
      // No again: still on the 50E, on to the bus station.
      const onward = see(reply(again.session, again.question!, false, '16:03:20'), '16:03:30', the50E({ left: 2 }), afterA);
      expect(onward.question).toBeNull();
      expect(planOf(onward.plan)).toEqual(['50E Birkelandsskiftet→Bergen busstasjon', '400 Bergen busstasjon→Krokåsskiftet']);
    });
  });

  it('is asked about the vehicle the plan first named, when the plan moves to a later one while that can still be caught', () => {
    // Waiting at Møhlenpris, where the 50E was half a minute later than forecast: 16:02:30 is 48 seconds after the walk.
    const late = the50E({ left: 2 }).map((call) => (call.stopPlaceId === mohlenpris.id ? { ...call, actualArrival: at('15:59:10'), expectedArrival: at('15:59:10') } : call));
    const tight = see(waiting, '15:59:40', late);
    // With under a minute to spare, the plan is the next bus. The first one is still a card.
    expect(tight.plan.activePlan?.cardKey).toBe('journey:b@2026-11-16');
    expect(tight.plan.trips.map((trip) => trip.cardKey)).toEqual(['journey:b@2026-11-16', 'journey:a@2026-11-16']);
    expect(tight.session.expected?.next?.serviceJourneyId).toBe('journey:a');
    expect(tight.question).toBeNull();

    const gone = see(tight.session, '16:02:40', late, afterA);
    expect(gone.question).toMatchObject({ kind: 'boarded', vehicle: { serviceJourneyId: 'journey:a' } });
  });
});

describe('what the session remembers of the plan', () => {
  /** A bus from the bus station that is at Krokåsskiftet in the same minute as the one from Møhlenpris. */
  const busD = (arrives: string) => journey('d', '400', [[busstasjonen, '16:25'], [krokasskiftet, arrives]]);

  it('is kept from each look, and has the plan held at the next', () => {
    const first = see(started, '15:40', the50E(), [...busA, ...busD('16:35:30')]);
    expect(first.session.memory).toEqual(first.plan.memory);
    expect(first.plan.planReason).toBe('first');
    expect(first.plan.activePlan?.cardKey).toBe('journey:a@2026-11-16');

    // The bus from the station is now there twenty seconds before the other, with far more to spare.
    const second = see(first.session, '15:41', the50E(), [...busA, ...busD('16:34:40').map((call) => ({ ...call }))]);
    expect(second.plan.planReason).toBe('earlier');

    const same = see(first.session, '15:41', the50E(), [...busA, ...busD('16:35:00')]);
    expect(same.plan.planReason).toBe('held');
    expect(same.plan.activePlan?.cardKey).toBe('journey:a@2026-11-16');
    // A session that remembers nothing would take the other.
    expect(see({ ...first.session, memory: null }, '15:41', the50E(), [...busA, ...busD('16:35:00')]).plan.activePlan?.cardKey).toBe('journey:d@2026-11-16');
  });

  it('is kept while a question waits to be answered', () => {
    const onBoard = see(started, '15:40', the50E()).session;
    const asked = see(onBoard, '15:58:20', the50E({ left: 1, standing: true }));
    expect(asked.question).not.toBeNull();
    expect(asked.session.memory).toEqual(asked.plan.memory);
  });
});

describe('a departure Entur lists twice', () => {
  it('has the session follow the journey the plan says is followed', () => {
    const plan = look(started, '15:40', the50E());
    const twin: OnBoardPlan = { ...plan, following: { ...plan.following, serviceJourneyId: 'journey:50E-twin' } };
    expect(afterLook(started, twin).session.following).toEqual({
      serviceJourneyId: 'journey:50E-twin',
      date: '2026-11-16',
      boardedAt: birkelandsskiftet.id,
    });
  });
});

describe('a look without a vehicle', () => {
  it('asks nothing and leaves the session as it is', () => {
    expect(see(started, '15:40', [])).toMatchObject({ session: started, question: null });
  });
});

describe('refresh', () => {
  const toJourneyResponse = (calls: JourneyCall[]): JourneyCallsResponse => ({
    serviceJourney: {
      id: calls[0].serviceJourneyId,
      line: { publicCode: calls[0].line, transportMode: calls[0].transportMode },
      estimatedCalls: calls.map((call) => ({
        aimedArrivalTime: call.aimedArrival,
        expectedArrivalTime: call.expectedArrival,
        actualArrivalTime: call.actualArrival,
        aimedDepartureTime: call.aimedDeparture,
        expectedDepartureTime: call.expectedDeparture,
        actualDepartureTime: call.actualDeparture,
        realtime: call.realtime,
        cancellation: call.cancelled,
        predictionInaccurate: call.predictionInaccurate,
        forBoarding: call.forBoarding,
        forAlighting: call.forAlighting,
        stopPositionInPattern: call.position,
        empiricalDelay: null,
        quay: { id: call.quayId, publicCode: call.platform, name: call.stopName, stopPlace: { id: call.stopPlaceId, name: call.stopName } },
        destinationDisplay: { frontText: call.destination },
      })),
    },
  });
  const toStopResponse = (calls: StopCall[]): StopCallsResponse => ({
    stopPlaces: [...new Set(calls.map((call) => call.stopPlaceId))].map((id) => ({
      id,
      estimatedCalls: calls
        .filter((call) => call.stopPlaceId === id)
        .map((call) => ({
          date: call.date,
          aimedArrivalTime: call.aimedArrival,
          expectedArrivalTime: call.expectedArrival,
          aimedDepartureTime: call.aimedDeparture,
          expectedDepartureTime: call.expectedDeparture,
          realtime: call.realtime,
          cancellation: call.cancelled,
          predictionInaccurate: call.predictionInaccurate,
          forBoarding: call.forBoarding,
          forAlighting: call.forAlighting,
          stopPositionInPattern: call.position,
          empiricalDelay: null,
          quay: { id: call.quayId, publicCode: call.platform },
          destinationDisplay: { frontText: call.destination },
          serviceJourney: { id: call.serviceJourneyId, line: { publicCode: call.line, transportMode: call.transportMode } },
          serviceJourneyEstimatedCalls: { first: { actualDepartureTime: call.started ? call.aimedDeparture : null } },
        })),
    })),
  });
  const entur = (journeyCalls: JourneyCall[], calls: StopCall[]) =>
    (async (_url: string, init: RequestInit) => {
      const { query, variables } = JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
      const data = query.includes('serviceJourney(')
        ? toJourneyResponse(journeyCalls)
        : query.includes('lines(')
          ? { lines: (variables.codes as string[]).map((code) => ({ id: `SKY:Line:${code}`, publicCode: code })) }
          : toStopResponse(calls);
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    }) as unknown as typeof fetch;

  it('follows the vehicle of the session and gives the plan, the session after it, and the question', async () => {
    const first = await refresh(started, new Date(at('15:40')), { routes, entur: { fetchImpl: entur(the50E(), all) } });
    expect(planOf(first.plan)).toEqual(['50E Birkelandsskiftet→Møhlenpris', '410 Møhlenpris→Krokåsskiftet']);
    expect(first.question).toBeNull();
    expect(first.session.expected?.alightAt).toEqual(mohlenpris);

    const there = await refresh(first.session, new Date(at('15:58:20')), {
      routes,
      entur: { fetchImpl: entur(the50E({ left: 1, standing: true }), all) },
    });
    expect(text(there.question)).toBe('Gikk du av på Møhlenpris?');
    // The plan of the first look is passed on to the second, where it is held.
    expect(first.plan.planReason).toBe('first');
    expect(there.plan.planReason).toBe('held');
    expect(there.session.memory?.held?.id).toBe(first.plan.activePlan?.id);
  });
});
