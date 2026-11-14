import { osloIso } from '@/core/oslo-time';
import { sortLines, toPattern } from '@/mapping/pattern';
import type { TripPatternResponse, TripSearchParams } from '@/mapping/query';
import { walkKey, type Place, type StopRef, type TransitLeg } from '@/model/types';

type Search = (params: TripSearchParams) => Promise<TripPatternResponse[]>;

export interface DirectDeps {
  search: Search;
  /** Norwegian calendar date to search, YYYY-MM-DD. */
  date: string;
}

/** Morning, midday and afternoon, so that lines running only part of the day are found. */
const SAMPLE_TIMES = ['07:00', '12:00', '16:00'];

export const asPlace = (stop: StopRef): Place => ({ id: stop.id, name: stop.name, stopPlaceId: stop.id });

/** The rides in the answers that go the whole way on one vehicle, by the stops Entur uses for them. */
function directRides(trips: TripPatternResponse[], origin: Place, destination: Place): Map<string, TransitLeg[]> {
  const rides = new Map<string, TransitLeg[]>();
  for (const trip of trips) {
    const legs = toPattern(trip, origin, destination)?.legs ?? [];
    if (legs.length !== 1 || legs[0].kind !== 'transit') continue;
    const key = walkKey(legs[0].from, legs[0].to);
    rides.set(key, [...(rides.get(key) ?? []), legs[0]]);
  }
  return rides;
}

/**
 * The lines in the answers that ride directly between exactly these two stops.
 * A ride from another stop of the same terminal is a different stretch and is left out.
 */
export function linesBetween(trips: TripPatternResponse[], from: StopRef, to: StopRef): string[] {
  const rides = directRides(trips, asPlace(from), asPlace(to)).get(walkKey(from, to)) ?? [];
  return sortLines(rides.flatMap((leg) => leg.lines));
}

/**
 * The direct ride between two stops, with every line that makes it, or null when
 * Entur answered every search and none has one. Throws when nothing was found and
 * a search went unanswered, since that search may have been the one to find it.
 * The stops in the result are the ones Entur uses in trips, which can differ from
 * the ones searched for where a terminal has several stop places.
 *
 * The search is an ordinary one, filtered afterwards. Asking Entur for at most
 * zero transfers does not work: it then answers with walking the whole way.
 */
export async function findDirectLeg(from: StopRef, to: StopRef, deps: DirectDeps): Promise<TransitLeg | null> {
  const origin = asPlace(from);
  const destination = asPlace(to);

  const settled = await Promise.allSettled(
    SAMPLE_TIMES.map((time) => deps.search({ from: origin, to: destination, dateTime: osloIso(deps.date, time) })),
  );
  const answers = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const failure = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');

  const rides = directRides(answers.flat(), origin, destination);
  if (rides.size === 0) {
    if (failure) throw failure.reason;
    return null;
  }

  const [mostCommon] = [...rides.values()].sort((a, b) => b.length - a.length);
  return { ...mostCommon[0], lines: sortLines(mostCommon.flatMap((leg) => leg.lines)) };
}

/** Entur's walking time between two places in seconds, or null when it finds no way on foot. */
export async function findWalkSeconds(from: Place, to: Place, deps: DirectDeps): Promise<number | null> {
  const trips = await deps.search({ from, to, dateTime: osloIso(deps.date, '12:00'), onFoot: true });
  return trips.length ? trips[0].duration : null;
}
