const osloParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

interface OsloFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

function osloFields(instant: Date): OsloFields {
  const parts = Object.fromEntries(osloParts.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  };
}

/** Minutes Norwegian time is ahead of UTC at the given instant: 60 in winter, 120 in summer. */
export function osloOffsetMinutes(instant: Date): number {
  const f = osloFields(instant);
  const asUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO timestamp with offset for a Norwegian wall-clock date (YYYY-MM-DD) and time (HH:MM). */
export function osloIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, hour - 1, minute));
  const offset = osloOffsetMinutes(guess);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${date}T${pad(hour)}:${pad(minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The first weekday after `now`, as a Norwegian calendar date (YYYY-MM-DD). */
export function nextWeekday(now: Date): string {
  let candidate = new Date(now.getTime());
  for (let i = 0; i < 7; i++) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    const f = osloFields(candidate);
    if (f.weekday !== 'Sat' && f.weekday !== 'Sun') {
      return `${f.year}-${pad(f.month)}-${pad(f.day)}`;
    }
  }
  throw new Error('No weekday found within a week');
}

/** Start times from `start` up to and including `end`, `stepMinutes` apart, as HH:MM. */
export function timesInWindow(start: string, end: string, stepMinutes: number): string[] {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const times: string[] = [];
  for (let t = toMinutes(start); t <= toMinutes(end); t += stepMinutes) {
    times.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return times;
}

/** "6:30" and "06:30" become "06:30". Null when the text is not a time of day. */
export function parseClock(text: string): string | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${match[2]}`;
}
