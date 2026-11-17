import type { PlannedTrip, TripCard } from '@/engine/trips';
import { log, type LogProperties, type LogValue } from '@/logging/logger';
import type { StopRef, TripTypeId } from '@/model/types';
import type { OnBoardState } from '@/onboard/store';

/**
 * «Merk»: the flag button that saves a moment worth looking at later, with what
 * the app showed. One press sends `mark_created` at once; category and note are
 * optional and follow as `mark_noted` with the same `mark_id`.
 * See docs/design/merk-og-logg.md.
 */

/** The categories the user confirmed on 13 November 2026. */
export const MARK_CATEGORIES = ['Feil tid', 'Mangler alternativ', 'Uklart', 'Treg app', 'Idé'] as const;
export type MarkCategory = (typeof MARK_CATEGORIES)[number];

export type MarkScreen = 'before_departure' | 'on_board';

/**
 * The name of a stop, but not of the traveller's own places: home and work have
 * ids of the form `place:<id>` (see `placeRef`), and their names are addresses.
 */
export function publicStopName(stop: StopRef | null | undefined): string | null {
  return stop && !stop.id.startsWith('place:') ? stop.name : null;
}

/** One card as the screen showed it: vehicles, stops and times, never the traveller's own places. */
export function cardSnapshot(card: PlannedTrip | TripCard, best: boolean): LogValue {
  const trip = card;
  return {
    best,
    leaveAt: trip.leaveAt,
    departure: trip.departure.expected,
    departureAimed: trip.departure.aimed,
    departureMarking: trip.departureMarking.kind,
    arrival: trip.arrival,
    arrivalRealtime: trip.arrivalRealtime,
    alternatives: 'alternatives' in card ? card.alternatives.length : 0,
    rides: trip.rows.flatMap((row) =>
      row.kind === 'ride'
        ? [
            {
              line: row.line,
              mode: row.mode,
              destination: row.destination,
              from: publicStopName(row.from),
              fromPlatform: row.fromPlatform,
              to: publicStopName(row.to),
              toPlatform: row.toPlatform,
              departure: row.departure.expected,
              departureAimed: row.departure.aimed,
              arrival: row.arrival.expected,
              started: row.started,
              marginSeconds: row.transfer?.marginSeconds ?? null,
              marginStatus: row.transfer?.status ?? null,
            },
          ]
        : [],
    ),
    walkSeconds: trip.rows.flatMap((row) => (row.kind === 'walk' ? [row.seconds] : [])),
  };
}

export interface FrontPageView {
  tripType: TripTypeId;
  /** The plan on the screen, with the time it is for. */
  plan: { at: string; trips: TripCard[]; hidden: TripCard[] } | null;
  noRoutes: boolean;
  failed: boolean;
  showHidden: boolean;
}

/** What the front page shows at this moment. */
export function frontPageSnapshot(view: FrontPageView): LogProperties {
  const shown = view.plan?.trips ?? [];
  const hidden = view.plan?.hidden ?? [];
  return {
    screen: 'before_departure' satisfies MarkScreen,
    tripType: view.tripType,
    planAt: view.plan?.at ?? null,
    noRoutes: view.noRoutes,
    failed: view.failed,
    showHidden: view.showHidden,
    hiddenCards: hidden.length,
    cardList: [...shown, ...(view.showHidden ? hidden : [])].map((card, index) => cardSnapshot(card, index === 0)),
  };
}

/** What the on-board screen shows at this moment. */
export function onBoardSnapshot(state: OnBoardState, showHidden: boolean): LogProperties {
  const { session, plan, question } = state;
  const vehicle = plan?.vehicle ?? null;
  const cards = plan ? [...plan.trips, ...(showHidden ? plan.hidden : [])] : [];
  return {
    screen: 'on_board' satisfies MarkScreen,
    tripType: session.tripType,
    planAt: plan?.at ?? null,
    failed: state.failed,
    over: state.over,
    showHidden,
    hiddenCards: plan?.hidden.length ?? 0,
    session: {
      line: vehicle?.line ?? state.boarded.line,
      destination: vehicle?.destination ?? state.boarded.destination,
      serviceJourneyId: session.following.serviceJourneyId,
      date: session.following.date,
      boardedAt: vehicle?.boarding ? publicStopName(vehicle.boarding.stop) : null,
      gotOffAt: vehicle?.gotOff ? publicStopName(vehicle.gotOff.stop) : null,
      gotOff: Boolean(session.following.gotOffAt),
      started: vehicle?.started ?? null,
      live: vehicle?.live ?? null,
      answers: session.answers.length,
      question: question ? { kind: question.kind, stop: question.kind === 'gotOff' ? publicStopName(question.stop) : null } : null,
      planHolds: plan?.planHolds ?? null,
      planReason: plan?.planReason ?? null,
    },
    cardList: cards.map((card) => cardSnapshot(card, card === plan?.activePlan)),
  };
}

/** A short id that ties a note to its mark. Not secret and not tied to the user. */
export function newMarkId(now: Date = new Date()): string {
  return `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The press: saves the moment at once, before any sheet is shown. Returns the id the note will use. */
export function sendMark(snapshot: LogProperties, now: Date = new Date()): string {
  const markId = newMarkId(now);
  log.event('mark_created', { ...snapshot, markId, markedAt: now.toISOString() });
  return markId;
}

/** The optional category and note, from the sheet or later. Sends nothing when both are empty. */
export function sendMarkNote(markId: string, category: MarkCategory | null, note: string, now: Date = new Date()): boolean {
  const text = note.trim();
  if (!category && !text) return false;
  log.event('mark_noted', { markId, category, note: text || null, notedAt: now.toISOString() });
  return true;
}
