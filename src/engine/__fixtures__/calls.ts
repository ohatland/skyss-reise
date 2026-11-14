import type { StopCall } from '@/entur/calls';
import type { Leg, StopRef, TransferWalk } from '@/model/types';

/** A Monday in winter time. */
export const DAY = '2026-11-16';

/** "07:09" or "07:09:30" on a day, as Entur writes it. */
export const at = (clock: string, day = DAY) => `${day}T${clock.length === 5 ? `${clock}:00` : clock}+01:00`;

export const stop = (name: string): StopRef => ({ id: `stop:${name}`, name });

export const quayId = (at: StopRef, platform?: string) => `quay:${at.name}${platform ? `:${platform}` : ''}`;

/** What differs from a plain, punctual call at a stop. */
export interface VisitOptions extends Omit<Partial<StopCall>, 'platform'> {
  /** Forecast clock where it differs from the timetable. */
  expected?: string;
  /** Platform letter; the stop then has one quay per letter. */
  platform?: string;
  /** The day of this call, where the journey has passed midnight. */
  day?: string;
}

export type Visit = [stop: StopRef, clock: string, options?: VisitOptions];

/**
 * The calls of one vehicle at the stops it visits, in order. Arrival and
 * departure are the same moment. The vehicle has started and has real-time data
 * unless the options say otherwise.
 */
export function journey(
  id: string,
  line: string,
  visits: Visit[],
  options: Partial<StopCall> & { day?: string } = {},
): StopCall[] {
  const { day = DAY, ...shared } = options;
  return visits.map(([visited, clock, visit = {}], position) => {
    const { expected, platform, day: visitDay = day, ...rest } = visit;
    const aimed = at(clock, visitDay);
    const forecast = at(expected ?? clock, visitDay);
    return {
      stopPlaceId: visited.id,
      quayId: quayId(visited, platform),
      platform: platform ?? null,
      serviceJourneyId: `journey:${id}`,
      date: day,
      line,
      transportMode: 'bus',
      destination: visits[visits.length - 1][0].name,
      position,
      aimedArrival: aimed,
      expectedArrival: forecast,
      aimedDeparture: aimed,
      expectedDeparture: forecast,
      realtime: true,
      cancelled: false,
      predictionInaccurate: false,
      forBoarding: true,
      forAlighting: true,
      started: true,
      typicalDelay: null,
      ...shared,
      ...rest,
    };
  });
}

export const ride = (lines: string, from: StopRef, to: StopRef, mode = 'bus'): Leg => ({
  kind: 'transit',
  from,
  to,
  lines: lines.split(', '),
  mode,
});

export const walk = (from: StopRef, to: StopRef, seconds?: number): Leg => ({ kind: 'walk', from, to, seconds });

/** Entur's walking time between two platforms, as a mapping run saves it. */
export function transferWalk(
  from: StopRef,
  fromPlatform: string | undefined,
  to: StopRef,
  toPlatform: string | undefined,
  seconds: number,
): TransferWalk {
  const fromQuay = quayId(from, fromPlatform);
  const toQuay = quayId(to, toPlatform);
  return {
    key: `${fromQuay}>${toQuay}`,
    from: { id: fromQuay, platform: fromPlatform ?? null, stop: from },
    to: { id: toQuay, platform: toPlatform ?? null, stop: to },
    fromLines: [],
    toLines: [],
    seconds,
  };
}
