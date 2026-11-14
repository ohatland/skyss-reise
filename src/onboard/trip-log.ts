import { marginStatus, type MarginStatus } from '@/core/transfer';
import type { PlannedTrip, RideRow } from '@/engine/trips';
import type { StopRef, TripTypeId } from '@/model/types';
import type { OnBoardPlan } from '@/onboard/follow';
import type { Answer } from '@/onboard/session';
import type { FollowedVehicle, MeasuredTime, VehicleRef, VehicleStop } from '@/onboard/vehicle';

/** What the app said at one moment about when the traveller is there. */
export interface Estimate {
  at: string;
  /** Door to door. */
  arrival: string;
  /** The active plan when it was said. */
  tripId: string;
}

/** A transfer time the app showed at one moment. */
export interface Forecast {
  at: string;
  marginSeconds: number;
}

/** One vehicle the traveller rode. */
export interface LoggedLeg extends VehicleRef {
  line: string;
  mode: string;
  destination: string;
  /** Where the traveller boarded and when the vehicle left. Null when the app was not told where. */
  from: StopRef | null;
  fromPlatform: string | null;
  departure: MeasuredTime | null;
  /** Where the traveller got off and when the vehicle was there. Null until it is known. */
  to: StopRef | null;
  toPlatform: string | null;
  arrival: MeasuredTime | null;
}

/** One end of a change of vehicle that the app showed. */
interface ChangeEnd extends VehicleRef {
  line: string;
  stop: StopRef;
  platform: string | null;
}

/** A change of vehicle the app has shown in a card, with the transfer time it gave the first and the last time. */
export interface SeenChange {
  from: ChangeEnd;
  to: ChangeEnd;
  walkSeconds: number;
  first: Forecast;
  last: Forecast;
}

/** What is known about the change from one vehicle the traveller rode to the next. */
export interface LoggedChange {
  /** When the app came to know of it. */
  at: string;
  /** The change as the app showed it. Null when the app never offered it. */
  seen: SeenChange | null;
  /** Whether it is the change the active plan told to make at the last look before it. Null when there was no plan. */
  asRecommended: boolean | null;
}

/** A change the active plan told to make next that was lost: the forecast gave it up, or the next vehicle left or was cancelled. */
export interface LostChange extends SeenChange {
  /** When the app stopped showing it. */
  at: string;
}

export type LogEvent =
  | { kind: 'boarded'; at: string; line: string; destination: string; stop: StopRef | null }
  | { kind: 'recommendation'; at: string; tripId: string; arrival: string; lines: string[] }
  | { kind: 'lost'; at: string; line: string; stop: StopRef; marginSeconds: number }
  | { kind: 'gotOff'; at: string; line: string; stop: StopRef }
  | { kind: 'changed'; at: string; line: string; destination: string; stop: StopRef | null; asRecommended: boolean | null }
  | { kind: 'arrived'; at: string; stop: StopRef | null }
  /** An answer to "Gikk du av på …?" or "Er du på … nå?", from the traveller or from the app itself. */
  | { kind: 'answer'; at: string; question: 'gotOff' | 'boarded'; stop: StopRef; line: string | null; yes: boolean; source: Answer['source'] };

/**
 * What happened on one trip, gathered while the traveller is under way: the
 * vehicles they rode, what the app said about each change, and the times Entur
 * measured. Plain data, so that it can be stored and sent as it is.
 */
export interface TripLog {
  tripType: TripTypeId;
  startedAt: string;
  finishedAt: string | null;
  /**
   * The plan as it stood when the traveller boarded: the active plan the
   * first time the app looked. The report holds what happened up against it.
   */
  planAtStart: { at: string; trip: PlannedTrip } | null;
  /** The app's first estimate of the arrival: that of the plan at the start. */
  firstEstimate: Estimate | null;
  /** The latest. */
  estimate: Estimate | null;
  legs: LoggedLeg[];
  /** `changes[i]` is the change from `legs[i]` to `legs[i + 1]`. */
  changes: LoggedChange[];
  /** The changes the active plan told to make next that were lost and not made after all, by the two vehicles and stops. */
  lost: Record<string, LostChange>;
  /** Every change of vehicle the app has shown, by the two vehicles and stops. */
  seen: Record<string, SeenChange>;
  /** The vehicle the traveller is on, as last looked at. */
  vehicle: FollowedVehicle | null;
  /** The active plan at the last look. */
  top: PlannedTrip | null;
  /** The walk from the last stop to the address, as the app counted it. Null when there is none or it is not known. */
  walkSecondsAfter: number | null;
  events: LogEvent[];
}

