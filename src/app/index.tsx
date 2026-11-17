import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripCard } from '@/components/trip-card';
import { MarkButton } from '@/components/mark-button';
import { TripTypeSwitch } from '@/components/trip-type-switch';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { boardButtonText, defaultTripType, labelsOnEveryCard } from '@/core/front-page';
import { boardingOf } from '@/core/on-board';
import { formatClock } from '@/core/time';
import type { PlannedTrip } from '@/engine/trips';
import { useTripGoing } from '@/hooks/use-on-board';
import { useTheme } from '@/hooks/use-theme';
import { useTripPlan } from '@/hooks/use-trip-plan';
import { frontPageSnapshot } from '@/logging/mark';
import { TRIP_TYPES } from '@/model/places';
import type { TripTypeId } from '@/model/types';
import { onBoardStore } from '@/onboard/store';

/**
 * The front page, "Før avreise": one card per trip for the chosen trip type,
 * the one that gets the traveller there first on top. See docs/design/for-avreise.md.
 */
export default function BeforeDepartureScreen() {
  const theme = useTheme();
  // Chosen by the time of day until the position is used to choose it.
  const [tripType, setTripType] = useState<TripTypeId>(() => defaultTripType(new Date()));
  const [showHidden, setShowHidden] = useState(false);
  const { plan, noRoutes, failed, loading, refresh } = useTripPlan(tripType);

  const shown = plan?.trips ?? [];
  const hidden = plan?.hidden ?? [];
  const cards = showHidden ? [...shown, ...hidden] : shown;
  const everyCardLabelled = labelsOnEveryCard(cards);

  const changeTripType = (next: TripTypeId) => {
    setTripType(next);
    setShowHidden(false);
  };

  const muted = [styles.body, { color: theme.textSecondary }];

  /** The traveller is on the first vehicle of this card: on board starts. */
  const board = (trip: PlannedTrip) => {
    const boarding = boardingOf(trip);
    if (!boarding) return;
    onBoardStore.start(tripType, boarding);
    router.push('/om-bord');
  };
  const top = noRoutes ? undefined : shown[0];
  const topButton = top ? boardButtonText(top) : null;
  // A trip the traveller left the on-board screen of is still going, and this is the way back to it.
  const tripGoing = useTripGoing();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.top}>
        <TripTypeSwitch value={tripType} onChange={changeTripType} style={styles.switch} />
        <Pressable
          onPress={() => router.push('/alternativer')}
          accessibilityRole="button"
          accessibilityLabel="Innstillinger"
          style={[styles.button, { borderColor: theme.border }]}>
          <SymbolView
            name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
            size={18}
            tintColor={theme.text}
            fallback={<Text style={{ color: theme.text, fontSize: 16 }}>⚙</Text>}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {failed && plan && (
          <Pressable onPress={refresh} accessibilityRole="button" style={styles.notice}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              Fikk ikke oppdatert fra Entur. Tallene er fra {formatClock(plan.at)}.
            </Text>
          </Pressable>
        )}

        {noRoutes && (
          <View style={styles.empty}>
            <Text style={muted}>
              Ingen alternativer er lagret for {TRIP_TYPES[tripType].label.toLowerCase()}. Kjør en kartlegging for å
              finne dem.
            </Text>
            <Pressable
              onPress={() => router.push('/kartlegging')}
              accessibilityRole="button"
              style={[styles.button, styles.wide, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>Kartlegg</Text>
            </Pressable>
          </View>
        )}

        {!noRoutes && !plan && loading && <Text style={[muted, styles.empty]}>Henter reiser…</Text>}

        {!noRoutes && !plan && failed && (
          <View style={styles.empty}>
            <Text style={muted}>Fikk ikke kontakt med Entur.</Text>
            <Pressable
              onPress={refresh}
              accessibilityRole="button"
              style={[styles.button, styles.wide, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>Prøv igjen</Text>
            </Pressable>
          </View>
        )}

        {!noRoutes && plan && shown.length === 0 && hidden.length === 0 && (
          <Text style={[muted, styles.empty]}>Ingen reiser akkurat nå.</Text>
        )}

        {!noRoutes &&
          shown.map((trip, index) => (
            <Pressable key={trip.cardKey} onPress={() => board(trip)} accessibilityRole="button" accessibilityHint={boardButtonText(trip) ?? undefined}>
              <TripCard
                trip={trip}
                best={index === 0}
                showLabels={index === 0 || everyCardLabelled}
                showColumnHeadings={index === 0}
              />
            </Pressable>
          ))}

        {/* The button stays where it is, so it marks where the hidden cards begin. */}
        {!noRoutes && hidden.length > 0 && (
          <Pressable
            onPress={() => setShowHidden((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showHidden }}
            style={[styles.button, styles.wide, styles.more, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>
              {showHidden ? 'Vis færre' : `Vis flere (${hidden.length})`}
            </Text>
          </Pressable>
        )}

        {!noRoutes &&
          showHidden &&
          hidden.map((trip) => (
            <Pressable key={trip.cardKey} onPress={() => board(trip)} accessibilityRole="button" accessibilityHint={boardButtonText(trip) ?? undefined}>
              <TripCard trip={trip} best={false} showLabels={everyCardLabelled} showColumnHeadings={false} />
            </Pressable>
          ))}
      </ScrollView>

      <View style={styles.bar}>
        <MarkButton snapshot={() => frontPageSnapshot({ tripType, plan, noRoutes, failed, showHidden })} />
        <View style={styles.barButtons}>
          {tripGoing && (
            <Pressable
              onPress={() => router.push('/om-bord')}
              accessibilityRole="button"
              style={[styles.button, styles.wide, { borderColor: theme.border, backgroundColor: theme.cardHighlight }]}>
              <Text style={[styles.body, { color: theme.text }]}>Tilbake til reisen</Text>
            </Pressable>
          )}
          {top && topButton && (
            <Pressable
              onPress={() => board(top)}
              accessibilityRole="button"
              style={[styles.button, styles.wide, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>{topButton}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
  },
  switch: { flex: 1, marginBottom: 0 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  notice: { marginTop: Spacing.two },
  empty: { marginTop: Spacing.four, gap: Spacing.three },
  button: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  wide: { alignItems: 'center' },
  more: { marginTop: Spacing.three },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  barButtons: { flex: 1, gap: Spacing.two },
});
