import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leave, ScreenHeader } from '@/components/screen-header';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { nextWeekday } from '@/core/oslo-time';
import { useTheme } from '@/hooks/use-theme';
import { findDirectLeg } from '@/mapping/direct';
import { shortStopName, sortLines } from '@/mapping/pattern';
import { searchTrips } from '@/mapping/query';
import { TRIP_TYPES } from '@/model/places';
import type { TripTypeId } from '@/model/types';
import { loadRoutes, NO_ROUTES, setLegLines, type SavedRoutes } from '@/storage/alternatives';

/** One leg of a saved alternative: which lines the traveller is willing to take on it. */
export default function LegScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ tripType: TripTypeId; key: string; leg: string }>();
  const [routes, setRoutes] = useState<SavedRoutes>(NO_ROUTES);
  /** Lines Entur knows on this stretch. Null while looking, or when the lookup failed. */
  const [known, setKnown] = useState<string[] | null>(null);
  const [lookedUp, setLookedUp] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setRoutes);
    }, []),
  );

  const tripType = TRIP_TYPES[params.tripType] ?? TRIP_TYPES.fromWork;
  const legIndex = Number(params.leg);
  const alternative = routes.alternatives.find((a) => a.tripType === tripType.id && a.key === params.key);
  const leg = alternative?.legs[legIndex];
  const transit = leg?.kind === 'transit' ? leg : null;
  const fromId = transit?.from.id;
  const toId = transit?.to.id;

  useEffect(() => {
    if (!transit) return;
    let cancelled = false;
    findDirectLeg(transit.from, transit.to, { search: searchTrips, date: nextWeekday(new Date()) })
      .then((found) => {
        if (cancelled) return;
        setKnown(found ? found.lines : []);
        setLookedUp(true);
      })
      .catch(() => {
        if (!cancelled) setLookedUp(true);
      });
    return () => {
      cancelled = true;
    };
    // The stretch is identified by its two stops; the leg object itself changes on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromId, toId]);

  if (!alternative || !transit) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Etappe" />
        <Text style={[styles.body, styles.padded, { color: theme.textSecondary }]}>Fant ikke etappen.</Text>
      </SafeAreaView>
    );
  }

  const setLines = async (lines: string[]) => {
    setRoutes(await setLegLines(tripType.id, alternative.key, legIndex, sortLines(lines)));
  };
  const others = (known ?? []).filter((line) => !transit.lines.includes(line));

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader title={`${shortStopName(transit.from.name)} → ${shortStopName(transit.to.name)}`} />
      <ScrollView contentContainerStyle={styles.padded}>
        <Text style={[styles.label, { color: theme.textMuted }]}>Ruter du tar på denne etappen</Text>
        <View style={styles.chips}>
          {transit.lines.map((line) => (
            <Pressable
              key={line}
              onPress={() => setLines(transit.lines.filter((l) => l !== line))}
              disabled={transit.lines.length === 1}
              accessibilityRole="button"
              accessibilityLabel={`Fjern linje ${line}`}
              style={[styles.chip, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text, fontWeight: '500' }]}>
                {line}
                {transit.lines.length > 1 ? ' ×' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        {transit.lines.length === 1 && (
          <Text style={[styles.label, { color: theme.textMuted }]}>En etappe må ha minst én rute.</Text>
        )}

        <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.four }]}>Går også her</Text>
        {!lookedUp && <Text style={[styles.body, { color: theme.textMuted }]}>Slår opp hos Entur…</Text>}
        {lookedUp && known === null && (
          <Text style={[styles.body, { color: theme.textSecondary }]}>Fikk ikke slått opp hos Entur.</Text>
        )}
        {lookedUp && known !== null && others.length === 0 && (
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Entur kjenner ingen andre direkte ruter på strekningen.
          </Text>
        )}
        <View style={styles.chips}>
          {others.map((line) => (
            <Pressable
              key={line}
              onPress={() => setLines([...transit.lines, line])}
              accessibilityRole="button"
              accessibilityLabel={`Legg til linje ${line}`}
              style={[styles.chip, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>+ {line}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={leave} accessibilityRole="button" style={[styles.button, { borderColor: theme.border }]}>
          <Text style={[styles.body, { color: theme.text }]}>Ferdig</Text>
        </Pressable>
        <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.two }]}>
          Holdeplassene kan ikke endres her. Bygg et nytt alternativ hvis etappen skal gå et annet sted.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  padded: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  button: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.five,
  },
});
