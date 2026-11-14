import { osloIso } from '@/core/oslo-time';
import { log } from '@/logging/logger';
import { asPlace, linesBetween } from '@/mapping/direct';
import { LOOKUP_WINDOW_MINUTES, lookupTimes, stretches, withLegLines, type LegLines } from '@/mapping/lines';
import { mergePatterns, mergeTransferWalks, sortLines, toPattern, type TripPattern } from '@/mapping/pattern';
import type { TripPatternResponse, TripSearchParams } from '@/mapping/query';
import { walkKey, type MappedAlternative, type StopRef, type TransferWalk, type TripType } from '@/model/types';

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
  /** The lines looked up on each stretch, kept so that a later search only looks up new stretches. */
  legLines: LegLines;
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

/**
 * The most searches a run makes to find trips. A pass that would repeat another
 * is skipped, so it can be fewer. Looking up the lines on each stretch comes on
 * top, and how many searches that takes is not known until the trips are found.
 */
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

interface Progress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Looks up which lines ride directly on every stretch not looked up before, at
 * times spread through the window. The suggestions alone do not show it: a line
 * is missing from a stretch whenever no search happened to prefer it.
 * A stretch where every search failed is left to be looked up again later.
 */
async function lookUpLines(
  alternatives: MappedAlternative[],
  known: LegLines,
  { date, times }: Pick<MappingConfig, 'date' | 'times'>,
  deps: MappingDeps,
  progress: Progress,
): Promise<LegLines> {
  const todo = stretches(alternatives).filter((leg) => !(walkKey(leg.from, leg.to) in known));
  const at = lookupTimes(times);
  progress.total += todo.length * at.length;
  deps.onProgress?.(progress.done, progress.total);

  const found = new Map<string, string[]>();
  const tasks = todo.flatMap((leg) =>
    at.map((time) => async () => {
      const key = walkKey(leg.from, leg.to);
      try {
        const trips = await deps.search({
          from: asPlace(leg.from),
          to: asPlace(leg.to),
          dateTime: osloIso(date, time),
          searchWindowMinutes: LOOKUP_WINDOW_MINUTES,
        });
        found.set(key, [...(found.get(key) ?? []), ...linesBetween(trips, leg.from, leg.to)]);
      } catch {
        progress.failed++;
      }
      progress.done++;
      deps.onProgress?.(progress.done, progress.total);
    }),
  );
  await inParallel(tasks, deps.concurrency ?? 3);

  return { ...known, ...Object.fromEntries([...found].map(([key, lines]) => [key, sortLines(lines)])) };
}

/**
 * Finds as many ways of making the trip as it can: searches the whole window
 * several ways, then again without the lines that keep coming up, then through
 * each via stop. Last it looks up the lines on every stretch of what it found.
 * A failed search is skipped and counted, not fatal.
 */
export async function runMapping(config: MappingConfig, deps: MappingDeps): Promise<MappingResult> {
  const { tripType, date, times, viaStops } = config;
  const progress: Progress = { done: 0, total: totalSearches(config), failed: 0 };
  const patterns: TripPattern[] = [];

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
          progress.failed++;
        }
        progress.done++;
        deps.onProgress?.(progress.done, progress.total);
      }),
    );
    await inParallel(tasks, deps.concurrency ?? 3);
  };

  await runPass(BASE_VARIANTS);

  // With fewer dominant lines than passes, the passes left would repeat a search already made.
  const banned = dominantLines(patterns, BANNED_LINE_PASSES, tripType);
  progress.total -= (BANNED_LINE_PASSES - banned.length) * times.length;
  deps.onProgress?.(progress.done, progress.total);
  await runPass(banned.map((_, i) => ({ bannedLines: banned.slice(0, i + 1) })));

  await runPass(viaStops.map((stop) => ({ viaStopPlaceId: stop.id })));

  const merged = patterns.length ? mergePatterns(patterns, tripType) : [];
  const legLines = await lookUpLines(merged, {}, config, deps, progress);
  const alternatives = withLegLines(merged, legLines);
  log.event('mapping_run', {
    tripType: tripType.id,
    searches: progress.total,
    failed: progress.failed,
    patterns: patterns.length,
    alternatives: alternatives.length,
    stretches: Object.keys(legLines).length,
  });

  return {
    alternatives,
    transferWalks: mergeTransferWalks(patterns),
    patterns,
    searches: progress.total,
    failedSearches: progress.failed,
    bannedLines: banned,
    legLines,
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
  const progress: Progress = { done: 0, total: times.length, failed: 0 };

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
      progress.failed++;
    }
    progress.done++;
    deps.onProgress?.(progress.done, progress.total);
  });
  await inParallel(tasks, deps.concurrency ?? 3);

  const merged = patterns.length ? mergePatterns(patterns, tripType) : [];
  const legLines = await lookUpLines(merged, previous.legLines, config, deps, progress);

  log.event('mapping_via', { tripType: tripType.id, searches: progress.total, failed: progress.failed });
  return {
    ...previous,
    alternatives: withLegLines(merged, legLines),
    transferWalks: mergeTransferWalks(patterns),
    patterns,
    searches: previous.searches + progress.total,
    failedSearches: previous.failedSearches + progress.failed,
    legLines,
  };
}
