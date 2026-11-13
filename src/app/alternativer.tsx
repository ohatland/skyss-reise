import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { TripTypeSwitch } from '@/components/trip-type-switch';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeChain, describeConnections, describeStops } from '@/mapping/describe';
import { anchorOf } from '@/mapping/pattern';
import { TRIP_TYPES } from '@/model/places';
import { placeSide, type TripTypeId } from '@/model/types';
import { loadRoutes, NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

/** The saved alternatives for one trip type. Used rarely, after a mapping run. */
export default function AlternativesScreen() {
  const theme = useTheme();
  const [tripTypeId, setTripTypeId] = useState<TripTypeId>('fromWork');
  const [routes, setRoutes] = useState<SavedRoutes>(NO_ROUTES);

  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setRoutes);
    }, []),
  );

  const tripType = TRIP_TYPES[tripTypeId];
  const side = placeSide(tripType);
  const place = side === 'end' ? tripType.to : tripType.from;
  const farEnd = side === 'end' ? tripType.from : tripType.to;
  const alternatives = routes.alternatives.filter((a) => a.tripType === tripTypeId);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Alternativer" />
      <ScrollView contentContainerStyle={styles.content}>
        <TripTypeSwitch value={tripTypeId} onChange={setTripTypeId} />

        {alternatives.length === 0 && (
          <Text style={[styles.body, { color: theme.textSecondary, marginTop: Spacing.two }]}>
            Ingen alternativer er lagret for {tripType.label.toLowerCase()}. Kjør en kartlegging for å finne dem.
          </Text>
        )}

        {alternatives.map((alternative) => {
          const anchor = anchorOf(alternative.legs, side);
          const connections = routes.connections.filter(
            (c) => c.tripType === tripTypeId && c.anchor.id === anchor?.id,
          );
          const connectionText = describeConnections(connections, side, place.name);
          return (
            <Pressable
              key={alternative.key}
              onPress={() =>
                router.push({ pathname: '/alternativ', params: { tripType: tripTypeId, key: alternative.key } })
              }
              accessibilityRole="button"
              style={[styles.row, { borderBottomColor: theme.borderSoft }]}>
              <View style={styles.rowText}>
                <Text style={[styles.chain, { color: theme.text }]}>{describeChain(alternative.legs)}</Text>
                <Text style={[styles.body, { color: theme.textSecondary }]}>
                  {describeStops(alternative.legs, side)}
                </Text>
                {connectionText && (
                  <Text style={[styles.label, { color: theme.textMuted, marginTop: 2 }]}>{connectionText}</Text>
                )}
              </View>
              <Text style={[styles.chevron, { color: theme.textSecondary }]}>›</Text>
            </Pressable>
          );
        })}

        {alternatives.length > 0 && (
          <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.two }]}>
            {side === 'end' ? `Alle starter på ${farEnd.name}` : `Alle ender på ${farEnd.name}`}
          </Text>
        )}

        <View style={styles.buttons}>
          <Pressable
            onPress={() => router.push('/kartlegging')}
            accessibilityRole="button"
            style={[styles.button, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Kartlegg</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/bygg', params: { tripType: tripTypeId } })}
            accessibilityRole="button"
            style={[styles.button, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Bygg selv</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowText: { flex: 1 },
  chain: { fontSize: 15, fontWeight: '500' },
  chevron: { fontSize: 20 },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.four },
  button: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
});
