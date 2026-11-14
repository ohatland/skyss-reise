import { departureMarking, type DepartureMarking } from '@/core/departure-marking';
import { marginStatus, PLAN_MIN_MARGIN_SECONDS, transferMarginSeconds, type MarginStatus } from '@/core/transfer';
import type { TypicalDelay } from '@/entur/calls';
import type { TripPath } from '@/engine/paths';
import { isLive, isPrecise, type Ride, type RideEnd } from '@/engine/rides';
import { walkKey, type Leg, type StopRef, type TransferWalk, type TransitLeg, type WalkLeg } from '@/model/types';
import { effectiveSeconds, type Walk } from '@/model/walks';

/** What is known about walking times: Entur's estimates at transfers and the traveller's own times. */
export interface WalkTimes {
  transferWalks: TransferWalk[];
  /** The traveller's own times in seconds, by walk key. */
  walkOverrides: Record<string, number>;
}

/** A time at a stop: the timetable, Entur's forecast, and Entur's real-time flag as given. */
export interface TimeAtStop {
  aimed: string;
  expected: string;
  /** Set by Entur also for vehicles that have not started. What to show is in the marking. */
  realtime: boolean;
}

/** A walk shown as a row of its own. */
export interface WalkRow {
  kind: 'walk';
  /** From the address to the first stop, from the last stop to the address, or between two stops on the way. */
  position: 'start' | 'between' | 'end';
  from: StopRef;
  to: StopRef;
  seconds: number;
}

/** How a change of vehicle looks with the forecasts as they are. */
export interface Transfer {
  /** Transfer time: what is left after walking when the next vehicle leaves. Negative when the forecast says it is missed. */
  marginSeconds: number;
  status: MarginStatus;
  /** The walking time counted on: the traveller's own, otherwise Entur's, otherwise none. */
  walkSeconds: number;
  /**
   * When the traveller is there if this departure is missed and the next one
   * that the forecast says is caught is taken instead. Null when there is none.
   */
  arrivalIfMissed: string | null;
}

/** One vehicle the traveller rides, from where they board to where they get off. */
export interface RideRow {
  kind: 'ride';
  line: string;
  mode: string;
  destination: string;
  serviceJourneyId: string;
  date: string;
  from: StopRef;
  fromPlatform: string | null;
  to: StopRef;
  toPlatform: string | null;
  departure: TimeAtStop;
  arrival: TimeAtStop;
  /**
   * The small marking beside the departure time. Real time only for a vehicle
   * that is under way. One that has not started is on the timetable, whatever
   * Entur's flag says, or deviates from it where Entur expects another time.
   */
  marking: DepartureMarking;
  /** True once the vehicle has left the first stop of its journey. */
  started: boolean;
  /** No live forecast, but light rail or boat, whose timetable is taken as exact. */
  precise: boolean;
  predictionInaccurate: boolean;
  /** Entur's typical delay for this vehicle where the traveller boards and gets off. */
  typicalDelay: { departure: TypicalDelay | null; arrival: TypicalDelay | null };
  /** The change from the previous vehicle. Null for the first vehicle. */
  transfer: Transfer | null;
}

export type TripRow = WalkRow | RideRow;

