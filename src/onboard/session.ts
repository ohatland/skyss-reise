import type { PlanDeps } from '@/engine/plan';
import type { PlannedTrip, RideRow } from '@/engine/trips';
import type { StopRef, TripTypeId } from '@/model/types';
import { followVehicle, type OnBoardPlan, type PlanMemory } from '@/onboard/follow';
import type { FollowedVehicle, Following, VehicleRef } from '@/onboard/vehicle';

/** The vehicle the traveller says they have boarded, and where: what a trip on board starts from. */
export interface Boarded extends VehicleRef {
  /** The stop place where they boarded. */
  boardedAt: string;
}

/** The vehicle the plan tells the traveller to change to. */
export interface NextVehicle extends VehicleRef {
  line: string;
  destination: string;
  /** Where it is boarded. */
  stop: StopRef;
  platform: string | null;
  /** When it leaves there, by Entur's forecast the last time the plan had it. */
  departure: string;
}

/** What the active plan tells the traveller to do next. */
export interface NextStep {
  /** Where they get off the vehicle they are on. */
  alightAt: StopRef;
  alightPlatform: string | null;
  /** The vehicle they change to. Null when the trip goes on without one. */
  next: NextVehicle | null;
}

/**
 * What the app needs to know and cannot see for itself. The traveller is asked,
 * until something that recognises it can answer instead.
 */
export type Question =
  /** "Gikk du av på {holdeplass}?" */
  | { kind: 'gotOff'; stop: StopRef; platform: string | null }
  /** "Er du på {linje} nå?" */
  | { kind: 'boarded'; vehicle: NextVehicle };

/** Who answered: the traveller, or the app itself from position and speed. */
export type AnswerSource = 'traveller' | 'detected';

/** An answer to a question, as an event. */
export interface Answer {
  question: Question;
  yes: boolean;
  source: AnswerSource;
  /** ISO 8601. */
  at: string;
}

/**
 * A trip on board, from when the traveller says they have boarded: where they
 * are as far as the app knows, and what it is waiting to hear. Plain data.
 */
export interface OnBoardSession {
  tripType: TripTypeId;
  following: Following;
  /**
   * What the plan last told the traveller to do next. Kept after the plan has
   * moved on, since the stop is then passed or the vehicle gone, and that is
   * when to ask.
   */
  expected: NextStep | null;
  /**
   * What the last look's plan left to remember: the plan to hold on to, and
   * the changes that were given up and are not to flicker back. Null before
   * the first look.
   */
  memory: PlanMemory | null;
  /** Every answer given, in order. */
  answers: Answer[];
}

const ms = (time: string) => new Date(time).getTime();
const rideRows = (trip: PlannedTrip): RideRow[] => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row] : []));
const sameVehicle = (a: VehicleRef, b: VehicleRef) => a.serviceJourneyId === b.serviceJourneyId && a.date === b.date;

/**
 * Starts a trip on board: the traveller says they have boarded this vehicle at
 * this stop. From then on the app has a plan.
 */
export function startSession(tripType: TripTypeId, boarded: Boarded): OnBoardSession {
  const { serviceJourneyId, date, boardedAt } = boarded;
  return { tripType, following: { serviceJourneyId, date, boardedAt }, expected: null, memory: null, answers: [] };
}

/** What a trip tells the traveller to do next: its first row is the vehicle they are on. */
export function nextStepOf(trip: PlannedTrip): NextStep | null {
  const [own, next] = rideRows(trip);
  if (!own) return null;
  return {
    alightAt: own.to,
    alightPlatform: own.toPlatform,
    next: next
      ? {
          serviceJourneyId: next.serviceJourneyId,
          date: next.date,
          line: next.line,
          destination: next.destination,
          stop: next.from,
          platform: next.fromPlatform,
          departure: next.departure.expected,
        }
      : null,
  };
}

/**
 * True when the vehicle has come to the stop: Entur has measured it there or
 * beyond, or, for a vehicle that does not report, the time has come.
 */
function hasComeTo(vehicle: FollowedVehicle, stopId: string, now: number): boolean {
  const stop = vehicle.route.find((visited, index) => visited.stop.id === stopId && (index > 0 || !vehicle.boarding));
  if (!stop) return false;
  return stop.passed || Boolean(stop.arrival.actual) || (!vehicle.live && ms(stop.arrival.expected) <= now);
}

/** The vehicle as a trip of the plan still changes to it at the stop, with its forecast as it is now. Null when none does. */
function stillOffered(plan: OnBoardPlan, vehicle: NextVehicle): NextVehicle | null {
  for (const card of [...plan.trips, ...plan.hidden]) {
    for (const trip of [card, ...card.alternatives]) {
      const next = rideRows(trip)[1];
      if (next && sameVehicle(next, vehicle) && next.from.id === vehicle.stop.id) {
        return { ...vehicle, departure: next.departure.expected };
      }
    }
  }
  return null;
}

