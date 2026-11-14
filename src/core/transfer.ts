import { secondsBetween } from '@/core/time';

/** Above this the transfer time is shown green. At or below it, yellow. */
export const COMFORTABLE_MARGIN_SECONDS = 180;

/**
 * A transfer that is missed by less than this is shown on a card in red,
 * since it may still be caught. Beyond it the card moves to the next departure.
 */
export const MISSED_GRACE_SECONDS = 60;

/**
 * A transfer that has been shown stays on its card, in red, until it is
 * missed by more than this. A forecast far ahead moves by more than a minute,
 * and a card that goes and then comes back is worse than one that stays red.
 */
export const MISSED_GIVE_UP_SECONDS = 180;

/**
 * The transfer time every change of the best trip should have. The traveller
 * put it as "an acceptable margin on the transfer (typically 1+ min)".
 */
export const PLAN_MIN_MARGIN_SECONDS = 60;

export type MarginStatus = 'good' | 'tight' | 'missed';

export interface TransferTimes {
  /** When the vehicle the traveller is on reaches the transfer stop. */
  arrival: string | Date;
  /** When the next vehicle leaves. */
  departure: string | Date;
  /** The traveller's own walking time between the two, in seconds. */
  walkSeconds: number;
}

/** Transfer time ("overgangstid"): what is left after walking, in seconds. */
export function transferMarginSeconds({ arrival, departure, walkSeconds }: TransferTimes): number {
  return secondsBetween(arrival, departure) - walkSeconds;
}

export function marginStatus(marginSeconds: number): MarginStatus {
  if (marginSeconds < 0) return 'missed';
  if (marginSeconds > COMFORTABLE_MARGIN_SECONDS) return 'good';
  return 'tight';
}

/** Whether a missed transfer should still be shown, in red, rather than replaced. */
export function isWithinMissedGrace(marginSeconds: number): boolean {
  return marginSeconds < 0 && marginSeconds >= -MISSED_GRACE_SECONDS;
}

/** "4:00", "22:12" or "−0:10". Seconds are only ever shown for transfer times. */
export function formatMargin(marginSeconds: number): string {
  const total = Math.round(Math.abs(marginSeconds));
  const sign = marginSeconds < 0 && total > 0 ? '−' : '';
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${sign}${minutes}:${String(seconds).padStart(2, '0')}`;
}
