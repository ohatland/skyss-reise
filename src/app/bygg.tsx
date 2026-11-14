import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { leave, ScreenHeader } from '@/components/screen-header';
import { StopSearch } from '@/components/stop-search';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { nextWeekday } from '@/core/oslo-time';
import { useTheme } from '@/hooks/use-theme';
import { log } from '@/logging/logger';
import { appendLeg } from '@/mapping/build';
import { findDirectLeg, findWalkSeconds } from '@/mapping/direct';
import { anchorOf, chainKey, shortStopName } from '@/mapping/pattern';
import { searchTrips } from '@/mapping/query';
import { TRIP_TYPES } from '@/model/places';
import {
  placeRef,
  placeSide,
  type Connection,
  type Leg,
  type Place,
  type StopRef,
  type TripTypeId,
} from '@/model/types';
import { formatWalkTime } from '@/model/walks';
import { addAlternative, loadRoutes } from '@/storage/alternatives';

const asPlace = (stop: StopRef): Place => ({ id: stop.id, name: stop.name, stopPlaceId: stop.id });

/** Builds an alternative leg by leg, for routes a mapping run does not find. */
export default function BuildScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ tripType: TripTypeId }>();
  const tripType = TRIP_TYPES[params.tripType] ?? TRIP_TYPES.fromWork;
  const side = placeSide(tripType);
  const farEnd = side === 'end' ? tripType.from : tripType.to;

  const [legs, setLegs] = useState<Leg[]>([]);
  const [from, setFrom] = useState<StopRef | null>(null);
  const [to, setTo] = useState<StopRef | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const last = legs[legs.length - 1];
  const start = from ?? last?.to ?? null;
  const deps = { search: searchTrips, date: nextWeekday(new Date()) };

  const add = async (kind: 'transit' | 'walk') => {
    if (!start || !to) return;
    setBusy(true);
    setMessage(null);
    try {
      if (kind === 'transit') {
        const leg = await findDirectLeg(start, to, deps);
        if (!leg) {
          setMessage(`Entur fant ingen direkte rute fra ${shortStopName(start.name)} til ${shortStopName(to.name)}.`);
          return;
        }
        setLegs((current) => appendLeg(current, leg));
      } else {
        const seconds = await findWalkSeconds(asPlace(start), asPlace(to), deps);
        if (seconds === null) {
          setMessage(`Entur fant ingen gangvei fra ${shortStopName(start.name)} til ${shortStopName(to.name)}.`);
          return;
        }
        // The walk ends at the stop as searched for; appendLeg moves it to Entur's stop when the next ride is found.
        setLegs((current) => appendLeg(current, { kind: 'walk', from: start, to, seconds }));
      }
      setFrom(null);
      setTo(null);
    } catch (error) {
      log.error(error, { where: 'build_leg' });
      setMessage('Fikk ikke kontakt med Entur. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  const rides = legs.filter((leg) => leg.kind === 'transit');
  const complete =
    rides.length > 0 && legs[0].kind === 'transit' && last?.kind === 'transit';
  const reachesFarEnd =
    complete && (side === 'end' ? legs[0].from.id === farEnd.stopPlaceId : last.to.id === farEnd.stopPlaceId);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // An alternative that starts or ends at a stop nobody has walked to yet needs the walk as well.
      const connections: Connection[] = [];
      const anchor = anchorOf(legs, side);
      const place = side === 'end' ? tripType.to : tripType.from;
      const routes = await loadRoutes();
      const known = routes.connections.some((c) => c.tripType === tripType.id && c.anchor.id === anchor?.id);
      if (anchor && side && !known) {
        const seconds =
          side === 'start'
            ? await findWalkSeconds(place, asPlace(anchor), deps)
            : await findWalkSeconds(asPlace(anchor), place, deps);
        const walk: Leg =
          side === 'start'
            ? { kind: 'walk', from: placeRef(place), to: anchor, seconds: seconds ?? undefined }
            : { kind: 'walk', from: anchor, to: placeRef(place), seconds: seconds ?? undefined };
        connections.push({ key: `${anchor.id}|${chainKey([walk])}`, tripType: tripType.id, anchor, legs: [walk] });
      }
      await addAlternative({ key: chainKey(legs), tripType: tripType.id, legs }, connections);
      leave();
    } catch (error) {
      log.error(error, { where: 'build_save' });
      setMessage('Fikk ikke lagret. Prøv igjen.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScreenHeader title={`Bygg alternativ, ${tripType.label.toLowerCase()}`} />
      <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          Legg til etappene i rekkefølge. Appen slår opp hos Entur hvilke ruter som går direkte mellom to
          holdeplasser.
        </Text>

        {legs.length > 0 && (
          <View style={[styles.card, { borderColor: theme.border }]}>
            <View style={styles.tableRow}>
              <Text style={[styles.label, styles.lineColumn, { color: theme.textMuted }]}>Rute</Text>
              <Text style={[styles.label, styles.stretchColumn, { color: theme.textMuted }]}>Strekning</Text>
            </View>
            {legs.map((leg, index) => (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.body, styles.lineColumn, { color: theme.text, fontWeight: '500' }]}>
                  {leg.kind === 'walk' ? 'Gå' : leg.lines.join(', ')}
                </Text>
                <Text style={[styles.body, styles.stretchColumn, { color: theme.textSecondary }]}>
                  {shortStopName(leg.from.name)} → {shortStopName(leg.to.name)}
                  {leg.kind === 'walk' && leg.seconds !== undefined ? `, ${formatWalkTime(leg.seconds)}` : ''}
                </Text>
              </View>
            ))}
            <Pressable
              onPress={() => {
                setLegs((current) => current.slice(0, -1));
                setFrom(null);
                setTo(null);
                setMessage(null);
              }}
              disabled={busy}
              accessibilityRole="button"
              style={styles.undo}>
              <Text style={[styles.label, { color: busy ? theme.textMuted : theme.textSecondary }]}>
                Fjern siste etappe
              </Text>
            </Pressable>
          </View>
        )}

        <Text style={[styles.section, { color: theme.text, backgroundColor: theme.cardHighlight }]}>
          {legs.length === 0 ? 'Første etappe' : 'Neste etappe'}
        </Text>

        <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>Fra</Text>
          {start ? (
            <Pressable onPress={() => setFrom(null)} disabled={!from || busy} accessibilityRole="button">
              <Text style={[styles.body, { color: theme.text }]}>
                {shortStopName(start.name)}
                {from ? ' ×' : ''}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {!start && <StopSearch placeholder="Holdeplass du går på" onSelect={setFrom} />}

        <View style={[styles.field, { borderBottomColor: theme.borderSoft }]}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>Til</Text>
          {to ? (
            <Pressable
              onPress={() => setTo(null)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Velg en annen holdeplass">
              <Text style={[styles.body, { color: theme.text }]}>{shortStopName(to.name)} ×</Text>
            </Pressable>
          ) : null}
        </View>
        {start && !to && <StopSearch placeholder="Holdeplass du går av på" onSelect={setTo} />}

        {start && to && (
          <View style={styles.actions}>
            <Pressable
              onPress={() => add('transit')}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, styles.half, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>{busy ? 'Slår opp…' : 'Finn ruter'}</Text>
            </Pressable>
            <Pressable
              onPress={() => add('walk')}
              disabled={busy || legs.length === 0}
              accessibilityRole="button"
              style={[styles.button, styles.half, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: legs.length ? theme.text : theme.textMuted }]}>Gå hit</Text>
            </Pressable>
          </View>
        )}
        {message && <Text style={[styles.label, { color: theme.marginMissed, marginTop: Spacing.two }]}>{message}</Text>}

        {complete && !reachesFarEnd && (
          <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.four }]}>
            {side === 'end'
              ? `Starter ikke på ${farEnd.name}. Etappene kan likevel kombineres med de andre alternativene dine.`
              : `Slutter ikke på ${farEnd.name}. Etappene kan likevel kombineres med de andre alternativene dine.`}
          </Text>
        )}
        {legs.length > 0 && !complete && (
          <Text style={[styles.label, { color: theme.textMuted, marginTop: Spacing.four }]}>
            Et alternativ må begynne og slutte med en rute, ikke med gange.
          </Text>
        )}

        <Pressable
          onPress={save}
          disabled={!complete || busy}
          accessibilityRole="button"
          style={[styles.primary, { backgroundColor: complete && !busy ? theme.text : theme.textMuted }]}>
          <Text style={[styles.body, { color: theme.background, fontWeight: '500' }]}>Lagre alternativ</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  padded: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.five },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    gap: 6,
    marginTop: Spacing.three,
  },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  lineColumn: { width: 62 },
  stretchColumn: { flex: 1 },
  undo: { alignSelf: 'flex-end', paddingTop: Spacing.one },
  section: {
    fontSize: 12,
    fontWeight: '500',
    borderRadius: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    marginTop: Spacing.four,
    overflow: 'hidden',
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: 9,
    borderBottomWidth: 1,
    marginBottom: Spacing.two,
  },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  half: { flex: 1 },
  button: { borderWidth: 1, borderRadius: Radius.control, paddingVertical: Spacing.two, alignItems: 'center' },
  primary: { borderRadius: Radius.control, paddingVertical: 10, alignItems: 'center', marginTop: Spacing.five },
});
