import { walkKey, type Connection, type Leg, type StopRef, type TransferWalk } from '@/model/types';

/** What is known about walking times: Entur's estimates and the traveller's own. */
export interface WalkTimes {
  transferWalks: TransferWalk[];
  /** The traveller's own times in seconds, by walk key. They apply wherever that walk occurs. */
  overrides: Record<string, number>;
}

/** One walk the traveller makes, with both times where they exist. */
export interface Walk {
  key: string;
  from: StopRef;
  to: StopRef;
  /** Platform letters, where the walk is between two platforms that have them. */
  fromPlatform: string | null;
  toPlatform: string | null;
  /** True when the next vehicle leaves from the very platform the traveller arrived at. */
  samePlatform: boolean;
  enturSeconds: number | null;
  ownSeconds: number | null;
}

/** A vehicle in an alternative, and the walks that can lead to it from the previous one. */
export interface VehicleRow {
  lines: string[];
  from: StopRef;
  to: StopRef;
  /**
   * Empty for the first vehicle. Usually one. Several where the lines of the two
   * legs use different platforms, so that the walk depends on which ones are taken.
   */
  walks: Walk[];
}

function betweenStops(from: StopRef, to: StopRef, enturSeconds: number | null, times: WalkTimes): Walk {
  const key = walkKey(from, to);
  return {
    key,
    from,
    to,
    fromPlatform: null,
    toPlatform: null,
    samePlatform: false,
    enturSeconds,
    ownSeconds: times.overrides[key] ?? null,
  };
}

function betweenPlatforms(transfer: TransferWalk, times: WalkTimes): Walk {
  return {
    key: transfer.key,
    from: transfer.from.stop,
    to: transfer.to.stop,
    fromPlatform: transfer.from.platform,
    toPlatform: transfer.to.platform,
    samePlatform: transfer.from.id === transfer.to.id,
    enturSeconds: transfer.seconds,
    ownSeconds: times.overrides[transfer.key] ?? null,
  };
}

/** The time to count on: the traveller's own if set, otherwise Entur's, otherwise none. */
export function effectiveSeconds(walk: Walk): number {
  return walk.ownSeconds ?? walk.enturSeconds ?? 0;
}

/**
 * The vehicles of an alternative, each with the walk before it: a walking leg of
 * its own where the stops are apart, otherwise every platform change the mapping
 * saw between the lines of the two legs. A transfer never seen gets one walk
 * without an estimate, so the traveller can still set a time for it.
 */
export function vehicleRows(legs: Leg[], times: WalkTimes): VehicleRow[] {
  const rows: VehicleRow[] = [];
  let arrivedAt: StopRef | null = null;
  let arrivedOn: string[] = [];
  let walked: Walk | null = null;
  const shares = (a: string[], b: string[]) => a.some((line) => b.includes(line));

  for (const leg of legs) {
    if (leg.kind === 'walk') {
      walked = betweenStops(leg.from, leg.to, leg.seconds ?? null, times);
      continue;
    }

    let walks: Walk[] = [];
    if (rows.length && walked) {
      walks = [walked];
    } else if (rows.length && arrivedAt) {
      const from = arrivedAt;
      const previousLines = arrivedOn;
      walks = times.transferWalks
        .filter((t) => t.from.stop.id === from.id && t.to.stop.id === leg.from.id)
        .filter((t) => shares(t.fromLines, previousLines) && shares(t.toLines, leg.lines))
        .map((t) => betweenPlatforms(t, times))
        .sort((a, b) => (a.enturSeconds ?? 0) - (b.enturSeconds ?? 0));
      if (walks.length === 0) walks = [betweenStops(from, leg.from, null, times)];
    }

    rows.push({ lines: leg.lines, from: leg.from, to: leg.to, walks });
    arrivedAt = leg.to;
    arrivedOn = leg.lines;
    walked = null;
  }
  return rows;
}

/** Every walk in the connections to or from the address, each once. */
export function connectionWalks(connections: Connection[], times: WalkTimes): Walk[] {
  const byKey = new Map<string, Walk>();
  for (const connection of connections) {
    for (const leg of connection.legs) {
      if (leg.kind !== 'walk') continue;
      const walk = betweenStops(leg.from, leg.to, leg.seconds ?? null, times);
      byKey.set(walk.key, walk);
    }
  }
  return [...byKey.values()];
}

/**
 * Tells apart the walks of one transfer: "Q → L" where the platforms have
 * letters, otherwise whether the traveller stays put or changes platform.
 * Null for a walk between two different stops, which needs no label.
 */
export function platformLabel(walk: Walk): string | null {
  if (walk.samePlatform) return 'samme plattform';
  if (walk.fromPlatform || walk.toPlatform) return `${walk.fromPlatform ?? '–'} → ${walk.toPlatform ?? '–'}`;
  return walk.from.id === walk.to.id ? 'annen plattform' : null;
}

/** "4:30" for 270 seconds. */
export function formatWalkTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Reads "4", "4:30" or "4.30" as minutes and seconds. Null when it is not a time. */
export function parseWalkTime(text: string): number | null {
  const match = /^\s*(\d{1,3})(?:[:.,](\d{1,2}))?\s*$/.exec(text);
  if (!match) return null;
  const seconds = match[2] ? Number(match[2]) : 0;
  if (seconds > 59) return null;
  return Number(match[1]) * 60 + seconds;
}
