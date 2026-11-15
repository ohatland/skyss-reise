import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const never = () => () => {};

/**
 * The colour scheme on web. The server renders light, so the client does too
 * while it hydrates, and takes the real scheme after. A component mounted
 * later gets the real scheme at once and does not render light first and blink.
 */
export function useColorScheme() {
  const hydrated = useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();

  return hydrated ? colorScheme : 'light';
}
