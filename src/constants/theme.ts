/**
 * Colours and sizes from the approved sketches in docs/design.
 * The margin colours in dark mode are approved as they are; the light ones were
 * strengthened after the first set was rejected for poor contrast.
 */

import '@/global.css';

export const Colors = {
  light: {
    background: '#ffffff',
    cardHighlight: '#f7f6f2',
    text: '#1f1f1e',
    textSecondary: '#5f5e5a',
    textMuted: '#888780',
    border: '#d3d1c7',
    borderSoft: '#e6e4dc',
    marginGood: '#15803d',
    marginTight: '#a16207',
    marginMissed: '#dc2626',
  },
  dark: {
    background: '#262624',
    cardHighlight: '#30302d',
    text: '#f1efe8',
    textSecondary: '#b4b2a9',
    textMuted: '#888780',
    border: '#4a4a46',
    borderSoft: '#3a3a37',
    marginGood: '#97c459',
    marginTight: '#ef9f27',
    marginMissed: '#f09595',
  },
} as const;

export type Theme = { readonly [K in keyof typeof Colors.light]: string };

/** Transfer times are semi-bold in light mode and medium in dark mode. */
export const MarginWeight = { light: '600', dark: '500' } as const;

export const FontSize = {
  label: 11,
  body: 13,
  margin: 16,
  heading: 16,
  time: 22,
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
} as const;

export const Radius = {
  control: 8,
  card: 12,
} as const;
