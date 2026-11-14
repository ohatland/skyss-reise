import { sortLines } from '@/mapping/pattern';
import { walkKey, type Leg, type MappedAlternative, type TransitLeg } from '@/model/types';

/**
 * The lines Entur has riding directly on a stretch, by walkKey of its two stops.
 * A stretch is listed once it has been looked up, also when nothing was found.
 */
export type LegLines = Record<string, string[]>;

/** Minutes each lookup search covers, and so the distance between the searches. */
export const LOOKUP_WINDOW_MINUTES = 60;

const toMinutes = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
};

/** The start times to look lines up at: far enough apart that the searches cover the window without overlap. */
export function lookupTimes(times: string[]): string[] {
  const kept: string[] = [];
  for (const time of times) {
    const last = kept[kept.length - 1];
    if (!last || toMinutes(time) - toMinutes(last) >= LOOKUP_WINDOW_MINUTES) kept.push(time);
  }
  return kept;
}

function everyLeg(alternatives: MappedAlternative[]): Leg[] {
  return alternatives.flatMap((a) => [...a.legs, ...a.connections.flatMap((c) => c.legs)]);
}

/** Every stretch ridden in the alternatives or on the way to them, each pair of stops once. */
export function stretches(alternatives: MappedAlternative[]): TransitLeg[] {
  const byKey = new Map<string, TransitLeg>();
  for (const leg of everyLeg(alternatives)) {
    const key = walkKey(leg.from, leg.to);
    if (leg.kind === 'transit' && !byKey.has(key)) byKey.set(key, leg);
  }
  return [...byKey.values()];
}

/**
 * Gives every stretch the same lines wherever it is ridden: the ones seen on it
 * in any suggestion, and the ones looked up. Which lines a suggestion happened
 * to use says nothing about which lines run the stretch.
 */
export function withLegLines(alternatives: MappedAlternative[], legLines: LegLines): MappedAlternative[] {
  const lines = new Map<string, string[]>();
  for (const leg of everyLeg(alternatives)) {
    if (leg.kind !== 'transit') continue;
    const key = walkKey(leg.from, leg.to);
    lines.set(key, [...(lines.get(key) ?? legLines[key] ?? []), ...leg.lines]);
  }

  const fill = (legs: Leg[]): Leg[] =>
    legs.map((leg) =>
      leg.kind === 'transit' ? { ...leg, lines: sortLines(lines.get(walkKey(leg.from, leg.to)) ?? leg.lines) } : leg,
    );

  return alternatives.map((alternative) => ({
    ...alternative,
    legs: fill(alternative.legs),
    connections: alternative.connections.map((connection) => ({ ...connection, legs: fill(connection.legs) })),
  }));
}