/** One concrete trip: these vehicles, boarded and left at these stops, with the walking around them. */
export interface PlannedTrip {
  /** Identifies the trip by its vehicles and where they are boarded and left. */
  id: string;
  /**
   * Identifies the card the trip belongs to: its last vehicle, leaving out the
   * vehicles of the way between a stop near the address and the address.
   */
  cardKey: string;
  /** Every walk and vehicle in order. */
  rows: TripRow[];
  /** Where the trip starts and ends: the address where the traveller walks to or from it, otherwise the stop. */
  from: StopRef;
  to: StopRef;
  /** When the traveller must leave the address to catch the first vehicle. Null when the trip starts at a stop. */
  leaveAt: string | null;
  /** The first vehicle's departure, with its marking. */
  departure: TimeAtStop;
  departureMarking: DepartureMarking;
  /** When the traveller is there, door to door: the last vehicle's arrival and any walk after it. */
  arrival: string;
  /** Whether the arrival is forecast for a last vehicle that is under way. */
  arrivalRealtime: boolean;
  /**
   * Travel time with the forecasts as they are, from leaving the address (or
   * the first departure) to being there. Not shown before departure; kept for
   * the traffic picture.
   */
  durationSeconds: number;
  /** The same trip by the timetable. */
  scheduledDurationSeconds: number;
  /**
   * Entur's typical delay for the last vehicle where the traveller gets off,
   * when that vehicle is not under way and so has no forecast of its own.
   * Null otherwise, for light rail and boat, and when the median is less than
   * a minute, since there is then nothing to tell.
   */
  typicalArrivalDelay: TypicalDelay | null;
}

/**
 * One card: the best of the trips that share a last vehicle, with the others
 * behind it. The vehicles of the way between a stop near the address and the
 * address do not count as the last, since that way is for the app to choose.
 */
export interface TripCard extends PlannedTrip {
  /** The other trips of the card, best first. */
  alternatives: PlannedTrip[];
}

export interface TripOptions {
  /**
   * How late, in seconds, the forecast may say the traveller is for a transfer
   * that is still taken. None before departure: a trip with a missed transfer
   * is not offered. On board it is a minute, see MISSED_GRACE_SECONDS.
   */
  missedGraceSeconds?: number;
  /**
   * The least transfer time, in seconds, a transfer must have to be taken.
   * For finding the trip that holds with something to spare. Where it is
   * given, `missedGraceSeconds` does not count.
   */
  minMarginSeconds?: number;
  /**
   * Decides for each transfer whether it is taken, given the two rides and
   * the transfer time the forecast leaves. For a rule that looks at more than
   * the transfer time, such as one that remembers which transfers were given
   * up earlier. Where it is given, neither of the two limits above counts.
   */
  allowTransfer?: (from: Ride, to: Ride, marginSeconds: number) => boolean;
  /**
   * The traveller is on the first vehicle already. It is then offered though
   * it has left the stop where they boarded.
   */
  boarded?: boolean;
}

const ms = (time: string) => new Date(time).getTime();
const iso = (time: number) => new Date(time).toISOString();

/**
 * Looks up walking times in the order the traveller decided: their own time for
 * the walk, then Entur's, otherwise none.
 */
export function walkLookup(times: WalkTimes) {
  const known = new Map(times.transferWalks.map((walk) => [walk.key, walk]));
  const own = (key: string): number | null => times.walkOverrides[key] ?? null;

  return {
    /** A walking leg between two stops, or between the address and a stop. */
    leg(leg: WalkLeg): number {
      const key = walkKey(leg.from, leg.to);
      const walk: Walk = {
        key,
        from: leg.from,
        to: leg.to,
        fromPlatform: null,
        toPlatform: null,
        samePlatform: false,
        enturSeconds: leg.seconds ?? null,
        ownSeconds: own(key),
      };
      return effectiveSeconds(walk);
    },

    /**
     * A change of vehicle without a walking leg, by the platforms actually used.
     * A time the traveller set for the two stops as a whole counts where the
     * platforms differ and nothing is known about this pair of them.
     */
    transfer(from: RideEnd, to: RideEnd): number {
      const key = walkKey({ id: from.quayId }, { id: to.quayId });
      const entur = known.get(key);
      const samePlatform = from.quayId === to.quayId;
      const walk: Walk = {
        key,
        from: from.stop,
        to: to.stop,
        fromPlatform: from.platform,
        toPlatform: to.platform,
        samePlatform,
        enturSeconds: entur?.seconds ?? null,
        ownSeconds: own(key) ?? (entur || samePlatform ? null : own(walkKey(from.stop, to.stop))),
      };
      return effectiveSeconds(walk);
    },
  };
}

