const clockFormat = new Intl.DateTimeFormat('nb-NO', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Oslo',
});

/** "08:02" in Norwegian local time, for an ISO timestamp or a Date. */
export function formatClock(time: string | Date): string {
  const date = typeof time === 'string' ? new Date(time) : time;
  const parts = clockFormat.formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

/** Seconds from `from` to `to`; negative when `to` is earlier. */
export function secondsBetween(from: string | Date, to: string | Date): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 1000;
}
