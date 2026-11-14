import { MISSED_GIVE_UP_SECONDS, MISSED_GRACE_SECONDS } from '@/core/transfer';
import type { Ride } from '@/engine/rides';
import type { PlannedTrip } from '@/engine/trips';

/**
 * What is remembered about changes of vehicle from one look to the next, so
 * that a card does not come and go while a transfer hovers about being
 * missed. Plain data.
 */
export interface TransferMemory {
  /** The changes of vehicle the trips have shown, by the two vehicles and stops. */
  seen: string[];
  /**
   * The changes that were shown and then given up, being missed by more than
   * three minutes. They are not taken again until the forecast says they are caught.
   */
  removed: string[];
}

export const NO_TRANSFERS: TransferMemory = { seen: [], removed: [] };

interface Vehicle {
  serviceJourneyId: string;
  date: string;
}

/** Identifies one run of a vehicle. */
export const vehicleKey = (vehicle: Vehicle) => `${vehicle.serviceJourneyId}@${vehicle.date}`;

/** Identifies a change of vehicle by the two vehicles and the stops where one is left and the other boarded. */
export const transferKey = (from: Vehicle, fromStop: string, to: Vehicle, toStop: string) =>
  `${vehicleKey(from)}:${fromStop}>${vehicleKey(to)}:${toStop}`;

/** The changes of vehicle a trip makes. */
export function transfersOf(trip: PlannedTrip): string[] {
  const rides = trip.rows.flatMap((row) => (row.kind === 'ride' ? [row] : []));
  return rides.slice(1).map((row, index) => transferKey(rides[index], rides[index].to.id, row, row.from.id));
}

/**
 * The rule for which transfers are taken though the forecast says they are
 * missed, with what was remembered from the last look:
 *
 * - One missed by no more than a minute is taken, since it may yet be caught.
 * - One that was shown at the last look is taken until it is missed by more
 *   than three minutes, and is then given up. One that was not shown is not
 *   taken when it is missed by more than a minute, and there is nothing to give up.
 * - One that was given up is not taken again until it is caught, with nothing
 *   to spare or more. Between too late and on time, nothing changes.
 *
 * `allow` is the rule for the engine. `removed` gives, after the trips have
 * been worked out with it, the changes that are given up now. Those whose
 * vehicles are no longer there are forgotten.
 */
export function transfersThatMayBeCaught(memory: TransferMemory | null) {
  const seen = new Set(memory?.seen);
  const givenUp = new Set(memory?.removed);
  const removed = new Set(givenUp);
  const stillThere = new Set<string>();

  const allow = (from: Ride, to: Ride, marginSeconds: number): boolean => {
    if (marginSeconds >= 0) {
      if (removed.size) removed.delete(transferKey(from, from.alighting.stop.id, to, to.boarding.stop.id));
      return true;
    }
    if (seen.size === 0 && givenUp.size === 0) return marginSeconds >= -MISSED_GRACE_SECONDS;

    const key = transferKey(from, from.alighting.stop.id, to, to.boarding.stop.id);
    if (givenUp.has(key)) {
      stillThere.add(key);
      return false;
    }
    if (marginSeconds >= -MISSED_GRACE_SECONDS) return true;
    if (!seen.has(key)) return false;
    if (marginSeconds >= -MISSED_GIVE_UP_SECONDS) return true;
    removed.add(key);
    return false;
  };

  return {
    allow,
    removed: (): string[] => [...removed].filter((key) => !givenUp.has(key) || stillThere.has(key)),
  };
}