export type WalkLookup = ReturnType<typeof walkLookup>;

/** One vehicle of the path, with the walking legs that lead to it from the previous vehicle or the address. */
interface Stage {
  /** Where the vehicle's leg is in the path. */
  legIndex: number;
  rides: Ride[];
  walksBefore: WalkLeg[];
  walkSecondsBefore: number;
  departs: number[];
  arrives: number[];
}

interface Link {
  marginSeconds: number;
  walkSeconds: number;
  /** The traveller stays on the same vehicle; there is no transfer to make. */
  sameVehicle: boolean;
}

/** The best way on from one ride: when it gets the traveller there, and by which ride on the next stage. */
interface Best {
  arrival: number;
  next: number | null;
  /** The smallest transfer time on the way from here. */
  minMargin: number;
}

function stagesOf(
  path: Leg[],
  ridesFor: (leg: TransitLeg) => Ride[],
  walks: WalkLookup,
): { stages: Stage[]; walksAfter: WalkLeg[] } {
  const stages: Stage[] = [];
  let pending: WalkLeg[] = [];
  for (const [legIndex, leg] of path.entries()) {
    if (leg.kind === 'walk') {
      pending.push(leg);
      continue;
    }
    const rides = ridesFor(leg);
    stages.push({
      legIndex,
      rides,
      walksBefore: pending,
      walkSecondsBefore: pending.reduce((sum, walk) => sum + walks.leg(walk), 0),
      departs: rides.map((ride) => ms(ride.boarding.expected)),
      arrives: rides.map((ride) => ms(ride.alighting.expected)),
    });
    pending = [];
  }
  return { stages, walksAfter: pending };
}

function timeAtStop(end: RideEnd): TimeAtStop {
  return { aimed: end.aimed, expected: end.expected, realtime: end.realtime };
}

/**
 * The marking beside a departure. A forecast that differs from the timetable
 * is shown as a deviation whether or not the vehicle has started. A forecast
 * that agrees with it counts as real time only for a vehicle that is under way.
 */
function markingOf(ride: Ride): DepartureMarking {
  const marking = departureMarking({
    aimedTime: ride.boarding.aimed,
    expectedTime: ride.boarding.expected,
    realtime: true,
  });
  return marking.kind === 'realtime' && !isLive(ride) ? { kind: 'scheduled' } : marking;
}

/** What to tell under the table about a last vehicle that has no forecast of its own. */
function typicalDelayToShow(ride: Ride): TypicalDelay | null {
  if (isLive(ride) || isPrecise(ride)) return null;
  const delay = ride.alighting.typicalDelay;
  return delay && Math.round(delay.p50Seconds / 60) >= 1 ? delay : null;
}

function rideRow(ride: Ride, transfer: Transfer | null): RideRow {
  const departure = timeAtStop(ride.boarding);
  return {
    kind: 'ride',
    line: ride.line,
    mode: ride.mode,
    destination: ride.destination,
    serviceJourneyId: ride.serviceJourneyId,
    date: ride.date,
    from: ride.boarding.stop,
    fromPlatform: ride.boarding.platform,
    to: ride.alighting.stop,
    toPlatform: ride.alighting.platform,
    departure,
    arrival: timeAtStop(ride.alighting),
    marking: markingOf(ride),
    started: ride.started,
    precise: isPrecise(ride),
    predictionInaccurate: ride.predictionInaccurate,
    typicalDelay: { departure: ride.boarding.typicalDelay, arrival: ride.alighting.typicalDelay },
    transfer,
  };
}

/** One path worked out: its vehicles, and the best way on from every ride of them. */
interface Solved {
  path: TripPath;
  stages: Stage[];
  walksAfter: WalkLeg[];
  walkSecondsAfter: number;
  /** The stage of the vehicle that decides the card: the last one before the way to the address. */
  cardStage: number;
  /** The change from ride `i` of the stage before `k` to ride `j` of stage `k`. */
  link(k: number, i: number, j: number): Link;
  best: (Best | null)[][];
}

