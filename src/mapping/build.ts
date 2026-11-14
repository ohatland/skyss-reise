import type { Leg } from '@/model/types';

/**
 * Adds a leg to an alternative being built by hand. A walk is added with the stop
 * the traveller searched for, since Entur's walking answer names no stop that
 * trips use. When the ride after it is found, the walk is made to end where that
 * ride starts, so that saved legs always use the stops from Entur's trips and
 * the chain meets the legs saved from mapping runs.
 */
export function appendLeg(legs: Leg[], leg: Leg): Leg[] {
  const last = legs[legs.length - 1];
  if (leg.kind === 'transit' && last?.kind === 'walk' && last.to.id !== leg.from.id) {
    return [...legs.slice(0, -1), { ...last, to: leg.from }, leg];
  }
  return [...legs, leg];
}
