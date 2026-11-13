import { departureMarking } from '@/core/departure-marking';
import { formatClock, secondsBetween } from '@/core/time';

describe('formatClock', () => {
  it('shows Norwegian local time regardless of the offset in the timestamp', () => {
    expect(formatClock('2026-11-16T07:09:26+01:00')).toBe('07:09');
    expect(formatClock('2026-11-16T06:09:26Z')).toBe('07:09');
  });

  it('follows daylight saving time', () => {
    expect(formatClock('2026-07-01T06:09:00Z')).toBe('08:09');
  });

  it('uses a 24-hour clock', () => {
    expect(formatClock('2026-11-16T15:46:00+01:00')).toBe('15:46');
    expect(formatClock('2026-11-16T00:05:00+01:00')).toBe('00:05');
  });
});

describe('secondsBetween', () => {
  it('is negative when the second time is earlier', () => {
    expect(secondsBetween('2026-11-16T07:10:00+01:00', '2026-11-16T07:09:30+01:00')).toBe(-30);
  });
});

describe('departureMarking', () => {
  it('marks a departure without real-time data as scheduled', () => {
    expect(
      departureMarking({
        aimedTime: '2026-11-16T07:27:00+01:00',
        expectedTime: '2026-11-16T07:27:00+01:00',
        realtime: false,
      }),
    ).toEqual({ kind: 'scheduled' });
  });

  it('marks a real-time departure on schedule as realtime', () => {
    expect(
      departureMarking({
        aimedTime: '2026-11-16T07:05:00+01:00',
        expectedTime: '2026-11-16T07:05:40+01:00',
        realtime: true,
      }),
    ).toEqual({ kind: 'realtime' });
  });

  it('gives the scheduled clock when a real-time departure is late', () => {
    expect(
      departureMarking({
        aimedTime: '2026-11-16T07:07:00+01:00',
        expectedTime: '2026-11-16T07:09:26+01:00',
        realtime: true,
      }),
    ).toEqual({ kind: 'deviation', scheduledClock: '07:07' });
  });

  it('gives the scheduled clock when a real-time departure is early', () => {
    expect(
      departureMarking({
        aimedTime: '2026-11-16T07:07:00+01:00',
        expectedTime: '2026-11-16T07:06:10+01:00',
        realtime: true,
      }),
    ).toEqual({ kind: 'deviation', scheduledClock: '07:07' });
  });
});
