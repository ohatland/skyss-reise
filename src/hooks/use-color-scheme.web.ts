import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** Set once the app has hydrated, so that components mounted later do not render light first and blink. */
let appHydrated = false;

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(appHydrated);

  useEffect(() => {
    appHydrated = true;
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
