import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { nextWeekday, timesInWindow } from '@/core/oslo-time';
import { useTheme } from '@/hooks/use-theme';
import { log } from '@/logging/logger';
import { describeChain, describeConnections, describeStats, describeStops } from '@/mapping/describe';
import { connectionsFor, groupAlternatives } from '@/mapping/pattern';
import { searchTrips } from '@/mapping/query';
import { runMapping, totalSearches, type MappingResult } from '@/mapping/run';
import { DEFAULT_VIA_STOPS, TRIP_TYPES } from '@/model/places';
import { placeSide, type Alternative, type Connection, type MappedAlternative, type PlaceSide, type TripTypeId } from '@/model/types';
import { loadRoutes, saveRoutes, type SavedRoutes } from '@/storage/alternatives';

/** Minutes between the start times a mapping run searches. */
const SEARCH_STEP_MINUTES = 20;

/** Back to where the user came from, or to the front page when the screen was opened directly. */
function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

type Phase =
  | { name: 'setup' }
  | { name: 'running'; done: number; total: number }
  | { name: 'results'; result: MappingResult }
  | { name: 'failed' };

export default function MappingScreen() {
  const theme = useTheme();
  const [tripTypeId, setTripTypeId] = useState<TripTypeId>('fromWork');
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [saved, setSaved] = useState<SavedRoutes>({ alternatives: [], connections: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRare, setShowRare] = useState(false);

  const tripType = TRIP_TYPES[tripTypeId];
  const times = useMemo(
    () => timesInWindow(tripType.window.start, tripType.window.end, SEARCH_STEP_MINUTES),
    [tripType],
  );

  useEffect(() => {
    loadRoutes().then(setSaved);
  }, []);

  const savedKeys = useMemo(
    () => new Set(saved.alternatives.filter((a) => a.tripType === tripTypeId).map((a) => a.key)),
    [saved, tripTypeId],
  );

  const start = useCallback(async () => {
    const config = { tripType, date: nextWeekday(new Date()), times, viaStops: DEFAULT_VIA_STOPS };
    setPhase({ name: 'running', done: 0, total: totalSearches(config) });
    try {
      const result = await runMapping(config, {
        search: searchTrips,
        onProgress: (done, total) => setPhase({ name: 'running', done, total }),
      });
      if (result.alternatives.length === 0 && result.failedSearches === result.searches) {
        setPhase({ name: 'failed' });
        return;
      }
      const hadSaved = savedKeys.size > 0;
      setSelected(
        new Set(
          result.alternatives
            .filter((a) => (hadSaved ? savedKeys.has(a.key) : !a.rare))
            .map((a) => a.key),
        ),
      );
      setShowRare(false);
      setPhase({ name: 'results', result });
    } catch (error) {
      log.error(error, { where: 'mapping' });
      setPhase({ name: 'failed' });
    }
  }, [tripType, times, savedKeys]);

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const save = useCallback(async (found: MappedAlternative[]) => {
    // Alternatives saved earlier that this run did not find are kept, with their connections.
    const foundKeys = new Set(found.map((a) => a.key));
    const keptAlternatives: Alternative[] = saved.alternatives.filter(
      (a) => a.tripType === tripTypeId && !foundKeys.has(a.key),
    );
    const chosen = found.filter((a) => selected.has(a.key));
    const connections = new Map<string, Connection>();
    for (const c of saved.connections) if (c.tripType === tripTypeId) connections.set(c.key, c);
    for (const c of connectionsFor(chosen)) connections.set(c.key, c);
    await saveRoutes(tripTypeId, [...keptAlternatives, ...chosen], [...connections.values()]);
    leave();
  }, [saved, selected, tripTypeId]);

  const colors = {
    text: { color: theme.text },
    secondary: { color: theme.textSecondary },
    muted: { color: theme.textMuted },
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={leave} accessibilityRole="button" accessibilityLabel="Tilbake" hitSlop={12}>
          <Text style={[styles.back, colors.text]}>←</Text>
        </Pressable>
        <Text style={[styles.heading, colors.text]}>
          {phase.name === 'results'
            ? `${phase.result.alternatives.length} alternativer funnet`
            : 'Kartlegg alternativer'}
        </Text>
      </View>

      {phase.name === 'setup' && (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.segment, { backgroundColor: theme.cardHighlight }]}>
            {(Object.keys(TRIP_TYPES) as TripTypeId[]).map((id) => {
              const active = id === tripTypeId;
              return (
                <Pressable
                  key={id}
                  onPress={() => setTripTypeId(id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.segmentItem,
                    active && { backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1 },
                  ]}>
                  <Text style={[styles.segmentText, active ? [colors.text, styles.medium] : colors.secondary]}>
                    {TRIP_TYPES[id].label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field label="Fra" value={tripType.from.name} />
          <Field label="Til" value={tripType.to.name} />
          <Field label="Tidsrom" value={`Hverdager ${tripType.window.start}–${tripType.window.end}`} />
          <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
            <Text style={[styles.body, colors.secondary]}>Søk også via</Text>
            <View style={styles.chips}>
              {DEFAULT_VIA_STOPS.map((stop) => (
                <Text key={stop.id} style={[styles.chip, colors.text, { borderColor: theme.border }]}>
                  {stop.name}
                </Text>
              ))}
            </View>
          </View>

          <Text style={[styles.body, colors.secondary, { marginTop: Spacing.three }]}>
            Appen søker gjennom hele tidsrommet på flere måter: vanlig søk, med flere bytter, med mer gange,
            og på nytt uten de linjene som går igjen i forslagene. Bare det periodebilletten dekker er med: Skyss og tog.
          </Text>

          <Pressable
            onPress={start}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: theme.text }]}>
            <Text style={[styles.primaryText, { color: theme.background }]}>Start kartlegging</Text>
          </Pressable>
          <Text style={[styles.label, colors.muted, styles.center]}>
            {totalSearches({ times, viaStops: DEFAULT_VIA_STOPS })} søk hos Entur. Tar omtrent ett minutt.
          </Text>
        </ScrollView>
      )}

      {phase.name === 'running' && (
        <View style={styles.content}>
          <Text style={[styles.body, colors.secondary]}>
            Søker hos Entur … {phase.done} av {phase.total}
          </Text>
          <View style={[styles.track, { backgroundColor: theme.borderSoft }]}>
            <View
              style={{
                width: `${Math.round((phase.done / phase.total) * 100)}%`,
                height: '100%',
                backgroundColor: theme.text,
                borderRadius: 2,
              }}
            />
          </View>
        </View>
      )}

      {phase.name === 'failed' && (
        <View style={styles.content}>
          <Text style={[styles.body, colors.secondary]}>Fikk ikke kontakt med Entur. Ingen søk ga svar.</Text>
          <Pressable
            onPress={() => setPhase({ name: 'setup' })}
            accessibilityRole="button"
            style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Text style={[styles.body, colors.text]}>Prøv igjen</Text>
          </Pressable>
        </View>
      )}

      {phase.name === 'results' && (
        <Results
          result={phase.result}
          tripTypeLabel={tripType.label}
          side={placeSide(tripType)}
          placeName={(placeSide(tripType) === 'end' ? tripType.to : tripType.from).name}
          savedKeys={savedKeys}
          selected={selected}
          showRare={showRare}
          onToggle={toggle}
          onShowRare={() => setShowRare(true)}
          onSave={() => save(phase.result.alternatives)}
        />
      )}
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.body, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

interface ResultsProps {
  result: MappingResult;
  tripTypeLabel: string;
  side: PlaceSide;
  placeName: string;
  savedKeys: Set<string>;
  selected: Set<string>;
  showRare: boolean;
  onToggle: (key: string) => void;
  onShowRare: () => void;
  onSave: () => void;
}

function Results({
  result,
  tripTypeLabel,
  side,
  placeName,
  savedKeys,
  selected,
  showRare,
  onToggle,
  onShowRare,
  onSave,
}: ResultsProps) {
  const theme = useTheme();
  const common = result.alternatives.filter((a) => !a.rare);
  const rare = result.alternatives.filter((a) => a.rare);
  const groups = groupAlternatives(common);

  const row = (alternative: MappedAlternative) => {
    const checked = selected.has(alternative.key);
    const connectionText = describeConnections(alternative, side, placeName);
    return (
      <Pressable
        key={alternative.key}
        onPress={() => onToggle(alternative.key)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={[styles.row, { borderBottomColor: theme.borderSoft }]}>
        <View style={styles.rowText}>
          <View style={styles.chainLine}>
            <Text style={[styles.chain, { color: theme.text }]}>{describeChain(alternative.legs)}</Text>
            {!savedKeys.has(alternative.key) && (
              <Text style={[styles.tag, { color: theme.textSecondary, borderColor: theme.border }]}>Ny</Text>
            )}
          </View>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {describeStops(alternative.legs, side)}
          </Text>
          <Text style={[styles.body, styles.numbers, { color: theme.textSecondary }]}>
            {describeStats(alternative)}
          </Text>
          {connectionText && (
            <Text style={[styles.label, styles.numbers, { color: theme.textMuted, marginTop: 2 }]}>
              {connectionText}
            </Text>
          )}
        </View>
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.textMuted },
            checked && { backgroundColor: theme.text, borderColor: theme.text },
          ]}>
          {checked && <Text style={{ color: theme.background, fontSize: 14, fontWeight: '600' }}>✓</Text>}
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.label, { color: theme.textMuted }]}>
          {tripTypeLabel} · gruppert etter siste bytte
        </Text>
        {result.failedSearches > 0 && (
          <Text style={[styles.label, { color: theme.textMuted }]}>
            {result.failedSearches} av {result.searches} søk ga ikke svar, så listen kan mangle noe.
          </Text>
        )}

        {result.alternatives.length === 0 && (
          <Text style={[styles.body, { color: theme.textSecondary, marginTop: Spacing.three }]}>
            Entur fant ingen reiser i tidsrommet.
          </Text>
        )}

        {groups.map((group) => (
          <View key={group.name}>
            <Text
              style={[styles.group, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
              {group.name}
            </Text>
            {group.alternatives.map(row)}
          </View>
        ))}

        {rare.length > 0 && !showRare && (
          <Pressable onPress={onShowRare} accessibilityRole="button" style={styles.rareToggle}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>
              Vis {rare.length} sjeldnere forslag
            </Text>
          </Pressable>
        )}
        {rare.length > 0 && showRare && (
          <View>
            <Text
              style={[styles.group, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
              Sjeldnere forslag
            </Text>
            {rare.map(row)}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.borderSoft, backgroundColor: theme.background }]}>
        <Pressable onPress={onSave} accessibilityRole="button" style={[styles.primary, { backgroundColor: theme.text, marginTop: 0 }]}>
          <Text style={[styles.primaryText, { color: theme.background }]}>
            Lagre {selected.size} valgte
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
  back: { fontSize: 20 },
  heading: { fontSize: FontSize.heading, fontWeight: '500' },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.one },
  medium: { fontWeight: '500' },
  center: { textAlign: 'center' },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  numbers: { fontVariant: ['tabular-nums'] },
  segment: { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: Spacing.two },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 5, borderRadius: Radius.control },
  segmentText: { fontSize: 14 },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.one, flex: 1 },
  chip: {
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  primary: {
    borderRadius: Radius.control,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  primaryText: { fontSize: FontSize.body, fontWeight: '500' },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  track: { height: 4, borderRadius: 2, marginTop: Spacing.two, overflow: 'hidden' },
  group: {
    fontSize: 12,
    fontWeight: '500',
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    marginTop: Spacing.three,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  rowText: { flex: 1 },
  chainLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chain: { fontSize: 14, fontWeight: '500' },
  tag: {
    fontSize: FontSize.label,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 7,
    overflow: 'hidden',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  rareToggle: { paddingVertical: Spacing.three },
  footer: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, borderTopWidth: 1 },
});
