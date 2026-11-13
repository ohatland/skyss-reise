import { Colors, MarginWeight, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme(): Theme & { marginWeight: '500' | '600' } {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { ...Colors[scheme], marginWeight: MarginWeight[scheme] };
}
