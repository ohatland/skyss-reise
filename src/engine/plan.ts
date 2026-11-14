import type { EnturQueryOptions } from '@/entur/client';
import { fetchLineIds, fetchStopCalls, type StopCall } from '@/entur/calls';
import { tripPaths, type TripPath } from '@/engine/paths';
import { groupCallsByStop, ridesOnLeg, type Ride } from '@/engine/rides';
import { PLAN_MIN_MARGIN_SECONDS } from '@/core/transfer';
import { NO_TRANSFERS, transfersOf, transfersThatMayBeCaught, type TransferMemory } from '@/engine/transfers';
import {
  cardsBestFirst,
  hideBeaten,
  holdsWithMargin,
  rankTrips,
  tripsOnPaths,
  walkLookup,
  type CardSelection,
  type TripCard,
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
   * The cards to show: one per last vehicle before the way to the address.
   * The best one is on top: there first among the trips where every transfer
   * has at least a minute. The rest follow by when the traveller is there.
   */
  trips: TripCard[];
  /** The cards another card beats by starting no earlier and arriving no later. For "show more". */
  hidden: TripCard[];
  /** What to remember for the next plan of this trip type, so that cards do not come and go. */
  memory: TransferMemory;
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

/** The rides on a leg among the calls. A leg is ridden in many paths; its rides are worked out once. */
export function ridesLookup(calls: StopCall[]): (leg: TransitLeg) => Ride[] {
  const byStop = groupCallsByStop(calls);
  const rides = new Map<string, Ride[]>();
  return (leg) => {
    const key = `${walkKey(leg.from, leg.to)}|${leg.lines.join(',')}`;
    let found = rides.get(key);
    if (!found) {
      found = ridesOnLeg(leg, byStop);
      rides.set(key, found);
    }
    return found;
  };
}

/**
 * The trips that can be made with the given paths and calls, as cards: those
 * to show, the best one first, and those another card beats. A pure function
 * of its input: every time in the result is one of Entur's, or one of them
 * with a walking time added or subtracted.
 *
 * A card stays though a transfer of it has little or nothing to spare, or is
 * forecast as missed by up to three minutes, or by up to one where the transfer
 * has not been shown before. It goes when the transfer is missed by more than that,
 * and with `memory` from the last plan it does not come back until the
 * forecast says the transfer is caught. For every departure there
 * is also the trip onward where each transfer has at least a minute, so that
 * the best trip is among the cards.
 */
export function planFromCalls(
  paths: TripPath[],
  calls: StopCall[],
  routes: Pick<SavedRoutes, 'transferWalks' | 'walkOverrides'>,
  now: Date,
  memory: TransferMemory | null = null,
): CardSelection & { memory: TransferMemory } {
  const walks = walkLookup(routes);
  const rides = ridesLookup(calls);
  const transfers = transfersThatMayBeCaught(memory ?? NO_TRANSFERS);

  const ranked = rankTrips([
    ...tripsOnPaths(paths, rides, walks, now, { allowTransfer: transfers.allow }),
    ...tripsOnPaths(paths, rides, walks, now, { minMarginSeconds: PLAN_MIN_MARGIN_SECONDS }),
  ]);
  const cards = cardsBestFirst(ranked);
  const best = cards[0] && holdsWithMargin(cards[0]) ? cards[0] : undefined;

  return {
    ...hideBeaten(cards, best),
    memory: { seen: [...new Set(ranked.flatMap(transfersOf))], removed: transfers.removed() },
  };
}

export interface PlanDeps {
  /** The saved routes. Read from storage unless given. */
  routes?: SavedRoutes;
  entur?: EnturQueryOptions;
  /** What the last plan of the trip type left to remember. */
  memory?: TransferMemory | null;
}

const lineIds = new Map<string, Promise<string[]>>();

/** Entur's ids for a set of line codes. They change with the timetable at most, so they are looked up once per set. */
export function lineIdsFor(lines: string[], options: EnturQueryOptions): Promise<string[]> {
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
 * vehicle before the way to the address, the best one on top and the rest by
 * when they are there, with the cards another card beats set aside. Combines
 * the saved alternatives into every way through, fetches the calls of the
 * lines and stops involved from Entur in one request, and puts together the
 * departures that connect. With `memory` from the last plan, a card that was
 * given up does not come back while its transfer is still forecast as missed.
 * Throws when Entur cannot be reached.
 */
export async function planTrips(tripType: TripTypeId, now: Date = new Date(), deps: PlanDeps = {}): Promise<TripPlan> {
  const started = Date.now();
  const routes = deps.routes ?? (await loadRoutes());
  const paths = tripPaths(routes, tripType);
  const { stopPlaceIds, lines } = callsNeeded(paths);

  const ids = await lineIdsFor(lines, deps.entur ?? {});
  const calls = await fetchStopCalls(stopPlaceIds, ids, now, deps.entur);
  const { shown, hidden, memory } = planFromCalls(paths, calls, routes, now, deps.memory);

  log.event('trips_planned', {
    tripType,
    paths: paths.length,
    stops: stopPlaceIds.length,
    calls: calls.length,
    cards: shown.length,
    hidden: hidden.length,
    givenUp: memory.removed.length,
    trips: [...shown, ...hidden].reduce((sum, card) => sum + 1 + card.alternatives.length, 0),
    ms: Date.now() - started,
  });
  return { tripType, at: now.toISOString(), trips: shown, hidden, memory };
}
