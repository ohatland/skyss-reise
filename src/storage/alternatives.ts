import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function loadRoutes(): Promise<SavedRoutes> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? { ...NO_ROUTES, ...(JSON.parse(stored) as Partial<SavedRoutes>) } : NO_ROUTES;
  } catch (error) {
    log.error(error, { where: 'loadRoutes' });
    return NO_ROUTES;
  }
}

async function store(next: SavedRoutes): Promise<SavedRoutes> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Replaces the alternatives and connections saved for one trip type, leaving the
 * other untouched. Walking times at transfers are added to what is already known.
 */
export async function saveMapping(
  tripType: TripTypeId,
  alternatives: Alternative[],
  connections: Connection[],
  transferWalks: TransferWalk[],
): Promise<SavedRoutes> {
  const current = await loadRoutes();
  const walks = new Map(current.transferWalks.map((t) => [t.key, t]));
  for (const walk of transferWalks) walks.set(walk.key, walk);

  log.event('alternatives_saved', {
    tripType,
    alternatives: alternatives.length,
    connections: connections.length,
  });
  return store({
    ...current,
    alternatives: [
      ...current.alternatives.filter((a) => a.tripType !== tripType),
      ...alternatives.map(toAlternative),
    ],
    connections: [...current.connections.filter((c) => c.tripType !== tripType), ...connections],
    transferWalks: [...walks.values()],
  });
}

/** Adds one alternative, such as one built by hand, with any connections it needs. */
export async function addAlternative(alternative: Alternative, connections: Connection[] = []): Promise<SavedRoutes> {
  const current = await loadRoutes();
  const known = new Set(current.connections.map((c) => c.key));
  log.event('alternative_added', { tripType: alternative.tripType, legs: alternative.legs.length });
  return store({
    ...current,
    alternatives: [
      ...current.alternatives.filter((a) => !(a.tripType === alternative.tripType && a.key === alternative.key)),
      toAlternative(alternative),
    ],
    connections: [...current.connections, ...connections.filter((c) => !known.has(c.key))],
  });
}

/** Replaces the lines of one leg of a saved alternative. */
export async function setLegLines(
  tripType: TripTypeId,
  key: string,
  legIndex: number,
  lines: string[],
): Promise<SavedRoutes> {
  const current = await loadRoutes();
  log.event('leg_lines_set', { tripType, lines: lines.length });
  return store({
    ...current,
    alternatives: current.alternatives.map((a) =>
      a.tripType === tripType && a.key === key
        ? { ...a, legs: a.legs.map((leg, i) => (i === legIndex && leg.kind === 'transit' ? { ...leg, lines } : leg)) }
        : a,
    ),
  });
}

export async function removeAlternative(tripType: TripTypeId, key: string): Promise<SavedRoutes> {
  const current = await loadRoutes();
  log.event('alternative_removed', { tripType });
  return store({
    ...current,
    alternatives: current.alternatives.filter((a) => !(a.tripType === tripType && a.key === key)),
  });
}

/** Sets the traveller's own time for a walk, or clears it when `seconds` is null. */
export async function setWalkOverride(walkKey: string, seconds: number | null): Promise<SavedRoutes> {
  const current = await loadRoutes();
  const walkOverrides = { ...current.walkOverrides };
  if (seconds === null) delete walkOverrides[walkKey];
  else walkOverrides[walkKey] = seconds;
  log.event('walk_time_set', { cleared: seconds === null });
  return store({ ...current, walkOverrides });
}
