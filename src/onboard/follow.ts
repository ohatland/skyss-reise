import { PLAN_MIN_MARGIN_SECONDS } from '@/core/transfer';
import { fetchStopCalls, type StopCall } from '@/entur/calls';
import { fetchJourneyCalls, type JourneyCall } from '@/entur/journey';
import { tripPaths, type TripPath } from '@/engine/paths';
import { callsNeeded, lineIdsFor, ridesLookup, type PlanDeps } from '@/engine/plan';
import { keepsTimetable, type Ride } from '@/engine/rides';
import { transfersOf, transfersThatMayBeCaught, vehicleKey, type TransferMemory } from '@/engine/transfers';
import {
  cardsOf,
  rankTrips,
  tripsOnPaths,
  walkLookup,
  type PlannedTrip,
  type RideRow,
  type TripCard,
  type TripOptions,
} from '@/engine/trips';
import { log } from '@/logging/logger';
import type { StopRef, TransitLeg, TripTypeId } from '@/model/types';
import {
  describeVehicle,
  follow,
  onwardPaths,
  type FollowedVehicle,
  type Following,
  type VehicleRef,
} from '@/onboard/vehicle';
import { loadRoutes, type SavedRoutes } from '@/storage/alternatives';

const ms = (time: string) => new Date(time).getTime();

export { PLAN_MIN_MARGIN_SECONDS };

/** Cards that are there later than this after the active plan are kept for "show more". */
export const SHOW_WITHIN_SECONDS = 30 * 60;

/**
 * How well the active plan holds: every change has the margin asked for, or
 * every change is caught but one with less than that, or a change is forecast
 * as missed and its card still stands.
 */
export type PlanHolds = 'withMargin' | 'withoutMargin' | 'missed';

/**
 * Why the active plan is the one it is:
 * - `first`: there was no plan to hold on to.
 * - `held`: the plan from the last look still holds, and no other trip is there a whole minute sooner.
 * - `earlier`: another trip that holds as well is there sooner, counted in whole minutes as the time is shown.
 * - `failed`: the plan from the last look no longer holds as it must: a change of it has too little time, or is gone.
 */
export type PlanReason = 'first' | 'held' | 'earlier' | 'failed';

/**
 * What a trip on board remembers from one look to the next, so that the plan
 * is held on to and a card that was given up does not flicker back. Plain data,
 * kept with the rest of what is known about the trip.
 */
export interface PlanMemory extends TransferMemory {
  /** The active plan at the last look: its id, and its vehicles. Null when there was none. */
  held: { id: string; vehicles: VehicleRef[] } | null;
}

/** The ways on from the vehicle the traveller is on, at one moment. */
export interface OnBoardPlan {
  tripType: TripTypeId;
  /** The moment the plan is for, ISO 8601. */
  at: string;
  /**
   * What the app was told about where the traveller is. `followVehicle` puts
   * the journey that reports here when it was asked for its silent twin.
   */
  following: Following;
  /** The vehicle followed. Null when Entur does not know the journey. */
  vehicle: FollowedVehicle | null;
  /**
   * The active plan: the trip that gets the traveller there first among those
   * where every change has at least a minute of transfer time. Where a way
   * onward has a first departure that is too tight, the plan may be a later
   * departure along it. Where no trip has the margin, the first without a
   * missed change, and failing that the first of all.
   *
   * With the memory of the last look, the plan is held on to while it holds
   * as well as the best trip does: it gives way only to a trip that is there a
   * whole minute sooner, or when it no longer holds. It is the first of
   * `trips`. Null when there is no trip on.
   */
  activePlan: TripCard | null;
  /** How well the active plan holds. Null when there is none. */
  planHolds: PlanHolds | null;
  /** Why the active plan is the one it is. Null when there is none. */
  planReason: PlanReason | null;
  /**
   * The cards to show: the active plan first, then the others by when the
   * traveller is there. The first row of each trip is the vehicle they are on,
   * to where they get off it. Trips that end on the same last vehicle before
   * the way to the address are one card, as before departure, with the others
   * behind it in `alternatives`. No card is left out because another is better.
   */
  trips: TripCard[];
  /** The cards that are there more than half an hour after the active plan, by when. For "show more". */
  hidden: TripCard[];
  /** What to remember for the next look. */
  memory: PlanMemory;
}

const NO_MEMORY: PlanMemory = { held: null, seen: [], removed: [] };

/** The whole minute a time is shown as. */
const shownMinute = (time: string) => Math.floor(ms(time) / 60_000);

