import type { TripPatternResponse, TripPlaceResponse } from '@/mapping/query';
import {
  placeRef,
  placeSide,
  type Connection,
  type Leg,
  type MappedAlternative,
  type Place,
  type PlaceSide,
  type QuayRef,
  type StopRef,
  type TransferWalk,
  type TripType,
  walkKey,
} from '@/model/types';

/** A walk between two stops shorter than this is a platform change, not a leg of its own. */
const MIN_WALK_LEG_METERS = 250;

/** One suggestion from Entur, reduced to the chain of stops it follows. */
export interface TripPattern {
  key: string;
  legs: Leg[];
  /** Line id per transit leg, in order, for deciding which lines to search without. */
  lineIds: string[];
  durationSeconds: number;
  /** Walking at each change of vehicle that has no walking leg of its own. */
  transfers: TransferWalk[];
}

function stopOf(place: TripPlaceResponse): StopRef | null {
  const stop = place.quay?.stopPlace;
  return stop ? { id: stop.id, name: stop.name } : null;
}

function quayOf(place: TripPlaceResponse): QuayRef | null {
  const stop = stopOf(place);
  if (!place.quay || !stop) return null;
  return { id: place.quay.id, platform: place.quay.publicCode || null, stop };
}

/** Identifies a chain of legs by the stops it passes, independent of line. */
export function chainKey(legs: Leg[]): string {
  return legs.map((leg) => `${leg.kind === 'walk' ? 'w' : 't'}:${leg.from.id}>${leg.to.id}`).join('|');
}

/** Reduces a suggestion to its pattern, or null when it has no transit leg at all. */
export function toPattern(trip: TripPatternResponse, from: Place, to: Place): TripPattern | null {
  const origin = placeRef(from);
  const destination = placeRef(to);
  const legs: Leg[] = [];
  const lineIds: string[] = [];
  const transfers: TransferWalk[] = [];
  let arrivedAt: QuayRef | null = null;
  let arrivedOn = '';
  let walkedSeconds = 0;

  trip.legs.forEach((leg, index) => {
    const start = stopOf(leg.fromPlace) ?? (index === 0 ? origin : null);
    const end = stopOf(leg.toPlace) ?? (index === trip.legs.length - 1 ? destination : null);
    if (!start || !end) return;

    if (leg.mode === 'foot') {
      const touchesPlace = start.id === origin.id || end.id === destination.id;
      const betweenStops = leg.distance > MIN_WALK_LEG_METERS;
      if (start.id !== end.id && (touchesPlace || betweenStops)) {
        legs.push({ kind: 'walk', from: start, to: end, seconds: leg.duration });
        arrivedAt = null;
      } else {
        walkedSeconds += leg.duration;
      }
      return;
    }

    if (!leg.line) return;
    const line = leg.line.publicCode ?? '';
    const boardsAt = quayOf(leg.fromPlace);
    if (arrivedAt && boardsAt) {
      transfers.push({
        key: walkKey(arrivedAt, boardsAt),
        from: arrivedAt,
        to: boardsAt,
        fromLines: [arrivedOn],
        toLines: [line],
        seconds: walkedSeconds,
      });
    }
    arrivedAt = quayOf(leg.toPlace);
    arrivedOn = line;
    walkedSeconds = 0;
    lineIds.push(leg.line.id);
    legs.push({
      kind: 'transit',
      from: start,
      to: end,
      lines: [line],
      mode: leg.mode,
    });
  });

  if (!legs.some((leg) => leg.kind === 'transit')) return null;

  return { key: chainKey(legs), legs, lineIds, durationSeconds: trip.duration, transfers };
}

/** Sorts line codes the way a timetable does: 23, 23E, 50E, 400. */
export function sortLines(lines: Iterable<string>): string[] {
  return [...new Set(lines)].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (Number.isNaN(na) !== Number.isNaN(nb)) return Number.isNaN(na) ? 1 : -1;
    if (na !== nb && !Number.isNaN(na)) return na - nb;
    return a.localeCompare(b, 'nb');
  });
}