/**
 * Takes in what the app sees at one moment, and tells which question is
 * current, if any.
 *
 * - "Gikk du av på {holdeplass}?" when the vehicle has come to the stop where
 *   the plan had the traveller get off.
 * - "Er du på {linje} nå?" when the vehicle the plan had them change to has
 *   left that stop: no trip changes to it any more, and its time has come. It
 *   is asked whether or not the first question was answered, since a yes says
 *   both.
 *
 * A question stays until it is answered. Nothing more is asked about a stop
 * the traveller has said they stayed on past. A vehicle they have said they
 * are not on is asked about again only if the plan names it again, as when it
 * turns out to be late and still at the stop.
 *
 * While the traveller waits at a stop, the plan may move from one vehicle to a
 * later one because the first has too little margin, though it can still be
 * caught. The first is then still the one asked about when it leaves.
 */
export function afterLook(
  session: OnBoardSession,
  plan: OnBoardPlan,
): { session: OnBoardSession; question: Question | null } {
  const { vehicle, memory } = plan;
  if (!vehicle) return { session, question: null };

  // Where Entur lists the departure twice, the plan tells which journey is followed from now on.
  const following: Following = { ...session.following, serviceJourneyId: plan.following.serviceJourneyId, date: plan.following.date };
  const now = ms(plan.at);
  const waiting = vehicle.gotOff !== null;
  const told = session.expected;

  const hasLeft = (next: NextVehicle | null): next is NextVehicle =>
    next !== null &&
    !stillOffered(plan, next) &&
    ms(next.departure) <= now;

  // What the plan told last time still stands while it waits to be asked about.
  if (told && (waiting || hasComeTo(vehicle, told.alightAt.id, now))) {
    if (hasLeft(told.next)) {
      return { session: { ...session, following, memory }, question: { kind: 'boarded', vehicle: told.next } };
    }
    if (!waiting) {
      return {
        session: { ...session, following, memory },
        question: { kind: 'gotOff', stop: told.alightAt, platform: told.alightPlatform },
      };
    }
  }

  // Otherwise the plan as it is now tells what to do next.
  const step = plan.activePlan ? nextStepOf(plan.activePlan) : null;
  let expected = step;
  if (waiting && told?.next) {
    // The vehicle named before is kept while it can still be caught and the plan names none that leaves sooner.
    const named = stillOffered(plan, told.next);
    if (named && (!step?.next || ms(step.next.departure) > ms(named.departure))) expected = { ...told, next: named };
  }
  const question: Question | null =
    step && !waiting && hasComeTo(vehicle, step.alightAt.id, now)
      ? { kind: 'gotOff', stop: step.alightAt, platform: step.alightPlatform }
      : null;
  return { session: { ...session, following, expected, memory }, question };
}

/**
 * Takes in an answer, from the traveller or from the app itself, and gives
 * where the traveller then is:
 *
 * - Got off: yes, they wait at the stop, and the ways on are those from it.
 *   No, they are still on board, and the ways on are from the stops after it.
 * - Boarded: yes, the app follows the new vehicle from the stop where it was
 *   boarded. No, they are where they were: waiting at the stop, or, where they
 *   had not said that they got off, asked about that next.
 */
export function answer(session: OnBoardSession, given: Answer): OnBoardSession {
  const answers = [...session.answers, given];
  const { question, yes } = given;
  const { serviceJourneyId, date, boardedAt } = session.following;

  if (question.kind === 'gotOff') {
    if (yes) return { ...session, answers, following: { ...session.following, gotOffAt: question.stop.id } };
    return {
      ...session,
      answers,
      following: { serviceJourneyId, date, boardedAt, stayedOnAt: question.stop.id },
      expected: null,
    };
  }

  const { vehicle } = question;
  if (yes) {
    return {
      ...session,
      answers,
      following: { serviceJourneyId: vehicle.serviceJourneyId, date: vehicle.date, boardedAt: vehicle.stop.id },
      expected: null,
    };
  }
  // Waiting, the plan as it then is tells what comes next. Where it is not known whether they got off, that is
  // still to be asked, and the vehicle is not.
  const expected = session.following.gotOffAt || !session.expected ? null : { ...session.expected, next: null };
  return { ...session, answers, expected };
}

/**
 * Looks again: follows the vehicle the session has the traveller on, and gives
 * the plan, the session brought up to date, and the question to ask, if any.
 * The plan is held on to from one look to the next, by what the session remembers.
 * Throws when Entur cannot be reached.
 */
export async function refresh(
  session: OnBoardSession,
  now: Date = new Date(),
  deps: Pick<PlanDeps, 'routes' | 'entur'> = {},
): Promise<{ session: OnBoardSession; plan: OnBoardPlan; question: Question | null }> {
  const plan = await followVehicle(session.tripType, session.following, now, { ...deps, memory: session.memory });
  return { plan, ...afterLook(session, plan) };
}
