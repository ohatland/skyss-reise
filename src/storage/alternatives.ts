import AsyncStorage from '@react-native-async-storage/async-storage';

import { sortLines } from '@/mapping/pattern';
import { log } from '@/logging/logger';
import type { Alternative, Connection, MappedAlternative, TransferWalk, TripTypeId } from '@/model/types';

const STORAGE_KEY = 'alternatives:v4';

export interface SavedRoutes {
  alternatives: Alternative[];
  /** Ways between the traveller's address and the stops the alternatives start or end at. */
  connections: Connection[];
  /** Entur's walking time at transfers, shared by both trip types. */
  transferWalks: TransferWalk[];
  /** The traveller's own walking times in seconds, by walk key. */
  walkOverrides: Record<string, number>;
}

export const NO_ROUTES: SavedRoutes = {
  alternatives: [],
  connections: [],
  transferWalks: [],
  walkOverrides: {},
};

/** Only what defines the alternative is stored; what a mapping run measured is not. */
export function toAlternative({ key, tripType, legs }: Alternative | MappedAlternative): Alternative {
  return { key, tripType, legs };
}

/** Reads what is saved. Throws when storage cannot be read, so that nothing is written on top of a failed read. */
export async function readRoutes(): Promise<SavedRoutes> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? { ...NO_ROUTES, ...(JSON.parse(stored) as Partial<SavedRoutes>) } : NO_ROUTES;
}

/** Reads what is saved for showing it. A failed read is logged and shows as nothing saved. */
export async function loadRoutes(): Promise<SavedRoutes> {
  try {
    return await readRoutes();
  } catch (error) {
    log.error(error, { where: 'loadRoutes' });
    return NO_ROUTES;
  }
}

let pending: Promise<unknown> = Promise.resolve();

/**
 * Reads, changes and writes the saved routes, one change at a time, so that two
 * quick changes do not both start from the same saved state.
 */
function update(change: (current: SavedRoutes) => SavedRoutes): Promise<SavedRoutes> {
  const run = pending.then(async () => {
    const next = change(await readRoutes());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  pending = run.catch(() => undefined);
  return run;
}

/** Adds walking times Entur gave at transfers to those already known, collecting the lines seen at each. */
export function mergeTransferWalkLists(known: TransferWalk[], seen: TransferWalk[]): TransferWalk[] {
  const byKey = new Map(known.map((t) => [t.key, t]));
  for (const walk of seen) {
    const before = byKey.get(walk.key);
    byKey.set(
      walk.key,
      before
        ? {
            ...walk,
            fromLines: sortLines([...before.fromLines, ...walk.fromLines]),
            toLines: sortLines([...before.toLines, ...walk.toLines]),
          }
        : walk,
    );
  }
  return [...byKey.values()];
}

export interface MappingToSave {
  /** Every alternative the run found, chosen or not. */
  found: Alternative[];
  /** Keys of the alternatives the traveller chose to keep. */
  chosen: Iterable<string>;
  /** The connections the chosen alternatives need. */
  connections: Connection[];
  /** Entur's walking times at the transfers the run saw. */
  transferWalks: TransferWalk[];
}

/**
 * The saved routes after a mapping run for one trip type. Alternatives the run
 * did not find, including any built by hand meanwhile, are kept. A found one the
 * traveller left unchosen is removed. A chosen one that was already saved keeps
 * the lines the traveller gave it. Connections and walking times are added to
 * what is known.
 */
export function mergeMapping(current: SavedRoutes, tripType: TripTypeId, mapping: MappingToSave): SavedRoutes {
  const foundKeys = new Set(mapping.found.map((a) => a.key));
  const chosen = new Set(mapping.chosen);
  const savedBefore = new Map(
    current.alternatives.filter((a) => a.tripType === tripType).map((a) => [a.key, a]),
  );

  const kept = current.alternatives.filter((a) => a.tripType === tripType && !foundKeys.has(a.key));
  const chosenNow = mapping.found
    .filter((a) => chosen.has(a.key))
    .map((a) => savedBefore.get(a.key) ?? toAlternative(a));

  const connections = new Map(current.connections.filter((c) => c.tripType === tripType).map((c) => [c.key, c]));
  for (const c of mapping.connections) connections.set(c.key, c);

  return {
    ...current,
    alternatives: [...current.alternatives.filter((a) => a.tripType !== tripType), ...kept, ...chosenNow],
    connections: [...current.connections.filter((c) => c.tripType !== tripType), ...connections.values()],
    transferWalks: mergeTransferWalkLists(current.transferWalks, mapping.transferWalks),
  };
}

/** Saves what the traveller chose from a mapping run, merged with what is saved now. */
export async function saveMapping(tripType: TripTypeId, mapping: MappingToSave): Promise<SavedRoutes> {
  const next = await update((current) => mergeMapping(current, tripType, mapping));
  log.event('alternatives_saved', {
    tripType,
    alternatives: next.alternatives.filter((a) => a.tripType === tripType).length,
    connections: next.connections.filter((c) => c.tripType === tripType).length,
  });
  return next;
}

/** Adds one alternative, such as one built by hand, with any connections it needs. */
export async function addAlternative(alternative: Alternative, connections: Connection[] = []): Promise<SavedRoutes> {
  log.event('alternative_added', { tripType: alternative.tripType, legs: alternative.legs.length });
  return update((current) => {
    const known = new Set(current.connections.map((c) => c.key));
    return {
      ...current,
      alternatives: [
        ...current.alternatives.filter((a) => !(a.tripType === alternative.tripType && a.key === alternative.key)),
        toAlternative(alternative),
      ],
      connections: [...current.connections, ...connections.filter((c) => !known.has(c.key))],
    };
  });
}

/**
 * Sets the lines of one leg of a saved alternative. Given a function, it is
 * applied to the lines as saved, so that quick changes in a row all count. A leg
 * keeps at least one line.
 */
export async function setLegLines(
  tripType: TripTypeId,
  key: string,
  legIndex: number,
  lines: string[] | ((current: string[]) => string[]),
): Promise<SavedRoutes> {
  const next = (current: string[]) => {
    const changed = sortLines(typeof lines === 'function' ? lines(current) : lines);
    return changed.length ? changed : current;
  };
  log.event('leg_lines_set', { tripType });
  return update((current) => ({
    ...current,
    alternatives: current.alternatives.map((a) =>
      a.tripType === tripType && a.key === key
        ? {
            ...a,
            legs: a.legs.map((leg, i) =>
              i === legIndex && leg.kind === 'transit' ? { ...leg, lines: next(leg.lines) } : leg,
            ),
          }
        : a,
    ),
  }));
}

export async function removeAlternative(tripType: TripTypeId, key: string): Promise<SavedRoutes> {
  log.event('alternative_removed', { tripType });
  return update((current) => ({
    ...current,
    alternatives: current.alternatives.filter((a) => !(a.tripType === tripType && a.key === key)),
  }));
}

/** Sets the traveller's own time for a walk, or clears it when `seconds` is null. */
export async function setWalkOverride(walkKey: string, seconds: number | null): Promise<SavedRoutes> {
  log.event('walk_time_set', { cleared: seconds === null });
  return update((current) => {
    const walkOverrides = { ...current.walkOverrides };
    if (seconds === null) delete walkOverrides[walkKey];
    else walkOverrides[walkKey] = seconds;
    return { ...current, walkOverrides };
  });
}