/** The change from a ride, arriving at the given moment, to ride `j` of the stage. */
function linkTo(stage: Stage, from: Ride, fromArrives: number, j: number, walks: WalkLookup): Link {
  const to = stage.rides[j];
  const sameVehicle =
    stage.walksBefore.length === 0 &&
    from.serviceJourneyId === to.serviceJourneyId &&
    from.date === to.date &&
    stage.departs[j] >= fromArrives;
  const walkSeconds = sameVehicle
    ? 0
    : stage.walksBefore.length
      ? stage.walkSecondsBefore
      : walks.transfer(from.alighting, to.boarding);
  const marginSeconds = transferMarginSeconds({
    arrival: from.alighting.expected,
    departure: to.boarding.expected,
    walkSeconds,
  });
  return { marginSeconds, walkSeconds, sameVehicle };
}

/**
 * Works out one path from the last vehicle backwards: the best way on from each
 * ride. Null when a leg of the path has no ride, or the path has no vehicle.
 */
function solve(
  path: TripPath,
  ridesFor: (leg: TransitLeg) => Ride[],
  walks: WalkLookup,
  allowed: (from: Ride, to: Ride, marginSeconds: number) => boolean,
): Solved | null {
  const { stages, walksAfter } = stagesOf(path.legs, ridesFor, walks);
  if (stages.length === 0 || stages.some((stage) => stage.rides.length === 0)) return null;

  const walkSecondsAfter = walksAfter.reduce((sum, walk) => sum + walks.leg(walk), 0);
  const lastStage = stages.length - 1;
  const beforeAddress = stages.filter((stage) => stage.legIndex < path.legs.length - path.legsToAddress).length - 1;
  const cardStage = beforeAddress >= 0 ? beforeAddress : lastStage;

  const link = (k: number, i: number, j: number): Link =>
    linkTo(stages[k], stages[k - 1].rides[i], stages[k - 1].arrives[i], j, walks);

  const best: (Best | null)[][] = stages.map(() => []);
  best[lastStage] = stages[lastStage].arrives.map((arrival) => ({
    arrival: arrival + walkSecondsAfter * 1000,
    next: null,
    minMargin: Infinity,
  }));
  for (let k = lastStage - 1; k >= 0; k--) {
    best[k] = stages[k].rides.map((_, i) => {
      let chosen: Best | null = null;
      for (let j = 0; j < stages[k + 1].rides.length; j++) {
        const onward = best[k + 1][j];
        if (!onward) continue;
        const { marginSeconds, sameVehicle } = link(k + 1, i, j);
        if (!sameVehicle && !allowed(stages[k].rides[i], stages[k + 1].rides[j], marginSeconds)) continue;
        const minMargin = Math.min(sameVehicle ? Infinity : marginSeconds, onward.minMargin);
        if (
          !chosen ||
          onward.arrival < chosen.arrival ||
          (onward.arrival === chosen.arrival && minMargin > chosen.minMargin)
        ) {
          chosen = { arrival: onward.arrival, next: j, minMargin };
        }
      }
      return chosen;
    });
  }

  return { path, stages, walksAfter, walkSecondsAfter, cardStage, link, best };
}

/** Identifies the legs of a path up to and including one of them: the way the traveller has come so far. */
function prefixKey(legs: Leg[], lastIndex: number): string {
  return legs
    .slice(0, lastIndex + 1)
    .map((leg) => `${walkKey(leg.from, leg.to)}${leg.kind === 'transit' ? `[${leg.lines.join(',')}]` : ''}`)
    .join('|');
}

