import { log as appLog } from '@/logging/logger';
import type { TripTypeId } from '@/model/types';
import type { OnBoardPlan } from '@/onboard/follow';
import {
  answer,
  gotOffHere,
  refresh,
  startSession,
  stopVehicleIsAt,
  tripIsOver,
  type Answer,
  type Boarded,
  type OnBoardSession,
  type Question,
} from '@/onboard/session';
import { finishLog, logAnswer, observe, startLog, type TripLog } from '@/onboard/trip-log';

/** A trip on board as the screen shows it, kept apart from the screen so that it lasts while the app is open. */
export interface OnBoardState {
  session: OnBoardSession;
  /** The line and destination of the vehicle boarded, for the heading until the first plan has come. */
  boarded: { line: string; destination: string };
  /** The latest plan. Kept while a new one is fetched, and when fetching fails. Null before the first. */
  plan: OnBoardPlan | null;
  /**
   * The question to ask. It stays until it is answered, or until the next
   * question replaces it, or the trip is over.
   */
  question: Question | null;
  /** Set when the latest look at Entur failed. */
  failed: boolean;
  /** What happened on the trip, for the trip report. Kept only while the app is open. */
  log: TripLog;
  /** The traveller has got off where the trip ends. */
  over: boolean;
}

export type Look = typeof refresh;

/**
 * Holds the trip on board: one at a time. Looking at Entur, answering a
 * question and getting off all go through it, so that a look that was under
 * way when the traveller answered does not undo the answer.
 */
export function createOnBoardStore(look: Look = refresh) {
  let state: OnBoardState | null = null;
  let looking: AbortController | null = null;
  const listeners = new Set<() => void>();

  const set = (next: OnBoardState | null) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const stopLooking = () => {
    looking?.abort();
    looking = null;
  };

  /** Brings the trip to an end once the traveller has got off where it ends. */
  const settle = (next: OnBoardState, at: Date): OnBoardState => {
    if (next.over || !tripIsOver(next.session)) return next;
    stopLooking();
    return { ...next, over: true, question: null, log: finishLog(next.log, at, next.session.following.gotOffAt) };
  };

  /**
   * Whether "Jeg har gått av" can be taken now: on board, with a plan of the
   * vehicle the traveller is on, which has come to a stop since they boarded.
   */
  const canGetOff = (now: Date = new Date()): boolean => {
    const vehicle = state?.plan?.vehicle;
    if (!state || !vehicle || state.session.following.gotOffAt) return false;
    return vehicle.serviceJourneyId === state.session.following.serviceJourneyId && stopVehicleIsAt(vehicle, now) !== null;
  };

  return {
    get: (): OnBoardState | null => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** The traveller says they have boarded this vehicle. Replaces any trip before it. */
    start(tripType: TripTypeId, boarded: Boarded & { line: string; destination: string }, now: Date = new Date()) {
      stopLooking();
      const { line, destination, ...vehicle } = boarded;
      set({
        session: startSession(tripType, vehicle),
        boarded: { line, destination },
        plan: null,
        question: null,
        failed: false,
        log: startLog(tripType, now),
        over: false,
      });
    },

    /** Looks at Entur once. Resolves when the look is done or given up. */
    async refresh(now: Date = new Date()): Promise<void> {
      const before = state;
      if (!before || before.over) return;
      stopLooking();
      const current = new AbortController();
      looking = current;
      try {
        const seen = await look(before.session, now, { entur: { signal: current.signal } });
        // The traveller answered, got off or started another trip meanwhile: this look is of what was.
        if (current.signal.aborted || state?.session !== before.session) return;
        set(
          settle(
            {
              ...state,
              session: seen.session,
              plan: seen.plan,
              question: seen.question ?? state.question,
              failed: false,
              log: observe(state.log, seen.plan),
            },
            now,
          ),
        );
      } catch (error) {
        if (current.signal.aborted || state?.session !== before.session) return;
        appLog.error(error, { where: 'onBoard.refresh' });
        set({ ...state, failed: true });
      } finally {
        if (looking === current) looking = null;
      }
    },

    /** The traveller answers the question that is asked. */
    answer(yes: boolean, now: Date = new Date()) {
      if (!state?.question) return;
      stopLooking();
      const given: Answer = { question: state.question, yes, source: 'traveller', at: now.toISOString() };
      set(settle({ ...state, session: answer(state.session, given), question: null, log: logAnswer(state.log, given) }, now));
    },

    /**
     * "Jeg har gått av": the traveller has got off where the vehicle is. False
     * when the app does not know where that is yet.
     */
    gotOff(now: Date = new Date()): boolean {
      const vehicle = state?.plan?.vehicle;
      // Not while waiting, nor before the plan is of the vehicle the session has the traveller on.
      if (!state || !vehicle || !canGetOff(now)) return false;
      const off = gotOffHere(state.session, vehicle, now);
      if (!off) return false;
      stopLooking();
      set(settle({ ...state, session: off.session, question: null, log: logAnswer(state.log, off.answer) }, now));
      return true;
    },

    canGetOff,

    /** The traveller ends the trip where there is no way on: it is over as when they got off where it ends. */
    finish(now: Date = new Date()) {
      if (!state || state.over) return;
      stopLooking();
      set({ ...state, over: true, question: null, log: finishLog(state.log, now, state.session.following.gotOffAt) });
    },

    /** Leaves the trip. */
    end() {
      stopLooking();
      set(null);
    },
  };
}

export type OnBoardStore = ReturnType<typeof createOnBoardStore>;

/** The app's one trip on board. */
export const onBoardStore = createOnBoardStore();
