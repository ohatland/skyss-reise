import { sortLines } from '@/mapping/pattern';
import { walkKey, type Leg, type StopRef, type TransferWalk } from '@/model/types';

/**
 * The saved alternatives as a network. The traveller saves whole chains, but the
 * app is free to combine their legs: a leg from one alternative can be followed
 * by a leg from another wherever they meet. That way every sensible combination
 * does not have to be saved as an alternative of its own.
 */
export interface Network {
  /** Every distinct leg, with the lines of all alternatives that use it. */
  legs: Leg[];
  /**
   * Pairs of different stops the traveller can change between without a walking
   * leg, such as the bus and light rail stops of one terminal. Keyed by walkKey.
   */
  links: Set<string>;
}

function legKey(leg: Leg): string {
  return `${leg.kind}:${walkKey(leg.from, leg.to)}`;
}

export function buildNetwork(chains: Leg[][], transferWalks: TransferWalk[] = []): Network {
  const byKey = new Map<string, Leg>();
  for (const leg of chains.flat()) {
    const key = legKey(leg);
    const known = byKey.get(key);
    if (known?.kind === 'transit' && leg.kind === 'transit') {
      byKey.set(key, { ...known, lines: sortLines([...known.lines, ...leg.lines]) });
    } else if (!known) {
      byKey.set(key, leg);
    }
  }

  const links = new Set<string>();
  for (const { from, to } of transferWalks) {
    if (from.stop.id !== to.stop.id) links.add(walkKey(from.stop, to.stop));
  }
  return { legs: [...byKey.values()], links };
}

export interface PathOptions {
  /** Most vehicles in one trip. */
  maxVehicles?: number;
}

/**
 * Every way through the network from one of the start stops to the goal. A stop
 * is never visited twice and two walks never follow each other, so the result is
 * finite and free of detours through the same place.
 */
export function findPaths(
  network: Network,
  starts: StopRef[],
  goal: StopRef,
  { maxVehicles = 5 }: PathOptions = {},
): Leg[][] {
  const paths: Leg[][] = [];

  const continuesFrom = (at: StopRef, leg: Leg) =>
    leg.from.id === at.id || network.links.has(walkKey(at, leg.from));

  const extend = (at: StopRef, path: Leg[], visited: Set<string>, vehicles: number) => {
    if (at.id === goal.id) {
      if (path.length) paths.push(path);
      return;
    }
    const last = path[path.length - 1];
    for (const leg of network.legs) {
      if (!continuesFrom(at, leg) || visited.has(leg.to.id)) continue;
      if (leg.kind === 'walk' && (!last || last.kind === 'walk')) continue;
      if (leg.kind === 'transit' && vehicles === maxVehicles) continue;
      extend(
        leg.to,
        [...path, leg],
        new Set([...visited, leg.from.id, leg.to.id]),
        vehicles + (leg.kind === 'transit' ? 1 : 0),
      );
    }
  };

  for (const start of starts) extend(start, [], new Set([start.id]), 0);
  return paths.filter((path) => path[path.length - 1].kind === 'transit');
}
