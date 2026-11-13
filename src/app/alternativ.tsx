import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leave, ScreenHeader } from '@/components/screen-header';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeChain } from '@/mapping/describe';
import { anchorOf, shortStopName } from '@/mapping/pattern';
import { TRIP_TYPES } from '@/model/places';
import { placeSide, type TripTypeId } from '@/model/types';
import {
  connectionWalks,
  effectiveSeconds,
  formatWalkTime,
  parseWalkTime,
  platformLabel,
  vehicleRows,
  type Walk,
} from '@/model/walks';
import {
  loadRoutes,
  NO_ROUTES,
  removeAlternative,
  setWalkOverride,
  type SavedRoutes,
} from '@/storage/alternatives';

/** One saved alternative: its vehicles, and the walking time before each. */
export default function AlternativeScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ tripType: TripTypeId; key: string }>();
  const [routes, setRoutes] = useState<SavedRoutes>(NO_ROUTES);

  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setRoutes);
    }, []),
  );

  const tripType = TRIP_TYPES[params.tripType] ?? TRIP_TYPES.fromWork;
  const side = placeSide(tripType);
  const alternative = routes.alternatives.find(
    (a) => a.tripType === tripType.id && a.key === params.key,
  );

  const setOwnTime = useCallback(async (walk: Walk, seconds: number | null) => {
    setRoutes(await setWalkOverride(walk.key, seconds));
  }, []);

  if (!alternative) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Alternativ" />
        <Text style={[styles.body, styles.padded, { color: theme.textSecondary }]}>
          Fant ikke alternativet. Det kan være slettet.
        </Text>
      </SafeAreaView>
    );
  }

  const times = { transferWalks: routes.transferWalks, overrides: routes.walkOverrides };
  const rows = vehicleRows(alternative.legs, times);
  const anchor = anchorOf(alternative.legs, side);
  const connections = routes.connections.filter(
    (c) => c.tripType === tripType.id && c.anchor.id === anchor?.id,
  );
  const walks = connectionWalks(connections, times);
  const place = side === 'end' ? tripType.to : tripType.from;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader title={describeChain(alternative.legs)} />
      <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { borderColor: theme.border }]}>
          <View style={styles.tableRow}>
            <Text style={[styles.label, styles.lineColumn, { color: theme.textMuted }]}>Rute</Text>
            <Text style={[styles.label, styles.stretchColumn, { color: theme.textMuted }]}>Strekning</Text>
            <Text style={[styles.label, styles.timeColumn, { color: theme.textMuted }]}>Gangtid</Text>
          </View>
          {rows.map((row, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.body, styles.lineColumn, { color: theme.text, fontWeight: '500' }]}>
                {row.lines.join(', ')}
              </Text>
              <Text style={[styles.body, styles.stretchColumn, { color: theme.textSecondary }]}>
                {shortStopName(row.from.name)} → {shortStopName(row.to.name)}
              </Text>
              <View style={styles.timeColumn}>
                {row.walks.map((walk) => (
                  <View key={walk.key} style={styles.timeField}>
                    {row.walks.length > 1 && platformLabel(walk) && (
                      <Text style={[styles.label, { color: theme.textMuted }]}>{platformLabel(walk)}</Text>
                    )}
                    <WalkTimeField walk={walk} onChange={setOwnTime} />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
        <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.two }]}>
          Gangtiden er tiden du bruker fra forrige kjøretøy til dette. Trykk på den for å sette din egen.
          Den gjelder alle alternativer med samme bytte mellom de samme plattformene.
        </Text>

        {walks.length > 0 && (
          <>
            <Text style={[styles.section, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
              {side === 'end' ? `Gange til ${place.name.toLowerCase()}` : `Gange fra ${place.name.toLowerCase()}`}
            </Text>
            {walks.map((walk) => (
              <View key={walk.key} style={[styles.walkRow, { borderBottomColor: theme.borderSoft }]}>
                <Text style={[styles.body, { color: theme.textSecondary, flex: 1 }]}>
                  {shortStopName(walk.from.name)} → {shortStopName(walk.to.name)}
                </Text>
                <WalkTimeField walk={walk} onChange={setOwnTime} />
              </View>
            ))}
          </>
        )}

        <Pressable
          onPress={async () => {
            await removeAlternative(tripType.id, alternative.key);
            leave();
          }}
          accessibilityRole="button"
          style={styles.remove}>
          <Text style={[styles.body, { color: theme.marginMissed }]}>Slett alternativ</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

interface WalkTimeFieldProps {
  walk: Walk;
  onChange: (walk: Walk, seconds: number | null) => void;
}

/** A walking time that turns into an input when pressed. An empty input restores Entur's time. */
function WalkTimeField({ walk, onChange }: WalkTimeFieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft === null) return;
    if (draft.trim() === '') {
      onChange(walk, null);
    } else {
      const seconds = parseWalkTime(draft);
      if (seconds === null) {
        setInvalid(true);
        return;
      }
      onChange(walk, seconds);
    }
    setDraft(null);
    setInvalid(false);
  };

  if (draft !== null) {
    return (
      <View style={styles.timeField}>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setInvalid(false);
          }}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          keyboardType="numbers-and-punctuation"
          placeholder="4:30"
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={`Gangtid ${walk.from.name} til ${walk.to.name}`}
          style={[
            styles.input,
            { color: theme.text, borderColor: invalid ? theme.marginMissed : theme.border },
          ]}
        />
        {invalid && <Text style={[styles.label, { color: theme.marginMissed }]}>Skriv som 4:30</Text>}
      </View>
    );
  }

  const known = walk.ownSeconds !== null || walk.enturSeconds !== null;
  return (
    <Pressable
      onPress={() => setDraft(known ? formatWalkTime(effectiveSeconds(walk)) : '')}
      accessibilityRole="button"
      accessibilityLabel={`Endre gangtid ${walk.from.name} til ${walk.to.name}`}
      hitSlop={8}
      style={styles.timeField}>
      <Text style={[styles.body, styles.numbers, { color: theme.text }]}>
        {known ? formatWalkTime(effectiveSeconds(walk)) : 'Sett'}
      </Text>
      {walk.ownSeconds !== null && walk.enturSeconds !== null && (
        <Text style={[styles.label, styles.numbers, { color: theme.textMuted }]}>
          Entur {formatWalkTime(walk.enturSeconds)}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  padded: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  numbers: { fontVariant: ['tabular-nums'] },
  card: { borderWidth: 1, borderRadius: Radius.card, paddingHorizontal: Spacing.three, paddingVertical: 10, gap: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  lineColumn: { width: 62 },
  stretchColumn: { flex: 1 },
  timeColumn: { width: 64, alignItems: 'flex-end', gap: 4 },
  timeField: { alignItems: 'flex-end' },
  input: {
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 6,
    paddingVertical: 2,
    width: 60,
    textAlign: 'right',
  },
  section: {
    fontSize: 12,
    fontWeight: '500',
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    marginTop: Spacing.four,
    overflow: 'hidden',
  },
  walkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  remove: { alignItems: 'center', paddingVertical: Spacing.four, marginTop: Spacing.two },
});
