import { chainKey } from '@/mapping/pattern';
import { buildNetwork, findPaths } from '@/model/network';
import { TRIP_TYPES } from '@/model/places';
import { placeRef, placeSide, walkKey, type Leg, type TripTypeId } from '@/model/types';
import type { SavedRoutes } from '@/storage/alternatives';

/** Most vehicles in one trip, counting those on the way between the address and the first or last stop. */
export const MAX_VEHICLES = 5;

const vehiclesIn = (legs: Leg[]) => legs.filter((leg) => leg.kind === 'transit').length;

/** One way of making a trip door to door. */
export interface TripPath {
  legs: Leg[];
  /**
   * How many of the last legs are the way from a stop near the address to the
   * address itself. Which of those ways to take is for the app to choose, so
   * trips that differ only there belong together. None where the trip starts
   * at the address or ends at a stop.
   */
  legsToAddress: number;
}

/** True when the legs never come back to a stop or place they have been at. */
function visitsEachStopOnce(legs: Leg[]): boolean {
  const seen = new Set<string>();
  let at: string | null = null;
  for (const leg of legs) {
    // Where the next leg starts at another stop of the same terminal, that stop is visited too.
    for (const id of leg.from.id === at ? [leg.to.id] : [leg.from.id, leg.to.id]) {
      if (seen.has(id)) return false;
      seen.add(id);
    }
    at = leg.to.id;
  }
  return true;
}

/**
 * Every way of making a trip door to door with what is saved: the legs of the
 * saved alternatives combined freely where they meet, joined with each way
 * between the address and a stop near it. Legs meet at a stop, or at two stops
 * of one terminal that a mapping run or a saved alternative changes between.
 * A trip has at most five vehicles and never passes the same stop twice.
 */
export function tripPaths(
  routes: Pick<SavedRoutes, 'alternatives' | 'connections' | 'transferWalks'>,
  tripTypeId: TripTypeId,
): TripPath[] {
  const tripType = TRIP_TYPES[tripTypeId];
  const side = placeSide(tripType);
  const from = placeRef(tripType.from);
  const to = placeRef(tripType.to);

  const chains = routes.alternatives.filter((a) => a.tripType === tripTypeId).map((a) => a.legs);
  const network = buildNetwork(chains, routes.transferWalks);
  // A saved chain whose next leg starts at another stop of the same terminal says that the change can be made.
  for (const legs of chains) {
    legs.slice(1).forEach((leg, index) => {
      if (leg.from.id !== legs[index].to.id) network.links.add(walkKey(legs[index].to, leg.from));
    });
  }

  const paths: TripPath[] = [];
  if (side === null) {
    for (const legs of findPaths(network, [from], to, { maxVehicles: MAX_VEHICLES })) {
      paths.push({ legs, legsToAddress: 0 });
    }
  } else {
    for (const connection of routes.connections) {
      if (connection.tripType !== tripTypeId) continue;
      const maxVehicles = MAX_VEHICLES - vehiclesIn(connection.legs);
      if (maxVehicles < 1) continue;
      if (side === 'start') {
        for (const trunk of findPaths(network, [connection.anchor], to, { maxVehicles })) {
          paths.push({ legs: [...connection.legs, ...trunk], legsToAddress: 0 });
        }
      } else {
        for (const trunk of findPaths(network, [from], connection.anchor, { maxVehicles })) {
          paths.push({ legs: [...trunk, ...connection.legs], legsToAddress: connection.legs.length });
        }
      }
    }
  }

  const byKey = new Map<string, TripPath>();
  for (const path of paths) {
    const key = chainKey(path.legs);
    if (!byKey.has(key) && visitsEachStopOnce(path.legs)) byKey.set(key, path);
  }
  return [...byKey.values()];
}
