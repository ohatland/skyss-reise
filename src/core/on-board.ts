import { firstRide, placeName } from '@/core/front-page';
import type { PlannedTrip, TripRow } from '@/engine/trips';
import type { OnBoardPlan } from '@/onboard/follow';
import type { Boarded, Question } from '@/onboard/session';
import type { FollowedVehicle } from '@/onboard/vehicle';

/**
 * The heading of the on-board screen: "Du er på 400 mot Bergen busstasjon",
 * or "Du venter på Møhlenpris" while the traveller waits at a stop.
 */
export function onBoardHeading(vehicle: Pick<FollowedVehicle, 'line' | 'destination'> & { gotOff?: FollowedVehicle['gotOff'] }): string {
  if (vehicle.gotOff) return `Du venter på ${vehicle.gotOff.stop.name}`;
  return `Du er på ${vehicle.line} mot ${vehicle.destination}`;
}

/** The question as the traveller is asked it. */
export function questionText(question: Question): string {
  return question.kind === 'gotOff' ? `Gikk du av på ${question.stop.name}?` : `Er du på ${question.vehicle.line} nå?`;
}

/** "Fremme jobb", "Fremme Krokåsskiftet": the label above the arrival time of a card on board. */
export function arrivalLabel(trip: PlannedTrip): string {
  return `Fremme ${placeName(trip.to)}`;
}

/**
 * The rows of a card on board: every row after the vehicle the traveller is
 * on, which is the first of the trip and not shown.
 */
export function rowsOnBoard(trip: PlannedTrip): TripRow[] {
  const own = trip.rows.findIndex((row) => row.kind === 'ride');
  return trip.rows.slice(own + 1);
}

/** One card as the on-board screen lays it out. */
export interface OnBoardCard {
  trip: PlannedTrip;
  /** The active plan, which stands out only by a faint background. */
  best: boolean;
  /** "Fremme {sted}" above the arrival. */
  showLabel: boolean;
  /** "Rute", "Holdeplass" and "Overgangstid" above the table. */
  showColumnHeadings: boolean;
}

/**
 * The cards on board in order: the plan first, the others by arrival, and,
 * when asked for, those more than half an hour after the plan. Column
 * headings stand on the first card only. "Fremme {sted}" stands on the first
 * card when every card ends at the same place, and on every card otherwise.
 */
export function onBoardCards(plan: Pick<OnBoardPlan, 'trips' | 'hidden' | 'activePlan'>, showHidden: boolean): OnBoardCard[] {
  const trips = showHidden ? [...plan.trips, ...plan.hidden] : plan.trips;
  const everyCard = new Set(trips.map(arrivalLabel)).size > 1;
  return trips.map((trip, index) => ({
    trip,
    best: trip === plan.activePlan,
    showLabel: index === 0 || everyCard,
    showColumnHeadings: index === 0,
  }));
}

/**
 * True when the traveller has got off at a stop with no saved way on from it.
 * The screen then offers «Avslutt reisen», as the user decided on 14 November 2026.
 */
export function strandedAtStop(plan: Pick<OnBoardPlan, 'vehicle' | 'trips' | 'hidden'>): boolean {
  return Boolean(plan.vehicle?.gotOff) && plan.trips.length === 0 && plan.hidden.length === 0;
}

/**
 * What the screen says in place of cards when there are none, or null when
 * there are cards to show.
 */
export function noCardsText(plan: Pick<OnBoardPlan, 'vehicle' | 'trips' | 'hidden'>): string | null {
  if (!plan.vehicle) return 'Fant ikke turen hos Entur.';
  if (plan.trips.length > 0 || plan.hidden.length > 0) return null;
  if (plan.vehicle.gotOff) return `Ingen lagrede reiser videre fra ${plan.vehicle.gotOff.stop.name}.`;
  return 'Ingen reiser videre akkurat nå.';
}

/**
 * What on board starts from when the traveller says they are on a card's
 * first vehicle: the vehicle, the stop where it is boarded, and its line and
 * destination for the heading until the first look. Null for a trip without a vehicle.
 */
export function boardingOf(trip: PlannedTrip): (Boarded & { line: string; destination: string }) | null {
  const ride = firstRide(trip);
  if (!ride) return null;
  const { serviceJourneyId, date, line, destination } = ride;
  return { serviceJourneyId, date, boardedAt: ride.from.id, line, destination };
}
