import type { TripPath } from '@/engine/paths';
import { keepsTimetable, type Ride } from '@/engine/rides';
import type { JourneyCall } from '@/entur/journey';
import { chainKey } from '@/mapping/pattern';
import type { StopRef, TransitLeg } from '@/model/types';

/** One run of a vehicle, as Entur and a card on the front page identify it. */
export interface VehicleRef {
  serviceJourneyId: string;
  /** Service date of the journey, YYYY-MM-DD. */
  date: string;
}

/** What the app is told about where the traveller is: on this vehicle, or just off it. */
export interface Following extends VehicleRef {
  /**
   * The stop place where the traveller boarded. The stops up to it are not
   * offered as places to get off. Where it is not given, or the vehicle does
   * not call there, the vehicle is followed from the first stop of its journey.
   */
  boardedAt?: string;
  /**
   * The last stop place the traveller is known to have stayed on the vehicle
   * past, such as one they have said they did not get off at. The stops up to
   * it are not offered either.
   */
  stayedOnAt?: string;
  /**
   * The stop place where the traveller has got off and waits for the next
   * vehicle. The ways on are then those from that stop only, also after the
   * vehicle has left it.
   */
  gotOffAt?: string;
}

/** A time at a stop of the followed vehicle: timetable, Entur's forecast, and what was measured. */
export interface MeasuredTime {
  aimed: string;
  /** Entur's forecast, equal to the timetable when it has nothing better. */
  expected: string;
  /** When the vehicle actually was there. Null until Entur has recorded it. */
  actual: string | null;
}

/** One stop of the followed vehicle. */
export interface VehicleStop {
  stop: StopRef;
  quayId: string;
  platform: string | null;
  arrival: MeasuredTime;
  departure: MeasuredTime;
  realtime: boolean;
  cancelled: boolean;
  /** The vehicle has left the stop, as far as Entur tells. */
  passed: boolean;
}

/** The vehicle the traveller is on, as the screen and the trip log need it. */
export interface FollowedVehicle extends VehicleRef {
  line: string;
  mode: string;
  /** Where the vehicle says it is going, for "Du er på 400 mot Bergen busstasjon". */
  destination: string;
  /** True once the vehicle has left the first stop of its journey. */
  started: boolean;
  /** Entur follows the vehicle: it is under way and reports. Otherwise every time is the timetable's. */
  live: boolean;
  /** Not followed by Entur, but light rail or boat, whose timetable is taken as exact. */
  precise: boolean;
  /** Where the traveller boarded. Null when it is not known. */
  boarding: VehicleStop | null;
  /** Where the traveller has got off and waits. Null while they are on board. */
  gotOff: VehicleStop | null;
  /** Every stop from where the traveller boarded (the first stop when that is not known) to the last. */
  route: VehicleStop[];
  /**
   * The stops ahead where the traveller can get off and a saved way goes on,
   * or where the trip ends, in the order the vehicle reaches them.
   */
  stops: VehicleStop[];
}

/** A followed vehicle read from its calls: where the traveller boarded, and where they can still get off. */
export interface Followed {
  /** The calls of the journey in order. Never empty. */
  calls: JourneyCall[];
  /** The call where the traveller boarded. Null when it is not known. */
  boarding: number | null;
  /** The call where the traveller has got off. Null while they are on board. */
  gotOff: number | null;
  /** Whether the vehicle has left each call. */
  passed: boolean[];
  /** Whether the traveller can get off at each call. */
  open: boolean[];
}

const ms = (time: string) => new Date(time).getTime();

/**
 * Which stops the vehicle has left. A vehicle that reports has left a stop when
 * Entur has measured its departure there, or has measured it at a later stop.
 * One that does not report is taken to keep its timetable, as Entur's forecast
 * then says. The last stop of the journey is never left.
 */
function passedStops(calls: JourneyCall[], now: Date): boolean[] {
  let lastReported = -1;
  calls.forEach((call, index) => {
    if (call.actualArrival || call.actualDeparture) lastReported = index;
  });
  const last = calls.length - 1;
  return calls.map((call, index) => {
    if (index === last) return false;
    if (lastReported >= 0) return index < lastReported || Boolean(call.actualDeparture);
    return ms(call.expectedDeparture) < now.getTime();
  });
}

/**
 * Reads where the traveller is on the vehicle from its calls. Null when there
 * are no calls: Entur does not know the journey.
 */
export function follow(journey: JourneyCall[], following: Following, now: Date): Followed | null {
  if (journey.length === 0) return null;
  // For a journey that reports nothing, Entur fills in the timetable as the arrival at the stops it should have
  // passed, and never a departure. Those are not measurements. A vehicle that reports has departures measured.
  const reports = journey.some((call) => call.actualDeparture);
  const calls = [...journey]
    .sort((a, b) => a.position - b.position)
    .map((call) => (reports ? call : { ...call, actualArrival: null }));
  const passed = passedStops(calls, now);

  // A vehicle that calls twice at the stop was boarded the last time it left it, or will be the first time it comes.
  let boarding: number | null = null;
  if (following.boardedAt) {
    const at = calls.flatMap((call, index) => (call.stopPlaceId === following.boardedAt ? [index] : []));
    const left = at.filter((index) => passed[index]);
    boarding = left.length ? left[left.length - 1] : (at[0] ?? null);
  }
  const stayedOn = following.stayedOnAt
    ? calls.findIndex((call, index) => index > (boarding ?? -1) && call.stopPlaceId === following.stayedOnAt)
    : -1;
  const boarded = Math.max(boarding ?? -1, stayedOn);

  let gotOff: number | null = null;
  if (following.gotOffAt) {
    const index = calls.findIndex((call, i) => i > boarded && call.stopPlaceId === following.gotOffAt);
    gotOff = index >= 0 ? index : null;
  }

  const open = calls.map((call, index) => {
    if (call.cancelled || !call.forAlighting || index <= boarded) return false;
    return gotOff === null ? !passed[index] : index === gotOff;
  });
  return { calls, boarding, gotOff, passed, open };
}

