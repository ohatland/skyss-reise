import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { TRIP_TYPES } from '@/model/places';
import type { TripTypeId } from '@/model/types';

interface Props {
  value: TripTypeId;
  onChange: (next: TripTypeId) => void;
}

/** The switch between "Til jobb" and "Fra jobb" from the approved sketches. */
export function TripTypeSwitch({ value, onChange }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.segment, { backgroundColor: theme.cardHighlight }]}>
      {(Object.keys(TRIP_TYPES) as TripTypeId[]).map((id) => {
        const active = id === value;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.item,
              active && { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 },
            ]}>
            <Text
              style={[
                styles.text,
                active ? { color: theme.text, fontWeight: '500' } : { color: theme.textSecondary },
              ]}>
              {TRIP_TYPES[id].label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: Spacing.two },
  item: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: Radius.control },
  text: { fontSize: 14 },
});