const ms = (time: string) => new Date(time).getTime();
const rideRows = (trip: PlannedTrip): RideRow[] => trip.rows.flatMap((row) => (row.kind === 'ride' ? [row] : []));
const sameVehicle = (a: VehicleRef, b: VehicleRef) => a.serviceJourneyId === b.serviceJourneyId && a.date === b.date;

/** Starts the log of a trip, when the traveller says they have boarded. */
export function startLog(tripType: TripTypeId, at: Date): TripLog {
  return {
    tripType,
    startedAt: at.toISOString(),
    finishedAt: null,
    planAtStart: null,
    firstEstimate: null,
    estimate: null,
    legs: [],
    changes: [],
    lost: {},
    seen: {},
    vehicle: null,
    top: null,
    walkSecondsAfter: null,
    events: [],
  };
}

const changeKey = (from: VehicleRef, fromStop: string, to: VehicleRef, toStop: string) =>
  `${from.serviceJourneyId}@${from.date}:${fromStop}>${to.serviceJourneyId}@${to.date}:${toStop}`;

const keyOf = (change: SeenChange) => changeKey(change.from, change.from.stop.id, change.to, change.to.stop.id);

/** The changes of vehicle a trip makes, with the transfer time it shows for each. */
function changesOf(trip: PlannedTrip, at: string): [string, SeenChange][] {
  const rides = rideRows(trip);
  return rides.slice(1).flatMap((row, index) => {
    const before = rides[index];
    if (!row.transfer) return [];
    const forecast = { at, marginSeconds: row.transfer.marginSeconds };
    const end = (ride: RideRow, stop: StopRef, platform: string | null): ChangeEnd => ({
      serviceJourneyId: ride.serviceJourneyId,
      date: ride.date,
      line: ride.line,
      stop,
      platform,
    });
    return [
      [
        changeKey(before, before.to.id, row, row.from.id),
        {
          from: end(before, before.to, before.toPlatform),
          to: end(row, row.from, row.fromPlatform),
          walkSeconds: row.transfer.walkSeconds,
          first: forecast,
          last: forecast,
        },
      ],
    ];
  });
}

/** The change the trip makes from the given vehicle. Null when it makes none. */
function changeFrom(trip: PlannedTrip | null, vehicle: VehicleRef, seen: Record<string, SeenChange>): SeenChange | null {
  if (!trip) return null;
  const rides = rideRows(trip);
  const index = rides.findIndex((row) => sameVehicle(row, vehicle));
  const next = index < 0 ? undefined : rides[index + 1];
  return next ? (seen[changeKey(rides[index], rides[index].to.id, next, next.from.id)] ?? null) : null;
}

/** True when the vehicle is the one the leg is ridden with under another journey id: same line, boarded at the same stop at the same timetabled time. */
function isTwin(leg: LoggedLeg, vehicle: FollowedVehicle): boolean {
  const boarding = vehicle.boarding;
  return (
    leg.line === vehicle.line &&
    leg.from !== null &&
    leg.departure !== null &&
    boarding !== null &&
    boarding.stop.id === leg.from.id &&
    ms(boarding.departure.aimed) === ms(leg.departure.aimed)
  );
}

const routeStop = (vehicle: FollowedVehicle | null, stopId: string | undefined): VehicleStop | null =>
  vehicle?.route.find((stop, index) => stop.stop.id === stopId && (index > 0 || !vehicle.boarding)) ?? null;

/** Brings the times of the legs ridden with this vehicle up to date with what Entur now says. */
function withTimes(legs: LoggedLeg[], vehicle: FollowedVehicle): LoggedLeg[] {
  return legs.map((leg) => {
    if (!sameVehicle(leg, vehicle)) return leg;
    const alighted = leg.to ? routeStop(vehicle, leg.to.id) : null;
    return {
      ...leg,
      departure: vehicle.boarding?.departure ?? leg.departure,
      toPlatform: alighted?.platform ?? leg.toPlatform,
      arrival: alighted?.arrival ?? leg.arrival,
    };
  });
}