/**
 * Tells when the traveller is there if a transfer is missed. Having got off
 * where the transfer is made, they take the next possible trip onward: the best
 * of the later departures the forecast says are caught, by any of the paths
 * that have come the same way so far, or the walk where one of those paths
 * goes on without a vehicle. Staying on the vehicle they got off is not among
 * them, since it has left too.
 */
function missedTransfers(solved: Solved[], walks: WalkLookup) {
  // The paths that have come the same way up to the vehicle before each stage.
  const sameWay = new Map<string, { stage: Stage; best: (Best | null)[] }[]>();
  const wayTo = (one: Solved, k: number) => prefixKey(one.path.legs, one.stages[k - 1].legIndex);
  // Where such a path has no more vehicles, the walk that is left of it, in milliseconds.
  const walkFrom = new Map<string, number>();
  for (const other of solved) {
    for (let k = 1; k < other.stages.length; k++) {
      const key = wayTo(other, k);
      const entry = { stage: other.stages[k], best: other.best[k] };
      const known = sameWay.get(key);
      if (known) known.push(entry);
      else sameWay.set(key, [entry]);
    }
    const key = wayTo(other, other.stages.length);
    const walk = other.walkSecondsAfter * 1000;
    walkFrom.set(key, Math.min(walk, walkFrom.get(key) ?? Infinity));
  }

  const answers = new Map<string, number | null>();

  /** When the traveller arrives if ride `taken` of stage `k` is missed after ride `from` of the stage before. */
  return (one: Solved, k: number, from: number, taken: number): string | null => {
    const way = wayTo(one, k);
    const fromRide = one.stages[k - 1].rides[from];
    const fromArrives = one.stages[k - 1].arrives[from];
    const missed = one.stages[k].departs[taken];
    const key = [way, fromRide.serviceJourneyId, fromRide.date, fromRide.alighting.quayId, fromArrives, missed].join('|');

    let arrival = answers.get(key);
    if (arrival === undefined) {
      // A path that goes on from here on foot needs no departure.
      const walk = walkFrom.get(way);
      arrival = walk === undefined ? null : fromArrives + walk;
      for (const { stage, best } of sameWay.get(way) ?? []) {
        for (let j = 0; j < stage.rides.length; j++) {
          const onward = best[j];
          if (!onward || stage.departs[j] <= missed) continue;
          if (arrival !== null && onward.arrival >= arrival) continue;
          const { marginSeconds, sameVehicle } = linkTo(stage, fromRide, fromArrives, j, walks);
          if (sameVehicle || marginSeconds < 0) continue;
          arrival = onward.arrival;
        }
      }
      answers.set(key, arrival);
    }
    return arrival === null ? null : iso(arrival);
  };
}