const stopOf = (call: JourneyCall): StopRef => ({ id: call.stopPlaceId, name: call.stopName });

/**
 * The traveller's ride on the followed vehicle over a saved leg: from where
 * they boarded to the leg's second stop. Null when the vehicle is not of the
 * leg's lines, does not run the leg, or the traveller can no longer get off
 * at its second stop. Times the vehicle has been measured at stand for the
 * forecast.
 */
export function vehicleRide(followed: Followed, leg: TransitLeg): { ride: Ride; alighting: number } | null {
  const { calls, open } = followed;
  const first = calls[followed.boarding ?? 0];
  if (!leg.lines.includes(first.line)) return null;

  const from = calls.findIndex((call) => call.stopPlaceId === leg.from.id);
  if (from < 0) return null;
  const alighting = calls.findIndex((call, index) => index > from && open[index] && call.stopPlaceId === leg.to.id);
  if (alighting < 0) return null;
  const last = calls[alighting];

  const ride: Ride = {
    serviceJourneyId: first.serviceJourneyId,
    date: first.date,
    line: first.line,
    mode: first.transportMode,
    destination: first.destination,
    boarding: {
      stop: stopOf(first),
      quayId: first.quayId,
      platform: first.platform,
      aimed: first.aimedDeparture,
      expected: first.actualDeparture ?? first.expectedDeparture,
      realtime: first.realtime,
      typicalDelay: first.typicalDelay,
    },
    alighting: {
      stop: leg.to,
      quayId: last.quayId,
      platform: last.platform,
      aimed: last.aimedArrival,
      expected: last.actualArrival ?? last.expectedArrival,
      realtime: last.realtime,
      typicalDelay: last.typicalDelay,
    },
    started: first.started,
    predictionInaccurate: last.predictionInaccurate,
  };
  return { ride, alighting };
}

/** A way on from the followed vehicle: the traveller's ride on it, then the rest of a saved path. */
export interface OnwardPath {
  path: TripPath;
  /** The ride on the followed vehicle that is the first leg of the path. */
  ride: Ride;
  /** The call of the vehicle where the traveller gets off. */
  alighting: number;
}

/**
 * The ways on from the followed vehicle: every saved path from a leg the
 * vehicle runs and the traveller can still get off at the end of, with that
 * leg replaced by the traveller's own ride. Paths that go on the same way from
 * the same stop are given once.
 */
export function onwardPaths(paths: TripPath[], followed: Followed): OnwardPath[] {
  // One leg per stop the traveller can get off at, so that the same ride is the same leg in every path.
  const boardedLegs = new Map<number, TransitLeg>();
  const byChain = new Map<string, OnwardPath>();

  for (const path of paths) {
    path.legs.forEach((leg, index) => {
      if (leg.kind !== 'transit') return;
      const found = vehicleRide(followed, leg);
      if (!found) return;
      const { ride, alighting } = found;

      let boarded = boardedLegs.get(alighting);
      if (!boarded) {
        boarded = { kind: 'transit', from: ride.boarding.stop, to: leg.to, lines: [ride.line], mode: ride.mode };
        boardedLegs.set(alighting, boarded);
      }
      const legs = [boarded, ...path.legs.slice(index + 1)];
      const legsToAddress = Math.min(path.legsToAddress, path.legs.length - index);
      const key = `${chainKey(legs)}|${legsToAddress}`;
      if (!byChain.has(key)) byChain.set(key, { path: { legs, legsToAddress }, ride, alighting });
    });
  }
  return [...byChain.values()];
}

function vehicleStop(call: JourneyCall, passed: boolean): VehicleStop {
  return {
    stop: stopOf(call),
    quayId: call.quayId,
    platform: call.platform,
    arrival: { aimed: call.aimedArrival, expected: call.expectedArrival, actual: call.actualArrival },
    departure: { aimed: call.aimedDeparture, expected: call.expectedDeparture, actual: call.actualDeparture },
    realtime: call.realtime,
    cancelled: call.cancelled,
    passed,
  };
}

/** The followed vehicle as the screen and the trip log need it. `onward` are the ways on that were found for it. */
export function describeVehicle(followed: Followed, onward: OnwardPath[]): FollowedVehicle {
  const { calls, boarding, gotOff, passed } = followed;
  const first = calls[boarding ?? 0];
  const stops = calls.map((call, index) => vehicleStop(call, passed[index]));
  const changes = [...new Set(onward.map((way) => way.alighting))].sort((a, b) => a - b);

  // The sign of a vehicle can change on the way. The one it shows now is at the first stop it has not left.
  const next = calls.find((_, index) => !passed[index]) ?? calls[calls.length - 1];
  const started = first.started;
  const live = started && calls.some((call) => call.realtime);

  return {
    serviceJourneyId: first.serviceJourneyId,
    date: first.date,
    line: first.line,
    mode: first.transportMode,
    destination: next.destination || calls[calls.length - 1].stopName,
    started,
    live,
    precise: !live && keepsTimetable(first.transportMode),
    boarding: boarding === null ? null : stops[boarding],
    gotOff: gotOff === null ? null : stops[gotOff],
    route: stops.slice(boarding ?? 0),
    stops: changes.map((index) => stops[index]),
  };
}
