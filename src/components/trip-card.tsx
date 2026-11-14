import { StyleSheet, Text, View } from 'react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import type { DepartureMarking } from '@/core/departure-marking';
import {
  boardingText,
  cardLabels,
  firstRide,
  missedTransferText,
  rowKey,
  startsWalking,
  typicalDelayText,
  walkMinutes,
  walkText,
} from '@/core/front-page';
import { arrivalLabel, rowsOnBoard } from '@/core/on-board';
import { formatClock } from '@/core/time';
import { formatMargin, type MarginStatus } from '@/core/transfer';
import type { PlannedTrip, RideRow, TripRow } from '@/engine/trips';
import { useTheme } from '@/hooks/use-theme';

type ThemeValues = ReturnType<typeof useTheme>;

interface Props {
  trip: PlannedTrip;
  /** The top card, which stands out only by a faint background. */
  best: boolean;
  /** "Avgang …" and "Fremme …" above the times. */
  showLabels: boolean;
  /** "Rute", "Holdeplass" and "Overgangstid" above the table. */
  showColumnHeadings: boolean;
  /**
   * On board, as in docs/design/om-bord.html: only the arrival, large, with
   * "Fremme …" above it, and the rows after the vehicle the traveller is on.
   */
  onBoard?: boolean;
}

/** One trip, laid out as in docs/design/for-avreise.html, or on board as in docs/design/om-bord.html. */
export function TripCard({ trip, best, showLabels, showColumnHeadings, onBoard = false }: Props) {
  const theme = useTheme();
  const walking = startsWalking(trip);
  const first = firstRide(trip);
  const typical = onBoard ? null : typicalDelayText(trip);
  const missed = missedTransferText(trip);
  const rows = onBoard ? rowsOnBoard(trip) : trip.rows;

  return (
    <View
      style={[styles.card, { borderColor: theme.border }, best && { backgroundColor: theme.cardHighlight }]}
      accessible
      accessibilityLabel={onBoard ? describeOnBoard(trip) : describe(trip)}>
      {onBoard ? (
        <>
          {showLabels && <Text style={[styles.label, { color: theme.textMuted }]}>{arrivalLabel(trip)}</Text>}
          <Text style={[styles.time, styles.arrival, { color: theme.text }]}>{formatClock(trip.arrival)}</Text>
        </>
      ) : (
        <BeforeDepartureTimes trip={trip} showLabels={showLabels} theme={theme} />
      )}

      {rows.length > 0 && (
        <View style={[styles.table, { borderTopColor: theme.borderSoft }]}>
          {showColumnHeadings && (
            <View style={styles.row}>
              <Text style={[styles.label, styles.route, { color: theme.textMuted }]}>Rute</Text>
              <Text style={[styles.label, styles.stop, { color: theme.textMuted }]}>Holdeplass</Text>
              <Text style={[styles.label, styles.right, { color: theme.textMuted }]}>Overgangstid</Text>
            </View>
          )}
          {rows.map((row, index) => (
            <Row key={rowKey(row, index)} row={row} departureUnder={!onBoard && walking && row === first} theme={theme} />
          ))}
        </View>
      )}

      {missed && <Text style={[styles.label, styles.typical, { color: theme.textMuted }]}>{missed}</Text>}
      {typical && <Text style={[styles.label, styles.typical, { color: theme.textMuted }]}>{typical}</Text>}
    </View>
  );
}

/** The two large times before departure: the start on the left, the arrival on the right. */
function BeforeDepartureTimes({ trip, showLabels, theme }: { trip: PlannedTrip; showLabels: boolean; theme: ThemeValues }) {
  const labels = cardLabels(trip);
  const walking = startsWalking(trip);
  return (
    <>
      {showLabels && (
        <View style={styles.spread}>
          <Text style={[styles.label, { color: theme.textMuted }]}>{labels.start}</Text>
          <Text style={[styles.label, { color: theme.textMuted }]}>{labels.end}</Text>
        </View>
      )}
      <View style={styles.spread}>
        {walking ? (
          <Text style={[styles.time, { color: theme.text }]}>{formatClock(trip.leaveAt!)}</Text>
        ) : (
          <View style={styles.baseline}>
            <Text style={[styles.time, { color: theme.text }]}>{formatClock(trip.departure.expected)}</Text>
            <BigMarking marking={trip.departureMarking} theme={theme} />
          </View>
        )}
        <Text style={[styles.time, styles.arrival, { color: theme.text }]}>{formatClock(trip.arrival)}</Text>
      </View>
    </>
  );
}