/** The trips of one path that is worked out: one for every ride of its first vehicle that has a way on. */
function tripsOf(
  { path, stages, walksAfter, walkSecondsAfter, cardStage, link, best }: Solved,
  walks: WalkLookup,
  now: Date,
  boarded: boolean,
  arrivalIfMissed: (k: number, from: number, taken: number) => string | null,
): PlannedTrip[] {
  const lastStage = stages.length - 1;
  const first = stages[0];
  const leaveEarlier = first.walkSecondsBefore * 1000;
  const trips: PlannedTrip[] = [];

  first.rides.forEach((firstRide, start) => {
    const onward = best[0][start];
    if (!onward) return;
    // A departure the traveller cannot reach with the walk to it counted in is not offered.
    if (!boarded && first.departs[start] - leaveEarlier < now.getTime()) return;

    const chain: number[] = [start];
    for (let k = 0; k < lastStage; k++) {
      const next = best[k][chain[k]]?.next;
      if (next === null || next === undefined) return;
      chain.push(next);
    }

    const rows: TripRow[] = [];
    const ids: string[] = [];
    for (let k = 0; k <= lastStage; k++) {
      const stage = stages[k];
      const ride = stage.rides[chain[k]];
      const change = k > 0 ? link(k, chain[k - 1], chain[k]) : null;
      const previous = rows[rows.length - 1];

      if (change?.sameVehicle && previous?.kind === 'ride') {
        // Staying on board: the row of the vehicle is extended to where the traveller finally gets off.
        const boardedAs = stages[k - 1].rides[chain[k - 1]];
        rows[rows.length - 1] = {
          ...previous,
          to: ride.alighting.stop,
          toPlatform: ride.alighting.platform,
          arrival: timeAtStop(ride.alighting),
          predictionInaccurate: previous.predictionInaccurate || ride.predictionInaccurate,
          typicalDelay: { ...previous.typicalDelay, arrival: ride.alighting.typicalDelay },
        };
        ids[ids.length - 1] = `${boardedAs.serviceJourneyId}@${boardedAs.date}:${previous.from.id}>${ride.alighting.stop.id}`;
        continue;
      }

      for (const walk of stage.walksBefore) {
        rows.push({
          kind: 'walk',
          position: k === 0 ? 'start' : 'between',
          from: walk.from,
          to: walk.to,
          seconds: walks.leg(walk),
        });
      }
      const transfer: Transfer | null = change && {
        marginSeconds: change.marginSeconds,
        status: marginStatus(change.marginSeconds),
        walkSeconds: change.walkSeconds,
        arrivalIfMissed: arrivalIfMissed(k, chain[k - 1], chain[k]),
      };
      rows.push(rideRow(ride, transfer));
      ids.push(`${ride.serviceJourneyId}@${ride.date}:${ride.boarding.stop.id}>${ride.alighting.stop.id}`);
    }
    for (const walk of walksAfter) {
      rows.push({ kind: 'walk', position: 'end', from: walk.from, to: walk.to, seconds: walks.leg(walk) });
    }

    const lastRide = stages[lastStage].rides[chain[lastStage]];
    const cardRide = stages[cardStage].rides[chain[cardStage]];
    const leaves = first.departs[start] - leaveEarlier;
    const scheduledStart = ms(firstRide.boarding.aimed) - leaveEarlier;
    const scheduledEnd = ms(lastRide.alighting.aimed) + walkSecondsAfter * 1000;
    const departure = timeAtStop(firstRide.boarding);

    trips.push({
      id: ids.join('|'),
      cardKey: `${cardRide.serviceJourneyId}@${cardRide.date}`,
      rows,
      from: path.legs[0].from,
      to: path.legs[path.legs.length - 1].to,
      leaveAt: first.walksBefore.length ? iso(leaves) : null,
      departure,
      departureMarking: markingOf(firstRide),
      arrival: iso(onward.arrival),
      arrivalRealtime: isLive(lastRide) && lastRide.alighting.realtime,
      durationSeconds: (onward.arrival - leaves) / 1000,
      scheduledDurationSeconds: (scheduledEnd - scheduledStart) / 1000,
      typicalArrivalDelay: typicalDelayToShow(lastRide),
    });
  });

  return trips;
}

/**
 * The concrete trips along the paths: for every departure of a path's first
 * vehicle that the traveller can still reach, the vehicles onward that get them
 * there first. Where several ways onward arrive at the same time, the one whose
 * tightest transfer is largest is taken. With `boarded`, the traveller is on
 * the first vehicle and it is offered though it has left.
 *
 * A transfer holds when the next vehicle leaves no earlier than the traveller
 * arrives and has walked. With `missedGraceSeconds`, one missed by no more than
 * that is still taken, with a negative transfer time, since it may yet be
 * caught. With `minMarginSeconds`, only transfers with at least that much to
 * spare are taken. Every transfer tells when the traveller arrives if it is missed, by
 * the next possible trip onward along any of the paths. All times are Entur's
 * forecasts as given.
 */
