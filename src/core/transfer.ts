import { secondsBetween } from '@/core/time';

/** Above this the transfer time is shown green. At or below it, yellow. */
export const COMFORTABLE_MARGIN_SECONDS = 180;

/**
 * A transfer that is missed by less than this stays on the card in red,
 * since it may still be caught. Beyond it the card moves to the next departure.
 */
export const MISSED_GRACE_SECONDS = 60;

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
