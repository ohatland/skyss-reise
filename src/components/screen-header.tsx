import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontSize, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Back to where the user came from, or to the front page when the screen was opened directly. */
export function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function ScreenHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Tilbake" hitSlop={12}>
        <Text style={[styles.back, { color: theme.text }]}>←</Text>
      </Pressable>
      <Text style={[styles.heading, { color: theme.text }]} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  back: { fontSize: 20 },
  heading: { flex: 1, fontSize: FontSize.heading, fontWeight: '500' },
});