/**
 * Brings the log up to date with a vehicle the traveller rode earlier on the
 * trip, looked up again. Entur records when a vehicle was at a stop only after
 * it has been there, and keeps it only while the vehicle is under way.
 */
export function observeVehicle(log: TripLog, vehicle: FollowedVehicle): TripLog {
  return { ...log, legs: withTimes(log.legs, vehicle) };
}

/**
 * Takes in what the app shows at one moment. A vehicle other than the one the
 * log has the traveller on is a change of vehicle: where they got off is what
 * the app was told, otherwise where a card had this change made, otherwise the
 * stop the two vehicles share. However the app came to know of the change,
 * the log reads it from the plan.
 *
 * While the traveller stays on a vehicle, or waits where they got off it, the
 * change the active plan told to make next is lost when no trip makes it any more.
 */
export function observe(log: TripLog, plan: OnBoardPlan): TripLog {
  const { vehicle, at } = plan;
  if (!vehicle || log.finishedAt) return log;

  let legs = log.legs;
  let changes = log.changes;
  const lost = { ...log.lost };
  const events = [...log.events];
  const current = legs[legs.length - 1];

  const shownNow = new Map<string, SeenChange>();
  for (const card of plan.trips) {
    for (const trip of [card, ...card.alternatives]) {
      for (const [key, change] of changesOf(trip, at)) shownNow.set(key, change);
    }
  }

  if (current && !sameVehicle(current, vehicle) && isTwin(current, vehicle)) {
    // Entur lists the departure twice, and the app now follows the journey that reports. It is the same vehicle.
    const renamed = { ...current, serviceJourneyId: vehicle.serviceJourneyId, date: vehicle.date };
    legs = [...legs.slice(0, -1), renamed];
  } else if (!current || !sameVehicle(current, vehicle)) {
    const boarded: LoggedLeg = {
      serviceJourneyId: vehicle.serviceJourneyId,
      date: vehicle.date,
      line: vehicle.line,
      mode: vehicle.mode,
      destination: vehicle.destination,
      from: vehicle.boarding?.stop ?? null,
      fromPlatform: vehicle.boarding?.platform ?? null,
      departure: vehicle.boarding?.departure ?? null,
      to: null,
      toPlatform: null,
      arrival: null,
    };

    if (current) {
      const shown = Object.values(log.seen).filter(
        (change) =>
          sameVehicle(change.from, current) &&
          sameVehicle(change.to, vehicle) &&
          (!boarded.from || change.to.stop.id === boarded.from.id) &&
          (!current.to || change.from.stop.id === current.to.id),
      );
      const seen = shown.sort((a, b) => ms(b.last.at) - ms(a.last.at))[0] ?? null;
      const recommended = changeFrom(log.top, current, log.seen);
      const asRecommended = log.top ? recommended !== null && recommended === seen : null;

      const alighted = current.to
        ? null
        : (routeStop(log.vehicle, seen?.from.stop.id) ?? routeStop(log.vehicle, boarded.from?.id));
      const left: LoggedLeg = alighted
        ? { ...current, to: alighted.stop, toPlatform: alighted.platform, arrival: alighted.arrival }
        : current;

      legs = [...legs.slice(0, -1), left];
      changes = [...changes, { at, seen, asRecommended }];
      // A change that was given up and then made after all was not lost. That goes for one whose vehicle was
      // gone from the plan because it had left with the traveller on it.
      const givenUp = seen && lost[keyOf(seen)];
      if (seen && givenUp) {
        delete lost[keyOf(seen)];
        const told = events.findIndex(
          (event) => event.kind === 'lost' && event.at === givenUp.at && event.stop.id === givenUp.to.stop.id && event.line === givenUp.to.line,
        );
        if (told >= 0) events.splice(told, 1);
      }
      events.push({
        kind: 'changed',
        at,
        line: vehicle.line,
        destination: vehicle.destination,
        stop: boarded.from,
        asRecommended,
      });
    } else {
      events.push({ kind: 'boarded', at, line: vehicle.line, destination: vehicle.destination, stop: boarded.from });
    }
    legs = [...legs, boarded];
  } else {
    // Still on the same vehicle, or waiting where the traveller got off it. The change the active plan told to make
    // next is lost when no trip makes it any more though the traveller can still get off where it was to be made.
    const next = changeFrom(log.top, vehicle, log.seen);
    if (
      next &&
      !shownNow.has(keyOf(next)) &&
      !lost[keyOf(next)] &&
      vehicle.stops.some((stop) => stop.stop.id === next.from.stop.id)
    ) {
      lost[keyOf(next)] = { ...next, at };
      events.push({ kind: 'lost', at, line: next.to.line, stop: next.to.stop, marginSeconds: next.last.marginSeconds });
    }
  }

  // The traveller has got off and waits: the leg ends there.
  const riding = legs[legs.length - 1];
  if (vehicle.gotOff && riding.to?.id !== vehicle.gotOff.stop.id) {
    legs = [...legs.slice(0, -1), { ...riding, to: vehicle.gotOff.stop }];
    events.push({ kind: 'gotOff', at, line: vehicle.line, stop: vehicle.gotOff.stop });
  }
  legs = withTimes(legs, vehicle);

  const seen = { ...log.seen };
  for (const [key, change] of shownNow) seen[key] = seen[key] ? { ...change, first: seen[key].first } : change;

  const top: PlannedTrip | null = plan.activePlan;
  const estimate = top ? { at, arrival: top.arrival, tripId: top.id } : log.estimate;
  if (top && top.id !== log.estimate?.tripId) {
    events.push({
      kind: 'recommendation',
      at,
      tripId: top.id,
      arrival: top.arrival,
      lines: rideRows(top).map((row) => row.line),
    });
  }

  return {
    ...log,
    planAtStart: log.planAtStart ?? (top && { at, trip: top }),
    firstEstimate: log.firstEstimate ?? estimate,
    estimate,
    legs,
    changes,
    lost,
    seen,
    vehicle,
    top,
    events,
  };
}