/**
 * The plan held at the last look as it reads from the vehicle the traveller is
 * on now. Once they have changed to the next vehicle of the plan, the plan is
 * what is left of it. Null when the vehicle is not one of the plan's.
 */
function heldFrom(held: PlanMemory['held'], vehicle: VehicleRef): PlanMemory['held'] {
  if (!held) return null;
  const index = held.vehicles.findIndex((one) => vehicleKey(one) === vehicleKey(vehicle));
  if (index < 0) return null;
  return { id: held.id.split('|').slice(index).join('|'), vehicles: held.vehicles.slice(index) };
}

const transferMargins = (trip: PlannedTrip): number[] =>
  trip.rows.flatMap((row) => (row.kind === 'ride' && row.transfer ? [row.transfer.marginSeconds] : []));

/** How well a trip holds as a plan. A trip without a change holds with margin. */
export function planHolds(trip: PlannedTrip): PlanHolds {
  const tightest = Math.min(...transferMargins(trip));
  if (tightest >= PLAN_MIN_MARGIN_SECONDS) return 'withMargin';
  return tightest >= 0 ? 'withoutMargin' : 'missed';
}

/**
 * Lays out the cards around the active plan: the plan's card first, with the
 * plan as the trip it shows, then the other cards by arrival, and those more
 * than half an hour behind the plan apart. `ranked` are the trips by rank, the
 * plan among them.
 */
export function cardsAroundPlan(
  ranked: PlannedTrip[],
  best: PlannedTrip | undefined,
): Pick<OnBoardPlan, 'activePlan' | 'planHolds' | 'trips' | 'hidden'> {
  if (!best) return { activePlan: null, planHolds: null, trips: [], hidden: [] };

  // Put first, the plan becomes the trip its card shows, and that card the first one.
  const [activePlan, ...others] = cardsOf([best, ...ranked.filter((trip) => trip !== best)]);
  const latest = ms(activePlan.arrival) + SHOW_WITHIN_SECONDS * 1000;
  return {
    activePlan,
    planHolds: planHolds(activePlan),
    trips: [activePlan, ...others.filter((card) => ms(card.arrival) <= latest)],
    hidden: others.filter((card) => ms(card.arrival) > latest),
  };
}

/**
 * The trips on from the followed vehicle with the given paths and calls, as
 * cards with the active plan first. A pure function of its input: `journey` is
 * every call of the followed vehicle, `calls` those of the stops and lines
 * onward, and `memory` what the last look left to remember, if there was one.
 *
 * A transfer the forecast says is missed by no more than a minute is still
 * taken, with a negative transfer time and when the traveller is there by the
 * next possible trip onward. One that has been shown is taken until it is
 * missed by more than three minutes. One missed by more gives way to the next
 * departure, and the trip is gone when there is none. A transfer that was
 * shown and then given up in that way is not taken again while it is still
 * forecast as missed, so that its card does not come and go around the limit.
 */
