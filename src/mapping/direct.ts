import { osloIso, timesInWindow } from '@/core/oslo-time';
import { sortLines, toPattern } from '@/mapping/pattern';
import type { TripPatternResponse, TripSearchParams } from '@/mapping/query';
import { walkKey, type Place, type StopRef, type TransitLeg } from '@/model/types';

type Search = (params: TripSearchParams) => Promise<TripPatternResponse[]>;

export interface DirectDeps {
  search: Search;
  /** Norwegian calendar date to search, YYYY-MM-DD. */
  date: string;
}

/**
 * Entur only answers with departures inside the search window, so the search has
 * to cover the whole service day: a line with two departures a day is otherwise
 * found only by luck. Each search looks this far ahead, which is wide enough
 * that the day takes a dozen searches, and narrow enough that the suggestions
 * (Entur answers with at most 25) do not crowd a rare line out.
 */
const SEARCH_WINDOW_MINUTES = 90;
const FIRST_SEARCH = '05:00';
const LAST_SEARCH = '23:00';
const SAMPLE_TIMES = timesInWindow(FIRST_SEARCH, LAST_SEARCH, SEARCH_WINDOW_MINUTES);

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
 * The direct rides between two stops, one per pair of stops that Entur rides
 * between, each with every line that makes it. Empty when Entur answered every
 * search and none has a direct ride. Throws when nothing was found and a search
 * went unanswered, since that search may have been the one to find it.
 *
 * The stops in the result are the ones Entur uses in trips, which can differ from
 * the ones searched for where a terminal has several stop places. They can also
 * differ between lines: a line that stops at the neighbouring stop place, a short
 * walk away, is a ride of its own. Every vehicle is reached through exactly one
 * stop place, so a line is only usable from the stop its ride starts at, and
 * folding it into the ride from the other stop would hide the stop it leaves from.
 * The ride from a stop searched for comes first, then the ones with most departures.
 *
 * The search is an ordinary one, filtered afterwards. Asking Entur for at most
 * zero transfers does not work: it then answers with walking the whole way.
 */
export async function findDirectLegs(from: StopRef, to: StopRef, deps: DirectDeps): Promise<TransitLeg[]> {
  const origin = asPlace(from);
  const destination = asPlace(to);

  const settled = await Promise.allSettled(
    SAMPLE_TIMES.map((time) =>
      deps.search({
        from: origin,
        to: destination,
        dateTime: osloIso(deps.date, time),
        searchWindowMinutes: SEARCH_WINDOW_MINUTES,
      }),
    ),
  );
  const answers = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const failure = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');

  const rides = directRides(answers.flat(), origin, destination);
  if (rides.size === 0) {
    if (failure) throw failure.reason;
    return [];
  }

  const startsAtSearched = (rides: TransitLeg[]) => (rides[0].from.id === from.id ? 0 : 1);
  return [...rides.values()]
    .sort((a, b) => startsAtSearched(a) - startsAtSearched(b) || b.length - a.length)
    .map((group) => ({ ...group[0], lines: sortLines(group.flatMap((leg) => leg.lines)) }));
}

/** Entur's walking time between two places in seconds, or null when it finds no way on foot. */
export async function findWalkSeconds(from: Place, to: Place, deps: DirectDeps): Promise<number | null> {
  const trips = await deps.search({ from, to, dateTime: osloIso(deps.date, '12:00'), onFoot: true });
  return trips.length ? trips[0].duration : null;
}
