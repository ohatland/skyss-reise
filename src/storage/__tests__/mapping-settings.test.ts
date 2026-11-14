import AsyncStorage from '@react-native-async-storage/async-storage';

import { setLogSinks } from '@/logging/logger';
import { defaultSettings, loadMappingSettings, saveMappingSettings } from '@/storage/mapping-settings';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const evening = { start: '15:00', end: '16:00', viaStops: [] };
const morning = { start: '07:00', end: '08:00', viaStops: [] };

beforeEach(async () => {
  setLogSinks([]);
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('mapping settings', () => {
  it('gives the defaults until something is saved', async () => {
    expect(await loadMappingSettings('fromWork')).toEqual(defaultSettings('fromWork'));
  });

  it('saves each trip type on its own', async () => {
    await saveMappingSettings('fromWork', evening);
    await saveMappingSettings('toWork', morning);
    expect(await loadMappingSettings('fromWork')).toEqual(evening);
    expect(await loadMappingSettings('toWork')).toEqual(morning);
  });

  it('gives the defaults when storage cannot be read', async () => {
    await saveMappingSettings('fromWork', evening);
    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    expect(await loadMappingSettings('fromWork')).toEqual(defaultSettings('fromWork'));
  });

  it('does not write over the other trip type after a failed read', async () => {
    await saveMappingSettings('toWork', morning);
    storage.getItem.mockRejectedValueOnce(new Error('lagringsfeil'));
    await expect(saveMappingSettings('fromWork', evening)).rejects.toThrow('lagringsfeil');
    expect(await loadMappingSettings('toWork')).toEqual(morning);
  });

  it('keeps the last of several quick saves', async () => {
    await Promise.all([
      saveMappingSettings('fromWork', { ...evening, end: '16:20' }),
      saveMappingSettings('fromWork', { ...evening, end: '16:40' }),
    ]);
    expect((await loadMappingSettings('fromWork')).end).toBe('16:40');
  });
});