export function tripsOnPaths(
  paths: TripPath[],
  ridesFor: (leg: TransitLeg) => Ride[],
  walks: WalkLookup,
  now: Date,
  { missedGraceSeconds = 0, minMarginSeconds, allowTransfer, boarded = false }: TripOptions = {},
): PlannedTrip[] {
  const leastMarginSeconds = minMarginSeconds ?? -missedGraceSeconds;
  const allowed = allowTransfer ?? ((_from: Ride, _to: Ride, marginSeconds: number) => marginSeconds >= leastMarginSeconds);
  const solved = paths.flatMap((path) => solve(path, ridesFor, walks, allowed) ?? []);
  const ifMissed = missedTransfers(solved, walks);
  return solved.flatMap((one) => tripsOf(one, walks, now, boarded, (k, from, taken) => ifMissed(one, k, from, taken)));
}

/** The concrete trips along one path. See `tripsOnPaths`. */
export function tripsOnPath(
  path: TripPath,
  ridesFor: (leg: TransitLeg) => Ride[],
  walks: WalkLookup,
  now: Date,
  options: TripOptions = {},
): PlannedTrip[] {
  return tripsOnPaths([path], ridesFor, walks, now, options);
}

const rideRows = (trip: PlannedTrip) => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row] : []));

/** The smallest transfer time of the trip; infinite when there is no transfer. */
function tightestMargin(trip: PlannedTrip): number {
  return Math.min(...rideRows(trip).flatMap((row) => (row.transfer ? [row.transfer.marginSeconds] : [])));
}

/**
 * True when every transfer of the trip is comfortable: more than three minutes
 * are left after walking, which the screen shows in green. A trip without a
 * transfer has nothing that can fail and counts as comfortable.
 */
export function isComfortable(trip: PlannedTrip): boolean {
  return rideRows(trip).every((row) => !row.transfer || row.transfer.status === 'good');
}

/**
 * True when every transfer of the trip has the margin a best trip must have:
 * at least a minute left after walking. A trip without a transfer has it.
 */
export function holdsWithMargin(trip: PlannedTrip): boolean {
  return tightestMargin(trip) >= PLAN_MIN_MARGIN_SECONDS;
}

const startsAt = (trip: PlannedTrip) => ms(trip.leaveAt ?? trip.departure.expected);

/** The whole minute a time is shown as. */
const shownMinute = (time: number) => Math.floor(time / 60_000);

/**
 * Sorts trips by when the traveller is there. Of trips arriving together, one
 * whose transfers are all comfortable comes before one with a tight transfer,
 * then the one that starts last, then the one whose tightest transfer is
 * largest, then the one with the fewest vehicles. The same vehicles boarded and
 * left at the same stops are listed once.
 */