function Row({ row, departureUnder, theme }: { row: TripRow; departureUnder: boolean; theme: ThemeValues }) {
  if (row.kind === 'walk') {
    return (
      <View style={styles.row}>
        <Text style={[styles.body, styles.route, styles.strong, { color: theme.text }]}>Gå</Text>
        <Text style={[styles.body, styles.stop, { color: theme.textSecondary }]}>{walkText(row)}</Text>
        <Text style={[styles.body, styles.right, styles.numbers, { color: theme.textSecondary }]}>
          {walkMinutes(row.seconds)} min
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <Text style={[styles.body, styles.route, styles.strong, { color: theme.text }]}>{row.line}</Text>
      <View style={styles.stop}>
        <Text style={[styles.body, { color: theme.textSecondary }]}>{boardingText(row)}</Text>
        {departureUnder && <SmallDeparture row={row} theme={theme} />}
      </View>
      {row.transfer ? (
        <Text
          style={[
            styles.margin,
            styles.right,
            styles.numbers,
            { color: marginColor(row.transfer.status, theme), fontWeight: theme.marginWeight },
          ]}>
          {formatMargin(row.transfer.marginSeconds)}
        </Text>
      ) : (
        <View style={styles.right} />
      )}
    </View>
  );
}

/** The marking beside the large departure time: struck timetable time, "sanntid" or "rutetid". */
function BigMarking({ marking, theme }: { marking: DepartureMarking; theme: ThemeValues }) {
  if (marking.kind === 'deviation') {
    return <Text style={[styles.struck, styles.numbers, { color: theme.textMuted }]}>{marking.scheduledClock}</Text>;
  }
  return (
    <Text style={[styles.label, styles.besideTime, { color: theme.textMuted }]}>
      {marking.kind === 'realtime' ? 'sanntid' : 'rutetid'}
    </Text>
  );
}

/** "går 15:37, sanntid" under the stop, when the large time is when to leave the address. */
function SmallDeparture({ row, theme }: { row: RideRow; theme: ThemeValues }) {
  const clock = formatClock(row.departure.expected);
  return (
    <Text style={[styles.label, styles.numbers, { color: theme.textMuted }]}>
      går {clock}
      {row.marking.kind === 'deviation' ? (
        <>
          {' '}
          <Text style={styles.struckSmall}>{row.marking.scheduledClock}</Text>
        </>
      ) : row.marking.kind === 'realtime' ? (
        ', sanntid'
      ) : (
        ', rutetid'
      )}
    </Text>
  );
}

function marginColor(status: MarginStatus, theme: ThemeValues): string {
  if (status === 'good') return theme.marginGood;
  if (status === 'tight') return theme.marginTight;
  return theme.marginMissed;
}

/** One sentence for screen readers, since the card is read as a whole. */
function describe(trip: PlannedTrip): string {
  const { start, end } = cardLabels(trip);
  const startTime = formatClock(trip.leaveAt ?? trip.departure.expected);
  const rides = trip.rows
    .filter((row): row is RideRow => row.kind === 'ride')
    .map((row) =>
      row.transfer ? `${row.line} fra ${row.from.name}, overgangstid ${formatMargin(row.transfer.marginSeconds)}` : `${row.line} fra ${row.from.name}`,
    );
  const missed = missedTransferText(trip);
  return [`${start} ${startTime}`, `${end} ${formatClock(trip.arrival)}`, ...rides, ...(missed ? [missed] : [])].join('. ');
}

/** The same on board: the arrival, and the changes after the vehicle the traveller is on. */
function describeOnBoard(trip: PlannedTrip): string {
  const rides = rowsOnBoard(trip)
    .filter((row): row is RideRow => row.kind === 'ride')
    .map((row) => `${row.line} fra ${boardingText(row)}${row.transfer ? `, overgangstid ${formatMargin(row.transfer.marginSeconds)}` : ''}`);
  const missed = missedTransferText(trip);
  return [`${arrivalLabel(trip)} ${formatClock(trip.arrival)}`, ...rides, ...(missed ? [missed] : [])].join('. ');
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  baseline: { flexDirection: 'row', alignItems: 'baseline' },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  strong: { fontWeight: '500' },
  numbers: { fontVariant: ['tabular-nums'] },
  time: { fontSize: FontSize.time, lineHeight: 26, fontVariant: ['tabular-nums'] },
  arrival: { fontWeight: '500' },
  besideTime: { marginLeft: 6 },
  struck: { fontSize: FontSize.body, textDecorationLine: 'line-through', marginLeft: 6 },
  struckSmall: { textDecorationLine: 'line-through' },
  table: {
    marginTop: Spacing.two,
    paddingTop: 6,
    borderTopWidth: 1,
    gap: Spacing.half,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', columnGap: Spacing.two },
  route: { width: 36 },
  stop: { flex: 1, minWidth: 0 },
  right: { width: 76, textAlign: 'right' },
  margin: { fontSize: FontSize.margin, lineHeight: 20 },
  typical: { marginTop: 6 },
});
