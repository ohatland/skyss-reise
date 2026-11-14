import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leave, ScreenHeader } from '@/components/screen-header';
import { StopSearch } from '@/components/stop-search';
import { TripTypeSwitch } from '@/components/trip-type-switch';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { nextWeekday, parseClock, timesInWindow } from '@/core/oslo-time';
import { useTheme } from '@/hooks/use-theme';
import { log } from '@/logging/logger';
import { describeChain, describeConnections, describeStats, describeStops } from '@/mapping/describe';
import { connectionsFor, groupAlternatives } from '@/mapping/pattern';
import { searchTrips } from '@/mapping/query';
import { extendWithVia, runMapping, totalSearches, type MappingResult } from '@/mapping/run';
import { TRIP_TYPES } from '@/model/places';
import {
  placeSide,
  type MappedAlternative,
  type PlaceSide,
  type StopRef,
  type TripTypeId,
} from '@/model/types';
import { loadRoutes, NO_ROUTES, saveMapping, type SavedRoutes } from '@/storage/alternatives';
import {
  defaultSettings,
  loadMappingSettings,
  saveMappingSettings,
  type MappingSettings,
} from '@/storage/mapping-settings';

/** Minutes between the start times a mapping run searches. */
const SEARCH_STEP_MINUTES = 20;

type Phase =
  | { name: 'setup' }
  | { name: 'running'; done: number; total: number }
  | { name: 'results'; result: MappingResult }
  | { name: 'failed' };