/** Takes in an answer to one of the app's questions, as something that happened on the trip. */
export function logAnswer(log: TripLog, { question, yes, source, at }: Answer): TripLog {
  const event: LogEvent =
    question.kind === 'gotOff'
      ? { kind: 'answer', at, question: 'gotOff', stop: question.stop, line: null, yes, source }
      : { kind: 'answer', at, question: 'boarded', stop: question.vehicle.stop, line: question.vehicle.line, yes, source };
  return { ...log, events: [...log.events, event] };
}

/**
 * Ends the log: the traveller is there. Where they got off the last vehicle is
 * what is given, otherwise where they had got off, otherwise where the top
 * trip ended when it had no more changes to make. The walk from there to the
 * address is taken from that trip.
 */
export function finishLog(log: TripLog, at: Date, alightedAt?: string): TripLog {
  if (log.finishedAt) return log;
  const last = log.legs[log.legs.length - 1];
  const rides = log.top ? rideRows(log.top) : [];
  const ridesToTheEnd = last !== undefined && rides.length === 1 && sameVehicle(rides[0], last);

  let legs = log.legs;
  let stop: StopRef | null = last?.to ?? null;
  if (last && (alightedAt || !last.to)) {
    const alighted = routeStop(log.vehicle, alightedAt ?? (ridesToTheEnd ? rides[0].to.id : undefined));
    if (alighted) {
      stop = alighted.stop;
      legs = [...legs.slice(0, -1), { ...last, to: alighted.stop, toPlatform: alighted.platform, arrival: alighted.arrival }];
    }
  }

  const walks = log.top?.rows.flatMap((row) => (row.kind === 'walk' && row.position === 'end' ? [row.seconds] : [])) ?? [];
  const walked = ridesToTheEnd && stop?.id === rides[0].to.id && walks.length > 0;

  return {
    ...log,
    finishedAt: at.toISOString(),
    legs,
    walkSecondsAfter: walked ? walks.reduce((sum, seconds) => sum + seconds, 0) : null,
    events: [...log.events, { kind: 'arrived', at: at.toISOString(), stop }],
  };
}

