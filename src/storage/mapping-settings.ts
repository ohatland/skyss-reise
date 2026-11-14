import AsyncStorage from '@react-native-async-storage/async-storage';

import { log } from '@/logging/logger';
import { DEFAULT_VIA_STOPS, TRIP_TYPES } from '@/model/places';
import type { StopRef, TripTypeId } from '@/model/types';

const STORAGE_KEY = 'mapping-settings:v1';

/** What the traveller has chosen for mapping runs of one trip type. */
export interface MappingSettings {
  /** The time of day to search, as HH:MM. */
  start: string;
  end: string;
  viaStops: StopRef[];
}

export function defaultSettings(tripType: TripTypeId): MappingSettings {
  return { ...TRIP_TYPES[tripType].window, viaStops: DEFAULT_VIA_STOPS };
}

type Stored = Partial<Record<TripTypeId, MappingSettings>>;

/** Throws when storage cannot be read, so that a save never writes over the other trip type's settings. */
async function readAll(): Promise<Stored> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored ? (JSON.parse(stored) as Stored) : {};
}

/** The saved settings, or the defaults where none are saved or storage cannot be read. */
export async function loadMappingSettings(tripType: TripTypeId): Promise<MappingSettings> {
  try {
    return { ...defaultSettings(tripType), ...(await readAll())[tripType] };
  } catch (error) {
    log.error(error, { where: 'loadMappingSettings' });
    return defaultSettings(tripType);
  }
}

let pending: Promise<unknown> = Promise.resolve();

/** Saves the settings of one trip type. Saves run one at a time, in the order they were made. */
export function saveMappingSettings(tripType: TripTypeId, settings: MappingSettings): Promise<void> {
  const run = pending.then(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(await readAll()), [tripType]: settings }));
  });
  pending = run.catch(() => undefined);
  return run;
}