export default function MappingScreen() {
  const theme = useTheme();
  const [tripTypeId, setTripTypeId] = useState<TripTypeId>('fromWork');
  const [settings, setSettings] = useState<MappingSettings>(defaultSettings('fromWork'));
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [saved, setSaved] = useState<SavedRoutes>(NO_ROUTES);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRare, setShowRare] = useState(false);
  const [addingVia, setAddingVia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const tripType = TRIP_TYPES[tripTypeId];
  const times = useMemo(
    () => timesInWindow(settings.start, settings.end, SEARCH_STEP_MINUTES),
    [settings.start, settings.end],
  );

  // Read again on return from building an alternative, so that it counts as saved.
  useFocusEffect(
    useCallback(() => {
      loadRoutes().then(setSaved);
    }, []),
  );

  useEffect(() => {
    setSettings(defaultSettings(tripTypeId));
    loadMappingSettings(tripTypeId).then(setSettings);
  }, [tripTypeId]);

  const changeSettings = useCallback(
    (next: MappingSettings) => {
      setSettings(next);
      saveMappingSettings(tripTypeId, next).catch((error) => log.error(error, { where: 'saveMappingSettings' }));
    },
    [tripTypeId],
  );

  const savedKeys = useMemo(
    () => new Set(saved.alternatives.filter((a) => a.tripType === tripTypeId).map((a) => a.key)),
    [saved, tripTypeId],
  );

  const config = useMemo(
    () => ({ tripType, date: nextWeekday(new Date()), times, viaStops: settings.viaStops }),
    [tripType, times, settings.viaStops],
  );

  const start = useCallback(async () => {
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
          result.alternatives.filter((a) => (hadSaved ? savedKeys.has(a.key) : !a.rare)).map((a) => a.key),
        ),
      );
      setShowRare(false);
      setPhase({ name: 'results', result });
    } catch (error) {
      log.error(error, { where: 'mapping' });
      setPhase({ name: 'failed' });
    }
  }, [config, savedKeys]);

  /** Searches once more through one stop, adds what it finds, and remembers the stop for next time. */
  const searchVia = useCallback(
    async (previous: MappingResult, stop: StopRef) => {
      setPhase({ name: 'running', done: 0, total: times.length });
      const result = await extendWithVia(previous, config, stop, {
        search: searchTrips,
        onProgress: (done, total) => setPhase({ name: 'running', done, total }),
      });
      const before = new Set(previous.alternatives.map((a) => a.key));
      setSelected((current) => {
        const next = new Set(current);
        for (const a of result.alternatives) if (!before.has(a.key) && !a.rare) next.add(a.key);
        return next;
      });
      if (!settings.viaStops.some((s) => s.id === stop.id)) {
        changeSettings({ ...settings, viaStops: [...settings.viaStops, { id: stop.id, name: stop.name }] });
      }
      setPhase({ name: 'results', result });
    },
    [config, times.length, settings, changeSettings],
  );

  const toggle = useCallback((key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const save = useCallback(
    async ({ alternatives: found, transferWalks }: MappingResult) => {
      if (saving) return;
      setSaving(true);
      setSaveFailed(false);
      try {
        // What is saved now is read again when saving, so nothing added meanwhile is lost.
        await saveMapping(tripTypeId, {
          found,
          chosen: selected,
          connections: connectionsFor(found.filter((a) => selected.has(a.key))),
          transferWalks,
        });
        leave();
      } catch (error) {
        log.error(error, { where: 'save_mapping' });
        setSaveFailed(true);
        setSaving(false);
      }
    },
    [saving, selected, tripTypeId],
  );

  const secondary = { color: theme.textSecondary };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title={
          phase.name === 'results'
            ? `${phase.result.alternatives.length} alternativer funnet`
            : 'Kartlegg alternativer'
        }
      />

      {phase.name === 'setup' && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TripTypeSwitch value={tripTypeId} onChange={setTripTypeId} />

          <Field label="Fra" value={tripType.from.name} />
          <Field label="Til" value={tripType.to.name} />

          <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
            <Text style={[styles.body, secondary]}>Tidsrom, hverdager</Text>
            <View style={styles.window}>
              <ClockField
                label="Fra klokken"
                value={settings.start}
                onChange={(start) => changeSettings({ ...settings, start })}
              />
              <Text style={[styles.body, secondary]}>–</Text>
              <ClockField
                label="Til klokken"
                value={settings.end}
                onChange={(end) => changeSettings({ ...settings, end })}
              />
            </View>
          </View>
          {times.length === 0 && (
            <Text style={[styles.label, { color: theme.marginMissed }]}>
              Tidsrommet må slutte etter at det begynner.
            </Text>
          )}

          <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
            <Text style={[styles.body, secondary]}>Søk også via</Text>
            <View style={styles.chips}>
              {settings.viaStops.map((stop) => (
                <Pressable
                  key={stop.id}
                  onPress={() =>
                    changeSettings({ ...settings, viaStops: settings.viaStops.filter((s) => s.id !== stop.id) })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Fjern ${stop.name}`}
                  style={[styles.chip, { borderColor: theme.border }]}>
                  <Text style={[styles.body, { color: theme.text }]}>{stop.name} ×</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setAddingVia((open) => !open)}
                accessibilityRole="button"
                style={[styles.chip, { borderColor: theme.border }]}>
                <Text style={[styles.body, { color: theme.text }]}>+ Holdeplass</Text>
              </Pressable>
            </View>
          </View>
          {addingVia && (
            <StopSearch
              placeholder="Søk etter holdeplass"
              autoFocus
              onSelect={(stop) => {
                if (!settings.viaStops.some((s) => s.id === stop.id)) {
                  changeSettings({ ...settings, viaStops: [...settings.viaStops, { id: stop.id, name: stop.name }] });
                }
                setAddingVia(false);
              }}
            />
          )}

          <Text style={[styles.body, secondary, { marginTop: Spacing.three }]}>
            Appen søker gjennom hele tidsrommet på flere måter: vanlig søk, med flere bytter, med mer gange,
            og på nytt uten de linjene som går igjen i forslagene. Til slutt slår den opp hvilke linjer som går
            på hver etappe. Bare det periodebilletten dekker er med: Skyss og tog.
          </Text>

          <Pressable
            onPress={start}
            disabled={times.length === 0}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: times.length ? theme.text : theme.textMuted }]}>
            <Text style={[styles.primaryText, { color: theme.background }]}>Start kartlegging</Text>
          </Pressable>
          <Text style={[styles.label, styles.center, { color: theme.textMuted }]}>
            Opptil {totalSearches({ times, viaStops: settings.viaStops })} søk hos Entur, pluss oppslag av
            linjene på hver etappe. Tar under ett minutt.
          </Text>
        </ScrollView>
      )}

      {phase.name === 'running' && (
        <View style={styles.content}>
          <Text style={[styles.body, secondary]}>
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
          <Text style={[styles.body, secondary]}>Fikk ikke kontakt med Entur. Ingen søk ga svar.</Text>
          <Pressable
            onPress={() => setPhase({ name: 'setup' })}
            accessibilityRole="button"
            style={[styles.secondaryButton, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Prøv igjen</Text>
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
          onSearchVia={(stop) => searchVia(phase.result, stop)}
          onBuild={() => router.push({ pathname: '/bygg', params: { tripType: tripTypeId } })}
          onSave={() => save(phase.result)}
          saving={saving}
          saveFailed={saveFailed}
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

interface ClockFieldProps {
  label: string;
  value: string;
  onChange: (clock: string) => void;
}

/** A time of day. Text that is not a time is marked and left unsaved. */
function ClockField({ label, value, onChange }: ClockFieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const invalid = parseClock(draft) === null;

  useEffect(() => setDraft(value), [value]);

  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        const clock = parseClock(text);
        if (clock && text.trim().length >= 4) onChange(clock);
      }}
      onBlur={() => setDraft(parseClock(draft) ?? value)}
      keyboardType="numbers-and-punctuation"
      accessibilityLabel={label}
      style={[styles.clock, { color: theme.text, borderColor: invalid ? theme.marginMissed : theme.border }]}
    />
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
  onSearchVia: (stop: StopRef) => void;
  onBuild: () => void;
  onSave: () => void;
  saving: boolean;
  saveFailed: boolean;
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
  onSearchVia,
  onBuild,
  onSave,
  saving,
  saveFailed,
}: ResultsProps) {
  const theme = useTheme();
  const [searchingVia, setSearchingVia] = useState(false);
  const common = result.alternatives.filter((a) => !a.rare);
  const rare = result.alternatives.filter((a) => a.rare);
  const groups = groupAlternatives(common);
  // A search via a stop can give an alternative a new key, so only keys still in the list count.
  const selectedCount = result.alternatives.filter((a) => selected.has(a.key)).length;

  const row = (alternative: MappedAlternative) => {
    const checked = selected.has(alternative.key);
    const connectionText = describeConnections(alternative.connections, side, placeName);
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
            <Text style={[styles.group, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
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
            <Text style={[styles.group, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
              Sjeldnere forslag
            </Text>
            {rare.map(row)}
          </View>
        )}

        <View style={styles.more}>
          <Pressable
            onPress={() => setSearchingVia((open) => !open)}
            accessibilityRole="button"
            style={[styles.secondaryButton, styles.half, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Søk via holdeplass</Text>
          </Pressable>
          <Pressable
            onPress={onBuild}
            accessibilityRole="button"
            style={[styles.secondaryButton, styles.half, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Bygg selv</Text>
          </Pressable>
        </View>
        {searchingVia && (
          <View style={{ marginTop: Spacing.two }}>
            <StopSearch
              placeholder="Holdeplass reisen skal gå innom"
              autoFocus
              onSelect={(stop) => {
                setSearchingVia(false);
                onSearchVia(stop);
              }}
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.borderSoft, backgroundColor: theme.background }]}>
        {saveFailed && (
          <Text style={[styles.label, styles.center, { color: theme.marginMissed, marginBottom: Spacing.two }]}>
            Fikk ikke lagret. Prøv igjen.
          </Text>
        )}
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: saving ? theme.textMuted : theme.text, marginTop: 0 }]}>
          <Text style={[styles.primaryText, { color: theme.background }]}>
            {saving ? 'Lagrer …' : `Lagre ${selectedCount} valgte`}
          </Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five, gap: Spacing.one },
  center: { textAlign: 'center' },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  numbers: { fontVariant: ['tabular-nums'] },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  window: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  clock: {
    fontSize: FontSize.body,
    fontVariant: ['tabular-nums'],
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: 6,
    paddingVertical: 2,
    width: 58,
    textAlign: 'center',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: Spacing.one, flex: 1 },
  chip: {
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
  half: { flex: 1 },
  more: { flexDirection: 'row', gap: Spacing.two },
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
