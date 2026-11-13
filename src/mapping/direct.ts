import { osloIso } from '@/core/oslo-time';
import { sortLines, toPattern } from '@/mapping/pattern';
import type { TripPatternResponse, TripSearchParams } from '@/mapping/query';
import type { Place, StopRef, TransitLeg } from '@/model/types';

type Search = (params: TripSearchParams) => Promise<TripPatternResponse[]>;

export interface DirectDeps {
  search: Search;
  /** Norwegian calendar date to search, YYYY-MM-DD. */
  date: string;
}

/** Morning, midday and afternoon, so that lines running only part of the day are found. */
const SAMPLE_TIMES = ['07:00', '12:00', '16:00'];

const asPlace = (stop: StopRef): Place => ({ id: stop.id, name: stop.name, stopPlaceId: stop.id });

/**
 * The direct ride between two stops, with every line that makes it, or null when
 * there is none. The stops in the result are the ones Entur uses in trips, which
 * can differ from the ones searched for where a terminal has several stop places.
 *
 * The search is an ordinary one, filtered afterwards. Asking Entur for at most
 * zero transfers does not work: it then answers with walking the whole way.
 */
export async function findDirectLeg(from: StopRef, to: StopRef, deps: DirectDeps): Promise<TransitLeg | null> {
  const origin = asPlace(from);
  const destination = asPlace(to);

  const answers = await Promise.all(
    SAMPLE_TIMES.map((time) =>
      deps
        .search({ from: origin, to: destination, dateTime: osloIso(deps.date, time) })
        .catch(() => [] as TripPatternResponse[]),
    ),
  );

  const rides = new Map<string, TransitLeg[]>();
  for (const trip of answers.flat()) {
    const legs = toPattern(trip, origin, destination)?.legs ?? [];
    if (legs.length !== 1 || legs[0].kind !== 'transit') continue;
    const key = `${legs[0].from.id}>${legs[0].to.id}`;
    rides.set(key, [...(rides.get(key) ?? []), legs[0]]);
  }
  if (rides.size === 0) return null;

  const [mostCommon] = [...rides.values()].sort((a, b) => b.length - a.length);
  return { ...mostCommon[0], lines: sortLines(mostCommon.flatMap((leg) => leg.lines)) };
}

/** Entur's walking time between two places in seconds, or null when it finds no way on foot. */
export async function findWalkSeconds(from: Place, to: Place, deps: DirectDeps): Promise<number | null> {
  const trips = await deps.search({ from, to, dateTime: osloIso(deps.date, '12:00'), onFoot: true });
  return trips.length ? trips[0].duration : null;
}