/** A time of the report: the timetable against what was measured. */
export interface ReportTime extends MeasuredTime {
  /** How much later than the timetable the vehicle actually was, in seconds. Null until Entur has measured it. */
  lateSeconds: number | null;
}

export interface ReportLeg {
  line: string;
  mode: string;
  destination: string;
  from: StopRef | null;
  fromPlatform: string | null;
  departure: ReportTime | null;
  to: StopRef | null;
  toPlatform: string | null;
  arrival: ReportTime | null;
}

export interface ReportTransfer {
  /**
   * True when the traveller made the change. False for a change the active plan
   * told to make next that was lost before they could.
   */
  made: boolean;
  /** When the change was made, or was lost. */
  at: string;
  /** The line changed to, or that should have been. */
  line: string;
  /** Where the traveller got off, and where the next vehicle left from. */
  from: StopRef | null;
  to: StopRef | null;
  toPlatform: string | null;
  /** The walking time the app counted on. Null when the app never showed the change. */
  walkSeconds: number | null;
  /** The transfer time the app showed the first time, and the last time before the change. */
  firstForecast: Forecast | null;
  lastForecast: Forecast | null;
  /**
   * How it went: from when the vehicle actually arrived to when the next
   * actually left, less the walk. Null until both are measured, and for a
   * change that was not made.
   */
  actualMarginSeconds: number | null;
  actualStatus: MarginStatus | null;
  /** Whether it is the change the active plan told to make at the last look before it. Null when there was no plan. */
  asRecommended: boolean | null;
  /** The transfer time the plan at the start had for this change. Null when that plan did not make it. */
  planMarginSeconds: number | null;
}

/** One vehicle of the plan as it stood when the traveller boarded. */
export interface PlanLeg extends VehicleRef {
  line: string;
  from: StopRef;
  to: StopRef;
  /** Entur's forecasts when the plan was made. */
  departure: string;
  arrival: string;
  /** Whether the traveller rode this vehicle. */
  ridden: boolean;
}

/** One change of the plan as it stood when the traveller boarded. */
export interface PlanTransfer {
  /** The line changed to. */
  line: string;
  from: StopRef;
  to: StopRef;
  toPlatform: string | null;
  marginSeconds: number;
  walkSeconds: number;
  /** Whether the traveller made this change. */
  made: boolean;
}

/** The plan as it stood when the traveller boarded, held up against what happened. */
export interface PlanReport {
  at: string;
  /** When the plan had the traveller there, door to door. */
  arrival: string;
  legs: PlanLeg[];
  transfers: PlanTransfer[];
  /** True when the traveller rode the vehicles of the plan, all of them and no others. */
  followed: boolean;
}

/** What a trip report is made of. */
export interface TripReport {
  tripType: TripTypeId;
  startedAt: string;
  finishedAt: string | null;
  /** The plan as it stood when the traveller boarded. Null when the app had no plan then. */
  plan: PlanReport | null;
  arrival: {
    /** What the app first said, door to door: the arrival of the plan at the start. */
    firstEstimate: Estimate | null;
    /** What the app last said. */
    lastEstimate: Estimate | null;
    /** The last vehicle at the stop where the traveller got off. */
    atLastStop: ReportTime | null;
    walkSecondsAfter: number | null;
    /**
     * When the traveller was there door to door: the last vehicle's arrival,
     * measured or else as last forecast, with the walk after it.
     */
    atDoor: string | null;
    /** Whether the last vehicle's arrival is measured. */
    measured: boolean;
    /** How much later than the first estimate, in seconds. */
    lateSeconds: number | null;
  };
  legs: ReportLeg[];
  transfers: ReportTransfer[];
  events: LogEvent[];
}

function reportTime(time: MeasuredTime | null): ReportTime | null {
  return time && { ...time, lateSeconds: time.actual ? (ms(time.actual) - ms(time.aimed)) / 1000 : null };
}

/**
 * The trip report as data: the plan as it stood when the traveller boarded,
 * the timetable against the measured time for every vehicle, the transfer time
 * the app showed against how it went for every change, and the arrival against
 * the app's first estimate. A time Entur has
 * not measured is left out rather than guessed.
 */
