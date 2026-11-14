import { journey, type Visit } from '@/engine/__fixtures__/calls';
import type { StopCall } from '@/entur/calls';
import type { JourneyCall } from '@/entur/journey';

export interface VehicleOptions extends Partial<StopCall> {
  day?: string;
  /** How many of its stops the vehicle has left. Entur has measured it there. */
  left?: number;
  /** The vehicle stands at the stop after those it has left: Entur has measured its arrival only. */
  standing?: boolean;
}

/**
 * Every call of the followed vehicle, as Entur gives them for one journey: the
 * stops it has left have the times it was there, which are also the forecast.
 */
export function vehicle(id: string, line: string, visits: Visit[], options: VehicleOptions = {}): JourneyCall[] {
  const { left = 0, standing = false, ...shared } = options;
  const started = left > 0;
  return journey(id, line, visits, { started, ...shared }).map((call, index) => ({
    ...call,
    stopName: visits[index][0].name,
    actualArrival: index < left || (standing && index === left) ? call.expectedArrival : null,
    actualDeparture: index < left ? call.expectedDeparture : null,
  }));
}

/**
 * A journey as Entur gives it when it lists a departure twice and this is the
 * one that does not report: on the timetable throughout, with the real-time
 * flag set, and with the timetable filled in as the arrival at the stops it
 * should have passed by `now`. Never a departure.
 */
export function silentTwin(calls: JourneyCall[], now: string): JourneyCall[] {
  const moment = new Date(now).getTime();
  return calls.map((call) => ({
    ...call,
    realtime: true,
    started: false,
    expectedArrival: call.aimedArrival,
    expectedDeparture: call.aimedDeparture,
    actualArrival: new Date(call.aimedArrival).getTime() <= moment ? call.aimedArrival : null,
    actualDeparture: null,
  }));
}