export function planOnBoard(
  tripType: TripTypeId,
  paths: TripPath[],
  journey: JourneyCall[],
  calls: StopCall[],
  routes: Pick<SavedRoutes, 'transferWalks' | 'walkOverrides'>,
  now: Date,
  following: Following,
  memory: PlanMemory | null = null,
): OnBoardPlan {
  const before = memory ?? NO_MEMORY;
  const plan = { tripType, at: now.toISOString(), following };
  const followed = follow(journey, following, now);
  if (!followed) return { ...plan, vehicle: null, ...cardsAroundPlan([], undefined), planReason: null, memory: before };

  const onward = onwardPaths(paths, followed);
  // The first leg of every way on is the traveller's own ride. The rest are ridden by what leaves the stops.
  const own = new Map<TransitLeg, Ride[]>();
  for (const { path, ride } of onward) own.set(path.legs[0] as TransitLeg, [ride]);
  const others = ridesLookup(calls);
  const ridesFor = (leg: TransitLeg) => own.get(leg) ?? others(leg);

  const walks = walkLookup(routes);
  const ways = onward.map((way) => way.path);
  const tripsWith = (options: TripOptions, rides = ridesFor) =>
    rankTrips(tripsOnPaths(ways, rides, walks, now, { ...options, boarded: true }));

  // Which transfers are taken though the forecast says they are missed: those missed by no more than a minute,
  // or by three when they were shown at the last look, unless they have been shown and given up before.
  const transfers = transfersThatMayBeCaught(before);
  const mayYetBeCaught = transfers.allow;

  // The trips of the cards: the one that is there first along each way, with a change that may yet be caught.
  const shown = tripsWith({ allowTransfer: mayYetBeCaught });

  // The best trip: there first with the margin asked for on every change. Along a way where the first departure
  // onward is too tight, that is a later departure, which is no card of its own unless it is the plan. Where no
  // trip has the margin, the first that is caught, and failing that the first of all.
  const levels: TripOptions[] = [{ minMarginSeconds: PLAN_MIN_MARGIN_SECONDS }, { minMarginSeconds: 0 }];
  let level: TripOptions = { allowTransfer: mayYetBeCaught };
  let best: PlannedTrip | undefined = shown[0];
  for (const options of levels) {
    const [first] = tripsWith(options);
    if (first) {
      [best, level] = [first, options];
      break;
    }
  }

  // The plan from the last look is held on to while it holds as well as the best trip does, and that trip is not
  // there a whole minute sooner. It is looked up by its own vehicles, since along its way another departure may
  // now be the one that is there first.
  const held = heldFrom(before.held, followed.calls[0]);
  let reason: PlanReason = 'first';
  if (held && best) {
    const vehicles = new Set(held.vehicles.map(vehicleKey));
    const heldNow = tripsWith(level, (leg) => ridesFor(leg).filter((ride) => vehicles.has(vehicleKey(ride)))).find(
      (trip) => trip.id === held.id,
    );
    if (!heldNow) reason = 'failed';
    else if (shownMinute(best.arrival) < shownMinute(heldNow.arrival)) reason = 'earlier';
    else [best, reason] = [heldNow, 'held'];
  }

  const ranked = best ? rankTrips([...shown, best]) : shown;
  const activePlan = ranked.find((trip) => trip.id === best?.id);
  // On board, every change shown on the trip is remembered, not only those of the last look.
  const seen = new Set(before.seen);
  for (const trip of ranked) for (const key of transfersOf(trip)) seen.add(key);

  return {
    ...plan,
    vehicle: describeVehicle(followed, onward),
    ...cardsAroundPlan(ranked, activePlan),
    planReason: activePlan ? reason : null,
    memory: {
      held: activePlan
        ? { id: activePlan.id, vehicles: activePlan.rows.flatMap((row) => (row.kind === 'ride' ? [{ serviceJourneyId: row.serviceJourneyId, date: row.date }] : [])) }
        : null,
      seen: [...seen],
      removed: transfers.removed(),
    },
  };
}

/** The stops and lines to ask Entur about for the ways on: those after the followed vehicle's own leg. */
export function callsOnward(paths: TripPath[]): { stopPlaceIds: string[]; lines: string[] } {
  return callsNeeded(paths.map((path) => ({ ...path, legs: path.legs.slice(1) })));
}

/** How long after its timetabled start a vehicle that has reported nothing is taken to be silent. */
const SILENT_AFTER_SECONDS = 60;

/**
 * Entur at times lists one departure as two journeys with the same timetable,
 * and only one of them reports once the vehicle is under way. A card picked
 * before the vehicle started may hold the other, which then stays on the
 * timetable however late the vehicle is. For a journey that should have
 * started and has no departure measured, this looks at its last stop for a journey
 * of the same line, platform and timetable that is under way, and gives its
 * calls. Null when there is none, and for light rail and boat, which never
 * report.
 */
async function reportingTwin(
  journey: JourneyCall[],
  now: Date,
  entur: PlanDeps['entur'],
): Promise<JourneyCall[] | null> {
  const first = journey[0];
  const last = journey[journey.length - 1];
  const silent =
    journey.length > 1 &&
    !keepsTimetable(first.transportMode) &&
    !journey.some((call) => call.actualDeparture) &&
    ms(first.aimedDeparture) + SILENT_AFTER_SECONDS * 1000 < now.getTime();
  if (!silent) return null;

  const ids = await lineIdsFor([first.line], entur ?? {});
  const atLastStop = await fetchStopCalls([last.stopPlaceId], ids, now, entur);
  const twin = atLastStop.find(
    (call) =>
      call.started &&
      !call.cancelled &&
      call.serviceJourneyId !== last.serviceJourneyId &&
      call.date === last.date &&
      call.line === last.line &&
      call.quayId === last.quayId &&
      ms(call.aimedArrival) === ms(last.aimedArrival),
  );
  if (!twin) return null;

  const calls = await fetchJourneyCalls(twin.serviceJourneyId, twin.date, entur);
  // The same timetable all the way, not only at the last stop.
  const same =
    calls.length === journey.length &&
    calls.every((call, index) => call.quayId === journey[index].quayId && ms(call.aimedDeparture) === ms(journey[index].aimedDeparture));
  return same ? calls : null;
}