export function tripReport(log: TripLog): TripReport {
  const legs = log.legs.map((leg) => ({
    line: leg.line,
    mode: leg.mode,
    destination: leg.destination,
    from: leg.from,
    fromPlatform: leg.fromPlatform,
    departure: reportTime(leg.departure),
    to: leg.to,
    toPlatform: leg.toPlatform,
    arrival: reportTime(leg.arrival),
  }));

  // The changes of the plan at the start, by the two vehicles and stops.
  const planChanges = new Map(log.planAtStart ? changesOf(log.planAtStart.trip, log.planAtStart.at) : []);
  const madeKeys = new Set(log.changes.flatMap((change) => (change.seen ? [keyOf(change.seen)] : [])));
  const planRides = log.planAtStart ? rideRows(log.planAtStart.trip) : [];
  const plan: PlanReport | null = log.planAtStart && {
    at: log.planAtStart.at,
    arrival: log.planAtStart.trip.arrival,
    legs: planRides.map((row) => ({
      serviceJourneyId: row.serviceJourneyId,
      date: row.date,
      line: row.line,
      from: row.from,
      to: row.to,
      departure: row.departure.expected,
      arrival: row.arrival.expected,
      ridden: log.legs.some((leg) => sameVehicle(leg, row)),
    })),
    transfers: [...planChanges].map(([key, change]) => ({
      line: change.to.line,
      from: change.from.stop,
      to: change.to.stop,
      toPlatform: change.to.platform,
      marginSeconds: change.first.marginSeconds,
      walkSeconds: change.walkSeconds,
      made: madeKeys.has(key),
    })),
    followed:
      planRides.length === log.legs.length && planRides.every((row, index) => sameVehicle(row, log.legs[index])),
  };

  const made = log.changes.map((change, index): ReportTransfer => {
    const left = log.legs[index];
    const boarded = log.legs[index + 1];
    const arrived = left.arrival?.actual;
    const departed = boarded.departure?.actual;
    const walkSeconds = change.seen?.walkSeconds ?? null;
    const actualMarginSeconds =
      arrived && departed && walkSeconds !== null ? (ms(departed) - ms(arrived)) / 1000 - walkSeconds : null;
    return {
      made: true,
      at: change.at,
      line: boarded.line,
      from: left.to,
      to: boarded.from,
      toPlatform: boarded.fromPlatform,
      walkSeconds,
      firstForecast: change.seen?.first ?? null,
      lastForecast: change.seen?.last ?? null,
      actualMarginSeconds,
      actualStatus: actualMarginSeconds === null ? null : marginStatus(actualMarginSeconds),
      asRecommended: change.asRecommended,
      planMarginSeconds: change.seen ? (planChanges.get(keyOf(change.seen))?.first.marginSeconds ?? null) : null,
    };
  });
  const lost = Object.values(log.lost).map(
    (change): ReportTransfer => ({
      made: false,
      at: change.at,
      line: change.to.line,
      from: change.from.stop,
      to: change.to.stop,
      toPlatform: change.to.platform,
      walkSeconds: change.walkSeconds,
      firstForecast: change.first,
      lastForecast: change.last,
      actualMarginSeconds: null,
      actualStatus: null,
      asRecommended: true,
      planMarginSeconds: planChanges.get(keyOf(change))?.first.marginSeconds ?? null,
    }),
  );
  const transfers = [...lost, ...made].sort((a, b) => ms(a.at) - ms(b.at));

  const last = log.legs[log.legs.length - 1];
  const atLastStop = log.finishedAt && last?.to ? reportTime(last.arrival) : null;
  const atDoor = atLastStop
    ? new Date(ms(atLastStop.actual ?? atLastStop.expected) + (log.walkSecondsAfter ?? 0) * 1000).toISOString()
    : null;

  return {
    tripType: log.tripType,
    startedAt: log.startedAt,
    finishedAt: log.finishedAt,
    plan,
    arrival: {
      firstEstimate: log.firstEstimate,
      lastEstimate: log.estimate,
      atLastStop,
      walkSecondsAfter: log.walkSecondsAfter,
      atDoor,
      measured: Boolean(atLastStop?.actual),
      lateSeconds: atDoor && log.firstEstimate ? (ms(atDoor) - ms(log.firstEstimate.arrival)) / 1000 : null,
    },
    legs,
    transfers,
    events: log.events,
  };
}
