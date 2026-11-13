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

async function loadAll(): Promise<Stored> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Stored) : {};
  } catch (error) {
    log.error(error, { where: 'loadMappingSettings' });
    return {};
  }
}

export async function loadMappingSettings(tripType: TripTypeId): Promise<MappingSettings> {
  return { ...defaultSettings(tripType), ...(await loadAll())[tripType] };
}

export async function saveMappingSettings(tripType: TripTypeId, settings: MappingSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...(await loadAll()), [tripType]: settings }));
}
