import {
  formatMargin,
  isWithinMissedGrace,
  marginStatus,
  transferMarginSeconds,
} from '@/core/transfer';

describe('transferMarginSeconds', () => {
  it('subtracts walking time from the gap between arrival and departure', () => {
    expect(
      transferMarginSeconds({
        arrival: '2026-11-16T07:32:10+01:00',
        departure: '2026-11-16T07:36:40+01:00',
        walkSeconds: 30,
      }),
    ).toBe(240);
  });

  it('is negative when the next vehicle leaves before the traveller can reach it', () => {
    expect(
      transferMarginSeconds({
        arrival: '2026-11-16T07:45:10+01:00',
        departure: '2026-11-16T07:48:00+01:00',
        walkSeconds: 180,
      }),
    ).toBe(-10);
  });

  it('handles timestamps with different offsets', () => {
    expect(
      transferMarginSeconds({
        arrival: '2026-11-16T06:30:00Z',
        departure: '2026-11-16T07:35:00+01:00',
        walkSeconds: 0,
      }),
    ).toBe(300);
  });
});

describe('marginStatus', () => {
  it.each([
    [240, 'good'],
    [181, 'good'],
    [180, 'tight'],
    [70, 'tight'],
    [0, 'tight'],
    [-1, 'missed'],
    [-600, 'missed'],
  ] as const)('%d seconds is %s', (seconds, status) => {
    expect(marginStatus(seconds)).toBe(status);
  });
});

describe('isWithinMissedGrace', () => {
  it.each([
    [10, false],
    [0, false],
    [-10, true],
    [-60, true],
    [-61, false],
  ] as const)('%d seconds gives %s', (seconds, expected) => {
    expect(isWithinMissedGrace(seconds)).toBe(expected);
  });
});

describe('formatMargin', () => {
  it.each([
    [240, '4:00'],
    [190, '3:10'],
    [70, '1:10'],
    [5, '0:05'],
    [0, '0:00'],
    [1332, '22:12'],
    [-10, '−0:10'],
    [-75, '−1:15'],
    [239.6, '4:00'],
    [-0.2, '0:00'],
  ] as const)('%d seconds is shown as %s', (seconds, text) => {
    expect(formatMargin(seconds)).toBe(text);
  });
});
