import { osloIso } from '@/core/oslo-time';
import { log } from '@/logging/logger';
import { mergePatterns, mergeTransferWalks, toPattern, type TripPattern } from '@/mapping/pattern';
import type { TripPatternResponse, TripSearchParams } from '@/mapping/query';
import type { MappedAlternative, StopRef, TransferWalk, TripType } from '@/model/types';

export interface MappingConfig {
  tripType: TripType;
  /** Norwegian calendar date to search, YYYY-MM-DD. */
  date: string;
  /** Start times within the traveller's window, HH:MM. */
  times: string[];
  /** Stops the search is forced through in a pass of its own. */
  viaStops: StopRef[];
}

export interface MappingDeps {
  search: (params: TripSearchParams) => Promise<TripPatternResponse[]>;
  onProgress?: (done: number, total: number) => void;
  /** Searches running at once. */
  concurrency?: number;
}

export interface MappingResult {
  alternatives: MappedAlternative[];
  /** Entur's walking time at each transfer seen in the run. */
  transferWalks: TransferWalk[];
  /** Everything Entur suggested, kept so that a later search can add to it. */
  patterns: TripPattern[];
  searches: number;
  failedSearches: number;
  /** Lines the run chose to search without, as line ids. */
  bannedLines: string[];
}

type Variant = Omit<TripSearchParams, 'from' | 'to' | 'dateTime'>;

/** One ordinary search and two that let Entur keep routes it normally drops. */
const BASE_VARIANTS: Variant[] = [
  {},
  { maximumAdditionalTransfers: 3, transferPenalty: 0 },
  { walkReluctance: 1.5, maximumAdditionalTransfers: 2 },
];

/** How many of the most used lines the run searches without, cumulatively. */
const BANNED_LINE_PASSES = 2;

/**
 * The lines that dominate the suggestions so far, most used first. The vehicle
 * at an end of the trip that is a stop, not an address, is left out: every trip
 * shares that stop, and the line serving it is usually the only way there.
 * Home from work that is the last vehicle; to work, the first.
 */
export function dominantLines(patterns: TripPattern[], count: number, tripType: TripType): string[] {
  const spareFirst = Boolean(tripType.from.stopPlaceId);
  const spareLast = Boolean(tripType.to.stopPlaceId);
  const uses = new Map<string, number>();
  for (const pattern of patterns) {
    const ids = pattern.lineIds;
    for (const lineId of ids.slice(spareFirst ? 1 : 0, spareLast ? -1 : ids.length)) {
      uses.set(lineId, (uses.get(lineId) ?? 0) + 1);
    }
  }
  return [...uses.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([lineId]) => lineId);
}

/** The most searches a run makes. A pass that would repeat another is skipped, so it can be fewer. */
export function totalSearches(config: Pick<MappingConfig, 'times' | 'viaStops'>): number {
  return config.times.length * (BASE_VARIANTS.length + BANNED_LINE_PASSES + config.viaStops.length);
}

async function inParallel<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

/**
 * Finds as many ways of making the trip as it can: searches the whole window
 * several ways, then again without the lines that keep coming up, then through
 * each via stop. A failed search is skipped and counted, not fatal.
 */
export async function runMapping(config: MappingConfig, deps: MappingDeps): Promise<MappingResult> {
  const { tripType, date, times, viaStops } = config;
  let total = totalSearches(config);
  const patterns: TripPattern[] = [];
  let done = 0;
  let failed = 0;

  const runPass = async (variants: Variant[]) => {
    const tasks = variants.flatMap((variant) =>
      times.map((time) => async () => {
        try {
          const trips = await deps.search({
            from: tripType.from,
            to: tripType.to,
            dateTime: osloIso(date, time),
            ...variant,
          });
          for (const trip of trips) {
            const pattern = toPattern(trip, tripType.from, tripType.to);
            if (pattern) patterns.push(pattern);
          }
        } catch {
          failed++;
        }
        done++;
        deps.onProgress?.(done, total);
      }),
    );
    await inParallel(tasks, deps.concurrency ?? 3);
  };

  await runPass(BASE_VARIANTS);

  // With fewer dominant lines than passes, the passes left would repeat a search already made.
  const banned = dominantLines(patterns, BANNED_LINE_PASSES, tripType);
  total -= (BANNED_LINE_PASSES - banned.length) * times.length;
  deps.onProgress?.(done, total);
  await runPass(banned.map((_, i) => ({ bannedLines: banned.slice(0, i + 1) })));

  await runPass(viaStops.map((stop) => ({ viaStopPlaceId: stop.id })));

  const alternatives = patterns.length ? mergePatterns(patterns, tripType) : [];
  log.event('mapping_run', {
    tripType: tripType.id,
    searches: total,
    failed,
    patterns: patterns.length,
    alternatives: alternatives.length,
  });

  return {
    alternatives,
    transferWalks: mergeTransferWalks(patterns),
    patterns,
    searches: total,
    failedSearches: failed,
    bannedLines: banned,
  };
}

/**
 * Searches the window once more through one stop and adds what it finds to an
 * earlier result. For routes the run missed, such as one the traveller knows of.
 */
export async function extendWithVia(
  previous: MappingResult,
  config: MappingConfig,
  viaStop: StopRef,
  deps: MappingDeps,
): Promise<MappingResult> {
  const { tripType, date, times } = config;
  const patterns = [...previous.patterns];
  let done = 0;
  let failed = 0;

  const tasks = times.map((time) => async () => {
    try {
      const trips = await deps.search({
        from: tripType.from,
        to: tripType.to,
        dateTime: osloIso(date, time),
        viaStopPlaceId: viaStop.id,
      });
      for (const trip of trips) {
        const pattern = toPattern(trip, tripType.from, tripType.to);
        if (pattern) patterns.push(pattern);
      }
    } catch {
      failed++;
    }
    done++;
    deps.onProgress?.(done, times.length);
  });
  await inParallel(tasks, deps.concurrency ?? 3);

  log.event('mapping_via', { tripType: tripType.id, searches: times.length, failed });
  return {
    ...previous,
    alternatives: patterns.length ? mergePatterns(patterns, tripType) : [],
    transferWalks: mergeTransferWalks(patterns),
    patterns,
    searches: previous.searches + times.length,
    failedSearches: previous.failedSearches + failed,
  };
}