export function shortStopName(name: string): string {
  return name.replace(/ (terminal|båtkai)$/, '');
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Merges chains that share a key: lines are collected per leg, walking times averaged. */
function mergeLegs(same: Leg[][]): Leg[] {
  return same[0].map((leg, index) => {
    if (leg.kind === 'walk') {
      const seconds = same
        .map((legs) => legs[index])
        .flatMap((other) => (other.kind === 'walk' && other.seconds !== undefined ? [other.seconds] : []));
      return seconds.length ? { ...leg, seconds: Math.round(median(seconds)) } : leg;
    }
    const lines = same.flatMap((legs) => {
      const other = legs[index];
      return other.kind === 'transit' ? other.lines : [];
    });
    return { ...leg, lines: sortLines(lines) };
  });
}

function groupOf(legs: Leg[], usesBoat: boolean): string {
  if (usesBoat) return 'Med båt';
  const transit = legs.filter((leg) => leg.kind === 'transit');
  if (transit.length < 2) return 'Uten bytte';
  return `Via ${shortStopName(transit[transit.length - 1].from.name)}`;
}

/**
 * Stops the traveller walks straight to from the address, or straight from to it.
 * An alternative is anchored at one of these.
 */
function anchorStops(patterns: TripPattern[], side: PlaceSide): Set<string> {
  const anchors = new Set<string>();
  for (const { legs } of patterns) {
    if (side === 'start' && legs[0].kind === 'walk') anchors.add(legs[0].to.id);
    if (side === 'end' && legs[legs.length - 1].kind === 'walk') anchors.add(legs[legs.length - 1].from.id);
  }
  return anchors;
}

interface Split {
  /** The part between the anchor stop and the other end of the trip. */
  trunk: Leg[];
  /** The part between the address and the anchor stop; empty when there is none. */
  connection: Leg[];
}

/**
 * Cuts a pattern where it leaves the neighbourhood of the address: at the last
 * vehicle boarded at an anchor stop, or the first one alighted at one.
 */
function split(legs: Leg[], side: PlaceSide, anchors: Set<string>): Split {
  if (side === 'start') {
    let at = -1;
    legs.forEach((leg, index) => {
      if (leg.kind === 'transit' && anchors.has(leg.from.id)) at = index;
    });
    if (at > 0) return { connection: legs.slice(0, at), trunk: legs.slice(at) };
  }
  if (side === 'end') {
    const at = legs.findIndex((leg) => leg.kind === 'transit' && anchors.has(leg.to.id));
    if (at >= 0 && at < legs.length - 1) return { trunk: legs.slice(0, at + 1), connection: legs.slice(at + 1) };
  }
  return { trunk: legs, connection: [] };
}

/** The stop near the address where an alternative starts or ends. */
export function anchorOf(trunk: Leg[], side: PlaceSide): StopRef | null {
  if (side === 'start') return trunk[0].from;
  if (side === 'end') return trunk[trunk.length - 1].to;
  return null;
}

/** An alternative slower than the fastest by more than this factor is listed as rare. */
const RARE_DURATION_FACTOR = 1.5;
const RARE_TRANSFERS = 3;

/**
 * Turns everything a mapping run found into alternatives. Trips that differ only
 * in line, or only in how the traveller gets between the address and the first
 * or last stop, become one alternative; the ways to and from the address are
 * collected per stop as connections. Sorted by shortest travel time.
 */
export function mergePatterns(patterns: TripPattern[], tripType: TripType): MappedAlternative[] {
  const side = placeSide(tripType);
  const anchors = anchorStops(patterns, side);

  const trunks = new Map<string, { legs: Leg[][]; durations: number[] }>();
  const links = new Map<string, { anchor: StopRef; legs: Leg[][] }>();

  for (const pattern of patterns) {
    const { trunk, connection } = split(pattern.legs, side, anchors);
    const key = chainKey(trunk);
    const entry = trunks.get(key) ?? { legs: [], durations: [] };
    entry.legs.push(trunk);
    entry.durations.push(pattern.durationSeconds);
    trunks.set(key, entry);

    const anchor = anchorOf(trunk, side);
    if (connection.length && anchor) {
      // The same walk or ride can lead to two stops that share a terminal, so the
      // anchor is part of what identifies a connection.
      const linkKey = `${anchor.id}|${chainKey(connection)}`;
      const link = links.get(linkKey) ?? { anchor, legs: [] };
      link.legs.push(connection);
      links.set(linkKey, link);
    }
  }

  const connections: Connection[] = [...links.entries()]
    .map(([key, link]) => ({ key, tripType: tripType.id, anchor: link.anchor, legs: mergeLegs(link.legs) }))
    .sort((a, b) => a.legs.length - b.legs.length);

  const merged = [...trunks.entries()].map(([key, entry]): MappedAlternative => {
    const legs = mergeLegs(entry.legs);
    const usesBoat = legs.some((leg) => leg.kind === 'transit' && leg.mode === 'water');
    const anchor = anchorOf(legs, side);
    return {
      key,
      tripType: tripType.id,
      legs,
      minDurationSeconds: Math.min(...entry.durations),
      maxDurationSeconds: Math.max(...entry.durations),
      transfers: legs.filter((leg) => leg.kind === 'transit').length - 1,
      timesFound: entry.durations.length,
      usesBoat,
      group: groupOf(legs, usesBoat),
      rare: false,
      anchor,
      connections: anchor ? connections.filter((c) => c.anchor.id === anchor.id) : [],
    };
  });

  const fastest = Math.min(...merged.map((a) => a.minDurationSeconds));
  for (const alternative of merged) {
    const slow = !alternative.usesBoat && alternative.minDurationSeconds > fastest * RARE_DURATION_FACTOR;
    alternative.rare = slow || alternative.transfers > RARE_TRANSFERS;
  }

  return merged.sort((a, b) => a.minDurationSeconds - b.minDurationSeconds);
}

/** Entur's walking time at every transfer the run saw, one entry per pair of stops. */
export function mergeTransferWalks(patterns: TripPattern[]): TransferWalk[] {
  const byKey = new Map<string, TransferWalk[]>();
  for (const pattern of patterns) {
    for (const transfer of pattern.transfers) {
      const same = byKey.get(transfer.key);
      if (same) same.push(transfer);
      else byKey.set(transfer.key, [transfer]);
    }
  }
  return [...byKey.values()].map((same) => ({
    ...same[0],
    fromLines: sortLines(same.flatMap((t) => t.fromLines)),
    toLines: sortLines(same.flatMap((t) => t.toLines)),
    seconds: Math.round(median(same.map((t) => t.seconds))),
  }));
}

/** The connections the chosen alternatives need, each once. */
export function connectionsFor(alternatives: MappedAlternative[]): Connection[] {
  const byKey = new Map<string, Connection>();
  for (const alternative of alternatives) {
    for (const connection of alternative.connections) byKey.set(connection.key, connection);
  }
  return [...byKey.values()];
}

export interface AlternativeGroup {
  name: string;
  alternatives: MappedAlternative[];
}

/** Groups by where the last vehicle is boarded: fastest group first, the boat last. */
export function groupAlternatives(alternatives: MappedAlternative[]): AlternativeGroup[] {
  const groups: AlternativeGroup[] = [];
  for (const alternative of alternatives) {
    const group = groups.find((g) => g.name === alternative.group);
    if (group) group.alternatives.push(alternative);
    else groups.push({ name: alternative.group, alternatives: [alternative] });
  }
  return groups.sort((a, b) => Number(a.name === 'Med båt') - Number(b.name === 'Med båt'));
}
