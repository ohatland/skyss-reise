import AsyncStorage from '@react-native-async-storage/async-storage';

import { log } from '@/logging/logger';
import type { Alternative, Connection, MappedAlternative, TripTypeId } from '@/model/types';

const STORAGE_KEY = 'alternatives:v2';

export interface SavedRoutes {
  alternatives: Alternative[];
  /** Ways between the traveller's address and the stops the alternatives start or end at. */
  connections: Connection[];
}

const EMPTY: SavedRoutes = { alternatives: [], connections: [] };

/** Only what defines the alternative is stored; what a mapping run measured is not. */
export function toAlternative({ key, tripType, legs }: Alternative | MappedAlternative): Alternative {
  return { key, tripType, legs };
}

export async function loadRoutes(): Promise<SavedRoutes> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? { ...EMPTY, ...(JSON.parse(stored) as Partial<SavedRoutes>) } : EMPTY;
  } catch (error) {
    log.error(error, { where: 'loadRoutes' });
    return EMPTY;
  }
}

/** Replaces what is saved for one trip type, leaving the other untouched. */
export async function saveRoutes(
  tripType: TripTypeId,
  alternatives: Alternative[],
  connections: Connection[],
): Promise<void> {
  const current = await loadRoutes();
  const next: SavedRoutes = {
    alternatives: [
      ...current.alternatives.filter((a) => a.tripType !== tripType),
      ...alternatives.map(toAlternative),
    ],
    connections: [...current.connections.filter((c) => c.tripType !== tripType), ...connections],
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  log.event('alternatives_saved', {
    tripType,
    alternatives: alternatives.length,
    connections: connections.length,
  });
}
