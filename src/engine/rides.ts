import type { StopCall, TypicalDelay } from '@/entur/calls';
import type { StopRef, TransitLeg } from '@/model/types';

/** One end of a ride: where and when the traveller boards or gets off. */
export interface RideEnd {
  stop: StopRef;
  quayId: string;
  /** Platform letter where the stop has one, otherwise null. */
  platform: string | null;
  /** Timetable, ISO 8601 with offset. */
  aimed: string;
  /** Entur's forecast, equal to the timetable when it has nothing better. */
  expected: string;
  realtime: boolean;
  typicalDelay: TypicalDelay | null;
}

/** One vehicle over one leg: a departure from the leg's first stop that reaches its second. */
export interface Ride {
  serviceJourneyId: string;
  /** Service date of the journey. With the journey id it identifies the vehicle. */
  date: string;
  line: string;
  mode: string;
  destination: string;
  boarding: RideEnd;
  alighting: RideEnd;
  /** True once the vehicle has left the first stop of its journey. */
  started: boolean;
  predictionInaccurate: boolean;
}

/**
 * True when Entur's forecast for the ride is a real one: the vehicle is under
 * way on this journey and reports. Entur sets its real-time flag hours ahead,
 * on journeys that have not started, and the forecast is then not measured.
 */
export function isLive(ride: Ride): boolean {
  return ride.started && ride.boarding.realtime;
}

/** The light rail and the boats keep their timetable. Entur has no real-time data for the light rail, and none is needed. */
const PRECISE_MODES = new Set(['tram', 'water']);

/** True for light rail and boat, whose timetable is taken as exact where there is no live forecast. */
export function keepsTimetable(mode: string): boolean {
  return PRECISE_MODES.has(mode);
}

/** True when the ride has no live forecast but runs so regularly that the timetable is taken as exact. */
export function isPrecise(ride: Ride): boolean {
  return !isLive(ride) && keepsTimetable(ride.mode);
}

/** The calls fetched from Entur, by the stop place they are at. */
export type CallsByStop = Map<string, StopCall[]>;

export function groupCallsByStop(calls: StopCall[]): CallsByStop {
  const byStop: CallsByStop = new Map();
  for (const call of calls) {
    const atStop = byStop.get(call.stopPlaceId);
    if (atStop) atStop.push(call);
    else byStop.set(call.stopPlaceId, [call]);
  }
  return byStop;
}

const journeyKey = (call: StopCall) => `${call.serviceJourneyId}|${call.date}`;
const ms = (time: string) => new Date(time).getTime();

interface Pair {
  boarding: StopCall;
  alighting: StopCall;
}

/**
 * How well a journey is known to be the one the vehicle reports as: under way,
 * then flagged by Entur as having real-time data, then neither.
 */
function reporting({ boarding }: Pair): number {
  if (boarding.started) return 2;
  return boarding.realtime ? 1 : 0;
}

function toRide({ boarding, alighting }: Pair, leg: TransitLeg): Ride {
  return {
    serviceJourneyId: boarding.serviceJourneyId,
    date: boarding.date,
    line: boarding.line,
    mode: boarding.transportMode,
    destination: boarding.destination,
    boarding: {
      stop: leg.from,
      quayId: boarding.quayId,
      platform: boarding.platform,
      aimed: boarding.aimedDeparture,
      expected: boarding.expectedDeparture,
      realtime: boarding.realtime,
      typicalDelay: boarding.typicalDelay,
    },
    alighting: {
      stop: leg.to,
      quayId: alighting.quayId,
      platform: alighting.platform,
      aimed: alighting.aimedArrival,
      expected: alighting.expectedArrival,
      realtime: alighting.realtime,
      typicalDelay: alighting.typicalDelay,
    },
    started: boarding.started,
    predictionInaccurate: boarding.predictionInaccurate || alighting.predictionInaccurate,
  };
}

/**
 * The rides on a leg, earliest departure first: every departure of one of the
 * leg's lines from its first stop, paired with the same vehicle's next arrival
 * at its second stop. A vehicle going the other way never arrives there
 * afterwards and so drops out. Cancelled calls, and calls where boarding or
 * alighting is not allowed, give no ride.
 *
 * Entur at times lists the same timetabled departure as two journeys, of which
 * only one reports once the vehicle is under way. The other stays on the
 * timetable however late the vehicle is, with Entur's real-time flag still
 * set. Of two rides with the same line, platforms and timetable only one is
 * kept: the one that is under way, otherwise the one with real-time data.
 */
export function ridesOnLeg(leg: TransitLeg, calls: CallsByStop): Ride[] {
  const lines = new Set(leg.lines);

  const arrivals = new Map<string, StopCall[]>();
  for (const call of calls.get(leg.to.id) ?? []) {
    if (!call.forAlighting || call.cancelled) continue;
    const key = journeyKey(call);
    arrivals.set(key, [...(arrivals.get(key) ?? []), call]);
  }

  // A vehicle that passes the first stop twice before the second is boarded the last time it passes.
  const byArrival = new Map<string, Pair>();
  for (const boarding of calls.get(leg.from.id) ?? []) {
    if (!lines.has(boarding.line) || !boarding.forBoarding || boarding.cancelled) continue;
    const later = (arrivals.get(journeyKey(boarding)) ?? []).filter((call) => call.position > boarding.position);
    if (later.length === 0) continue;
    const alighting = later.reduce((first, call) => (call.position < first.position ? call : first));
    const key = `${journeyKey(boarding)}|${alighting.position}`;
    const known = byArrival.get(key);
    if (!known || boarding.position > known.boarding.position) byArrival.set(key, { boarding, alighting });
  }

  const byTimetable = new Map<string, Pair>();
  for (const pair of byArrival.values()) {
    const { boarding, alighting } = pair;
    const key = [
      boarding.line,
      boarding.quayId,
      ms(boarding.aimedDeparture),
      alighting.quayId,
      ms(alighting.aimedArrival),
    ].join('|');
    const known = byTimetable.get(key);
    if (!known || reporting(pair) > reporting(known)) byTimetable.set(key, pair);
  }

  return [...byTimetable.values()]
    .map((pair) => toRide(pair, leg))
    .sort(
      (a, b) =>
        ms(a.boarding.expected) - ms(b.boarding.expected) || ms(a.alighting.expected) - ms(b.alighting.expected),
    );
}
