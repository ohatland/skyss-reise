import type { EnturQueryOptions } from '@/entur/client';
import { fetchLineIds, fetchStopCalls, type StopCall } from '@/entur/calls';
import { tripPaths, type TripPath } from '@/engine/paths';
import { groupCallsByStop, ridesOnLeg, type Ride } from '@/engine/rides';
import {
  cardsOf,
  hideBeaten,
  rankTrips,
  tripsOnPath,
  walkLookup,
  type CardSelection,
  type TripCard,
  type TripOptions,
} from '@/engine/trips';
import { log } from '@/logging/logger';
import { sortLines } from '@/mapping/pattern';
import { walkKey, type TransitLeg, type TripTypeId } from '@/model/types';
import { loadRoutes, type SavedRoutes } from '@/storage/alternatives';

/** The ranked trips for one trip type at one moment. */
export interface TripPlan {
  tripType: TripTypeId;
  /** The moment the plan is for, ISO 8601. */
  at: string;
  /**
   * The cards to show: one per last vehicle before the way to the address, the
   * one that gets the traveller there first on top.
   */
  trips: TripCard[];
  /** The cards another card beats by starting no earlier and arriving no later. For "show more". */
  hidden: TripCard[];
}

/** The stops and lines the paths ride, which is all that has to be fetched from Entur. */
export function callsNeeded(paths: TripPath[]): { stopPlaceIds: string[]; lines: string[] } {
  const stops = new Set<string>();
  const lines: string[] = [];
  for (const leg of paths.flatMap((path) => path.legs)) {
    if (leg.kind !== 'transit') continue;
    stops.add(leg.from.id);
    stops.add(leg.to.id);
    lines.push(...leg.lines);
  }
  return { stopPlaceIds: [...stops].sort(), lines: sortLines(lines) };
}

/**
 * The trips that can be made with the given paths and calls, as ranked cards:
 * those to show, and those another card beats. A pure function of its input:
 * every time in the result is one of Entur's, or one of them with a walking
 * time added or subtracted.
 */
export function planFromCalls(
  paths: TripPath[],
  calls: StopCall[],
  routes: Pick<SavedRoutes, 'transferWalks' | 'walkOverrides'>,
  now: Date,
  options: TripOptions = {},
): CardSelection {
  const byStop = groupCallsByStop(calls);
  const walks = walkLookup(routes);

  // A leg is ridden in many paths; its rides are worked out once.
  const rides = new Map<string, Ride[]>();
  const ridesFor = (leg: TransitLeg): Ride[] => {
    const key = `${walkKey(leg.from, leg.to)}|${leg.lines.join(',')}`;
    let found = rides.get(key);
    if (!found) {
      found = ridesOnLeg(leg, byStop);
      rides.set(key, found);
    }
    return found;
  };

  return hideBeaten(cardsOf(rankTrips(paths.flatMap((path) => tripsOnPath(path, ridesFor, walks, now, options)))));
}

export interface PlanDeps extends TripOptions {
  /** The saved routes. Read from storage unless given. */
  routes?: SavedRoutes;
  entur?: EnturQueryOptions;
}

/** Entur's ids for a set of line codes change with the timetable at most, so they are looked up once per set. */
const lineIds = new Map<string, Promise<string[]>>();

function lineIdsFor(lines: string[], options: EnturQueryOptions): Promise<string[]> {
  const key = lines.join(',');
  let ids = lineIds.get(key);
  if (!ids) {
    ids = fetchLineIds(lines, options);
    lineIds.set(key, ids);
    // A failed lookup is not remembered, so that the next refresh tries again.
    ids.catch(() => lineIds.delete(key));
  }
  return ids;
}

/**
 * The trips the traveller can make now for one trip type: one card per last
 * vehicle before the way to the address, ranked by when they are there, with
 * the cards another card beats set aside. Combines the saved alternatives into
 * every way through, fetches the calls of the lines and stops involved from
 * Entur in one request, and puts together the departures that connect. A trip
 * with a transfer the forecast says is missed is left out unless
 * `missedGraceSeconds` is given. Throws when Entur cannot be reached.
 */
export async function planTrips(tripType: TripTypeId, now: Date = new Date(), deps: PlanDeps = {}): Promise<TripPlan> {
  const started = Date.now();
  const routes = deps.routes ?? (await loadRoutes());
  const paths = tripPaths(routes, tripType);
  const { stopPlaceIds, lines } = callsNeeded(paths);

  const ids = await lineIdsFor(lines, deps.entur ?? {});
  const calls = await fetchStopCalls(stopPlaceIds, ids, now, deps.entur);
  const { shown, hidden } = planFromCalls(paths, calls, routes, now, deps);

  log.event('trips_planned', {
    tripType,
    paths: paths.length,
    stops: stopPlaceIds.length,
    calls: calls.length,
    cards: shown.length,
    hidden: hidden.length,
    trips: [...shown, ...hidden].reduce((sum, card) => sum + 1 + card.alternatives.length, 0),
    ms: Date.now() - started,
  });
  return { tripType, at: now.toISOString(), trips: shown, hidden };
}
