import { shortStopName } from '@/mapping/pattern';
import type { Connection, Leg, MappedAlternative, PlaceSide } from '@/model/types';

/** "51, 50E → 23, 23E → 400, 410", with "Gå" for walking legs. */
export function describeChain(legs: Leg[]): string {
  return legs.map((leg) => (leg.kind === 'walk' ? 'Gå' : leg.lines.join(', '))).join(' → ');
}

/**
 * The stops that define the alternative: "Birkelandsskiftet · Møhlenpris".
 * Starting from an address, every boarding stop is named. Ending at one, the
 * transfer stops and the stop the traveller gets off at.
 */
export function describeStops(legs: Leg[], side: PlaceSide): string {
  const boarding = legs.map((leg) => leg.from.name);
  const names =
    side === 'start'
      ? boarding
      : side === 'end'
        ? [...boarding.slice(1), legs[legs.length - 1].to.name]
        : boarding.slice(1);
  return names.map(shortStopName).join(' · ');
}

/** "51–64 min · 2 bytter" */
export function describeStats(alternative: MappedAlternative): string {
  const min = Math.round(alternative.minDurationSeconds / 60);
  const max = Math.round(alternative.maxDurationSeconds / 60);
  const duration = min === max ? `${min} min` : `${min}–${max} min`;

  const { transfers } = alternative;
  const changes = transfers === 0 ? 'ingen bytter' : transfers === 1 ? '1 bytte' : `${transfers} bytter`;

  return `${duration} · ${changes}`;
}

/** One way between the address and the anchor stop: "gå 20 min", "57 fra Grana", "57 til Grana". */
export function describeConnection(connection: Connection, side: PlaceSide): string {
  const { legs } = connection;
  const rides = legs.flatMap((leg) => (leg.kind === 'transit' ? [leg] : []));

  if (rides.length === 0) {
    const seconds = legs.reduce((sum, leg) => sum + (leg.kind === 'walk' ? (leg.seconds ?? 0) : 0), 0);
    return seconds ? `gå ${Math.round(seconds / 60)} min` : 'gå';
  }

  const parts = rides.map((ride) =>
    side === 'end'
      ? `${ride.lines.join(', ')} til ${shortStopName(ride.to.name)}`
      : `${ride.lines.join(', ')} fra ${shortStopName(ride.from.name)}`,
  );
  const walksOn = side === 'start' && legs[legs.length - 1].kind === 'walk';
  return parts.join(', så ') + (walksOn ? ', så gå' : '');
}

/** "Fra jobb: gå 20 min · 57 fra Grana", or null when the alternative has no connections. */
export function describeConnections(
  alternative: MappedAlternative,
  side: PlaceSide,
  placeName: string,
): string | null {
  if (!side || alternative.connections.length === 0) return null;
  const ways = alternative.connections.map((c) => describeConnection(c, side)).join(' · ');
  return `${side === 'start' ? 'Fra' : 'Til'} ${placeName.toLowerCase()}: ${ways}`;
}
