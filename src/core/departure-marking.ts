import { formatClock } from '@/core/time';

/**
 * The small marking beside a departure time:
 * - deviation: real-time differs from the timetable; show the scheduled time struck through
 * - realtime: real-time data, on schedule
 * - scheduled: no real-time data
 */
export type DepartureMarking =
  | { kind: 'deviation'; scheduledClock: string }
  | { kind: 'realtime' }
  | { kind: 'scheduled' };

export interface DepartureTimes {
  aimedTime: string;
  expectedTime: string;
  realtime: boolean;
}

export function departureMarking({ aimedTime, expectedTime, realtime }: DepartureTimes): DepartureMarking {
  if (!realtime) return { kind: 'scheduled' };
  const scheduledClock = formatClock(aimedTime);
  if (scheduledClock !== formatClock(expectedTime)) {
    return { kind: 'deviation', scheduledClock };
  }
  return { kind: 'realtime' };
}