export function rankTrips(trips: PlannedTrip[]): PlannedTrip[] {
  // Infinity less infinity is not a number, so the margins are compared rather than subtracted.
  const byMargin = (a: PlannedTrip, b: PlannedTrip) => {
    const [ofA, ofB] = [tightestMargin(a), tightestMargin(b)];
    return ofA === ofB ? 0 : ofA > ofB ? -1 : 1;
  };

  const sorted = [...trips].sort(
    (a, b) =>
      ms(a.arrival) - ms(b.arrival) ||
      Number(isComfortable(b)) - Number(isComfortable(a)) ||
      startsAt(b) - startsAt(a) ||
      byMargin(a, b) ||
      rideRows(a).length - rideRows(b).length ||
      a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  return sorted.filter((trip) => {
    if (seen.has(trip.id)) return false;
    seen.add(trip.id);
    return true;
  });
}

/**
 * One card per last vehicle before the way to the address. Trips that share it
 * compete: they differ only in how the traveller gets to that vehicle, where
 * they get off it, and how they get from there to the address. The best of
 * them by rank is the card, and the rest are kept behind it. The cards stay
 * sorted by when the traveller is there.
 */
export function cardsOf(ranked: PlannedTrip[]): TripCard[] {
  const cards = new Map<string, TripCard>();
  for (const trip of ranked) {
    const card = cards.get(trip.cardKey);
    if (card) card.alternatives.push(trip);
    else cards.set(trip.cardKey, { ...trip, alternatives: [] });
  }
  return [...cards.values()];
}

/**
 * The cards of the front page, the best one first. Trips that share a last
 * vehicle are one card, as in `cardsOf`, but the trip the card shows is one
 * where every transfer has at least a minute, where the card has one, and
 * then the first by rank. A card thus never shows a transfer with nothing to
 * spare while a safer trip lies behind it.
 *
 * The best card is the one that is there first among those whose trip has the
 * minute on every transfer. It stands on top, and the rest follow by when the
 * traveller is there. Arrival and start are compared in whole minutes, as
 * they are shown, so that two cards with the same times on the screen do not
 * change places as the seconds move. Between cards with the same minutes, the
 * order is that of the rank: all transfers comfortable first, then the later
 * start, then the largest tightest transfer, then the fewest vehicles.
 */
export function cardsBestFirst(ranked: PlannedTrip[]): TripCard[] {
  const groups = new Map<string, PlannedTrip[]>();
  for (const trip of ranked) {
    const group = groups.get(trip.cardKey);
    if (group) group.push(trip);
    else groups.set(trip.cardKey, [trip]);
  }
  const cards = [...groups.values()].map((group): TripCard => {
    const shown = group.find(holdsWithMargin) ?? group[0];
    return { ...shown, alternatives: group.filter((trip) => trip !== shown) };
  });

  const byMargin = (a: PlannedTrip, b: PlannedTrip) => {
    const [ofA, ofB] = [tightestMargin(a), tightestMargin(b)];
    return ofA === ofB ? 0 : ofA > ofB ? -1 : 1;
  };
  cards.sort(
    (a, b) =>
      shownMinute(ms(a.arrival)) - shownMinute(ms(b.arrival)) ||
      Number(isComfortable(b)) - Number(isComfortable(a)) ||
      shownMinute(startsAt(b)) - shownMinute(startsAt(a)) ||
      byMargin(a, b) ||
      rideRows(a).length - rideRows(b).length ||
      a.id.localeCompare(b.id),
  );

  const best = cards.findIndex(holdsWithMargin);
  return best > 0 ? [cards[best], ...cards.slice(0, best), ...cards.slice(best + 1)] : cards;
}

/** The cards to show, and the ones another card makes pointless. */
export interface CardSelection {
  shown: TripCard[];
  /** Kept so that the screen can offer to show more. */
  hidden: TripCard[];
}

/**
 * True when `other` makes `card` pointless: it starts no earlier and is there
 * no later, and is better on at least one of the two. A card whose transfers
 * are all comfortable is not beaten by one with a tight transfer, since the
 * traveller may want the safer trip. A card with a transfer of less than a
 * minute beats no card, since it may not hold. Start is when the traveller
 * must leave: the address where they walk from it, otherwise the first
 * departure.
 */
function beats(other: PlannedTrip, card: PlannedTrip): boolean {
  if (!holdsWithMargin(other)) return false;
  if (isComfortable(card) && !isComfortable(other)) return false;
  const later = startsAt(other) - startsAt(card);
  const sooner = ms(card.arrival) - ms(other.arrival);
  return later >= 0 && sooner >= 0 && (later > 0 || sooner > 0);
}

/**
 * Splits the cards into those to show and those another card beats. Two cards
 * that start and arrive at the same moment do not beat each other: both are
 * shown, in the order they are ranked. The order of the cards is kept. A card
 * given as `keep`, such as the best one, is shown whatever beats it.
 */
export function hideBeaten(cards: TripCard[], keep?: TripCard): CardSelection {
  const selection: CardSelection = { shown: [], hidden: [] };
  for (const card of cards) {
    const beaten = card !== keep && cards.some((other) => other !== card && beats(other, card));
    (beaten ? selection.hidden : selection.shown).push(card);
  }
  return selection;
}