/**
 * Follows the vehicle the traveller is on: when it reaches each stop ahead
 * where they can change, and every trip on from it to where the trip type
 * ends: the active plan first, then the others by when they are there door to
 * door.
 *
 * The app tells which vehicle it is, and where the traveller boarded, however
 * it has come to know: from the card that was pressed, from a button, or from
 * something that recognises the vehicle. When the traveller is on the next
 * vehicle, the same is asked for that one. Between the two, `gotOffAt` keeps
 * the ways on from the stop where they wait. Throws when Entur cannot be
 * reached.
 *
 * With `memory`, what the last look's plan left to remember, the plan is held
 * on to and a card that was given up does not flicker back.
 *
 * Where Entur lists the departure twice and the journey asked for is the one
 * that does not report, the one that does is followed instead. The plan's
 * `following` then holds that journey, and is what to ask for the next time.
 */
export async function followVehicle(
  tripType: TripTypeId,
  following: Following,
  now: Date = new Date(),
  deps: Pick<PlanDeps, 'routes' | 'entur'> & { memory?: PlanMemory | null } = {},
): Promise<OnBoardPlan> {
  const started = Date.now();
  const routes = deps.routes ?? (await loadRoutes());
  const paths = tripPaths(routes, tripType);

  let journey = await fetchJourneyCalls(following.serviceJourneyId, following.date, deps.entur);
  const twin = await reportingTwin(journey, now, deps.entur);
  if (twin) {
    journey = twin;
    following = { ...following, serviceJourneyId: twin[0].serviceJourneyId, date: twin[0].date };
  }
  const followed = follow(journey, following, now);
  const onward = followed ? onwardPaths(paths, followed).map((way) => way.path) : [];
  const { stopPlaceIds, lines } = callsOnward(onward);

  const ids = await lineIdsFor(lines, deps.entur ?? {});
  const calls = await fetchStopCalls(stopPlaceIds, ids, now, deps.entur);
  const plan = planOnBoard(tripType, paths, journey, calls, routes, now, following, deps.memory);

  log.event('vehicle_followed', {
    tripType,
    line: plan.vehicle?.line,
    found: plan.vehicle !== null,
    twin: twin !== null,
    live: plan.vehicle?.live,
    gotOff: Boolean(following.gotOffAt),
    stopsAhead: plan.vehicle?.stops.length,
    paths: onward.length,
    calls: calls.length,
    cards: plan.trips.length,
    hidden: plan.hidden.length,
    planHolds: plan.planHolds,
    planReason: plan.planReason,
    givenUp: plan.memory.removed.length,
    trips: [...plan.trips, ...plan.hidden].reduce((sum, card) => sum + 1 + card.alternatives.length, 0),
    ms: Date.now() - started,
  });
  return plan;
}

const rideRows = (trip: PlannedTrip): RideRow[] => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row] : []));

const isVehicle = (row: RideRow, vehicle: VehicleRef) =>
  row.serviceJourneyId === vehicle.serviceJourneyId && row.date === vehicle.date;

/**
 * The first vehicle of a trip and where it is boarded: what to follow when on
 * board is started from a card on the front page. Null for a trip without a vehicle.
 */
export function firstVehicleOf(trip: PlannedTrip): Following | null {
  const [first] = rideRows(trip);
  return first ? { serviceJourneyId: first.serviceJourneyId, date: first.date, boardedAt: first.from.id } : null;
}

/** A change of vehicle that a trip makes. */
export interface NextVehicle {
  /** The vehicle changed to, and where it is boarded. */
  following: Following;
  /** Where the traveller gets off the vehicle they are on. */
  alightedAt: StopRef;
}

/**
 * The vehicle a trip changes to from the given one: what to follow when the
 * traveller says they have changed as the trip told. Null when the trip does
 * not ride the vehicle, or ends with it.
 */
export function nextVehicleOf(trip: PlannedTrip, vehicle: VehicleRef): NextVehicle | null {
  const rides = rideRows(trip);
  const index = rides.findIndex((row) => isVehicle(row, vehicle));
  const next = index < 0 ? undefined : rides[index + 1];
  if (!next) return null;
  return {
    following: { serviceJourneyId: next.serviceJourneyId, date: next.date, boardedAt: next.from.id },
    alightedAt: rides[index].to,
  };
}
