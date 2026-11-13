import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { STOPS } from '@/config';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { departureMarking } from '@/core/departure-marking';
import { formatClock } from '@/core/time';
import type { Departure } from '@/entur/departures';
import { useDepartures } from '@/hooks/use-departures';
import { useTheme } from '@/hooks/use-theme';

/**
 * Phase 2 screen: a live departure board for Krokåsskiftet, to prove the path
 * from Entur to the phone. The front page from docs/design replaces it in phase 4.
 */
export default function DepartureBoardScreen() {
  const theme = useTheme();
  const { board, loading, failed, refresh } = useDepartures(STOPS.krokasskiftet);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.heading, { color: theme.text }]}>{board?.stopName ?? 'Krokåsskiftet'}</Text>

      {failed && (
        <View style={[styles.notice, { borderColor: theme.border }]}>
          <Text style={{ color: theme.textSecondary, fontSize: FontSize.body }}>
            {board ? 'Fikk ikke oppdatert fra Entur. Viser forrige svar.' : 'Fikk ikke kontakt med Entur.'}
          </Text>
          <Pressable onPress={refresh} accessibilityRole="button">
            <Text style={{ color: theme.text, fontSize: FontSize.body, fontWeight: '500' }}>Prøv igjen</Text>
          </Pressable>
        </View>
      )}

      {loading && !board && (
        <Text style={{ color: theme.textMuted, fontSize: FontSize.body }}>Henter avganger…</Text>
      )}

      {board && board.departures.length === 0 && (
        <Text style={{ color: theme.textSecondary, fontSize: FontSize.body }}>
          Ingen avganger de neste to timene.
        </Text>
      )}

      {board && (
        <FlatList
          data={board.departures}
          keyExtractor={(d) => `${d.serviceJourneyId}-${d.aimedTime}`}
          renderItem={({ item }) => <DepartureRow departure={item} />}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.borderSoft }} />}
        />
      )}
    </SafeAreaView>
  );
}

function DepartureRow({ departure }: { departure: Departure }) {
  const theme = useTheme();
  const marking = departureMarking(departure);

  return (
    <View style={styles.row}>
      <View style={styles.time}>
        <Text
          style={[
            styles.clock,
            { color: theme.text },
            departure.cancelled && { textDecorationLine: 'line-through', color: theme.textMuted },
          ]}>
          {formatClock(departure.expectedTime)}
        </Text>
        {departure.cancelled ? (
          <Text style={[styles.label, { color: theme.textMuted }]}>innstilt</Text>
        ) : marking.kind === 'deviation' ? (
          <Text style={[styles.struck, { color: theme.textMuted }]}>{marking.scheduledClock}</Text>
        ) : (
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {marking.kind === 'realtime' ? 'sanntid' : 'rutetid'}
          </Text>
        )}
      </View>
      <Text style={[styles.line, { color: theme.text }]}>{departure.line}</Text>
      <Text style={[styles.destination, { color: theme.textSecondary }]} numberOfLines={1}>
        {departure.destination}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  heading: {
    fontSize: FontSize.heading,
    fontWeight: '500',
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  notice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  time: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    width: 124,
  },
  clock: {
    fontSize: FontSize.time,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: FontSize.label,
  },
  struck: {
    fontSize: FontSize.body,
    textDecorationLine: 'line-through',
    fontVariant: ['tabular-nums'],
  },
  line: {
    fontSize: FontSize.body,
    fontWeight: '500',
    width: 40,
  },
  destination: {
    flex: 1,
    fontSize: FontSize.body,
  },
});
