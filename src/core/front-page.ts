import { osloOffsetMinutes } from '@/core/oslo-time';
import { formatClock } from '@/core/time';
import type { PlannedTrip, RideRow, TripRow, WalkRow } from '@/engine/trips';
import type { StopRef, TripTypeId } from '@/model/types';

/** Before this hour, Norwegian time, the app opens on "Til jobb"; from it, on "Fra jobb". */
export const TO_WORK_BEFORE_HOUR = 12;

/**
 * The trip type the front page opens on until the position is known: to work
 * in the morning, from work after noon.
 */
export function defaultTripType(now: Date): TripTypeId {
  const osloHour = new Date(now.getTime() + osloOffsetMinutes(now) * 60_000).getUTCHours();
  return osloHour < TO_WORK_BEFORE_HOUR ? 'toWork' : 'fromWork';
}

/** "jobb" for the traveller's own places, the stop's name otherwise. */
export function placeName(ref: StopRef): string {
  return ref.id.startsWith('place:') ? ref.name.toLowerCase() : ref.name;
}

/** The first vehicle of a trip. Every planned trip has one. */
export function firstRide(trip: PlannedTrip): RideRow | undefined {
  return trip.rows.find((row): row is RideRow => row.kind === 'ride');
}

/**
 * What the large time on the left is: when to leave the address ("Gå fra jobb"),
 * or the first vehicle's departure when the trip starts at a stop.
 */
export function startsWalking(trip: PlannedTrip): boolean {
  return trip.leaveAt !== null;
}

/** The small labels above the two large times of a card. */
export function cardLabels(trip: PlannedTrip): { start: string; end: string } {
  const start = startsWalking(trip)
    ? `Gå fra ${placeName(trip.from)}`
    : `Avgang ${firstRide(trip)?.from.name ?? placeName(trip.from)}`;
  return { start, end: `Fremme ${placeName(trip.to)}` };
}

/**
 * Whether the labels above the times go on every card: only when the cards
 * start or end at different places. Otherwise they stand on the first card.
 */
export function labelsOnEveryCard(trips: PlannedTrip[]): boolean {
  const labels = new Set(trips.map((trip) => JSON.stringify(cardLabels(trip))));
  return labels.size > 1;
}

/** Whole minutes for a walk, at least one. Seconds are only shown for transfer times. */
export function walkMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

/** The middle column of a walking row: "til Grana", "fra Blomsterdalen", "fra Grana til Birkelandsskiftet". */
export function walkText(row: WalkRow): string {
  if (row.position === 'start') return `til ${placeName(row.to)}`;
  if (row.position === 'end') return `fra ${placeName(row.from)}`;
  return `fra ${placeName(row.from)} til ${placeName(row.to)}`;
}

/** The stop a vehicle is boarded at, with its platform where there is one. */
export function boardingText(row: RideRow): string {
  return row.fromPlatform ? `${row.from.name}, plattform ${row.fromPlatform}` : row.from.name;
}

/** "Typisk fremme 6 min senere", or null when there is nothing to tell. */
export function typicalDelayText(trip: PlannedTrip): string | null {
  const minutes = trip.typicalArrivalDelay ? Math.round(trip.typicalArrivalDelay.p50Seconds / 60) : 0;
  return minutes > 0 ? `Typisk fremme ${minutes} min senere` : null;
}

/**
 * "Rekker du den ikke: fremme 08:29" for a trip with a transfer the forecast
 * says is missed: when the traveller is there by the next possible trip
 * onward. For the first such transfer of the trip. Null when no transfer is
 * missed, or there is no way on after it.
 */
export function missedTransferText(trip: PlannedTrip): string | null {
  for (const row of trip.rows) {
    if (row.kind === 'ride' && row.transfer?.status === 'missed') {
      return row.transfer.arrivalIfMissed ? `Rekker du den ikke: fremme ${formatClock(row.transfer.arrivalIfMissed)}` : null;
    }
  }
  return null;
}

/** A stable key for a row within its card. */
export function rowKey(row: TripRow, index: number): string {
  return row.kind === 'ride' ? `${row.serviceJourneyId}|${row.from.id}` : `walk|${row.from.id}|${row.to.id}|${index}`;
}
