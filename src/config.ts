/**
 * Entur asks every consumer to identify itself in the ET-Client-Name header,
 * as "company-application". Set EXPO_PUBLIC_ENTUR_CLIENT_NAME to your own value.
 */
export const ENTUR_CLIENT_NAME = process.env.EXPO_PUBLIC_ENTUR_CLIENT_NAME ?? 'privat-reiseapp';

export const ENTUR_JOURNEY_PLANNER_URL = 'https://api.entur.io/journey-planner/v3/graphql';

export const STOPS = {
  krokasskiftet: 'NSR:StopPlace:32541',
  birkelandsskiftet: 'NSR:StopPlace:58537',
  grana: 'NSR:StopPlace:29485',
  blomsterdalen: 'NSR:StopPlace:29492',
  kokstadskiftet: 'NSR:StopPlace:59582',
  bergenBusstasjon: 'NSR:StopPlace:30810',
  mohlenpris: 'NSR:StopPlace:30918',
  lagunen: 'NSR:StopPlace:59849',
  storavatnet: 'NSR:StopPlace:31984',
  kleppestoTerminal: 'NSR:StopPlace:30815',
  kleppestoBatkai: 'NSR:StopPlace:32539',
  strandkaiterminalen: 'NSR:StopPlace:59223',
} as const;

/** How often status screens refetch from Entur. */
export const REFRESH_INTERVAL_MS = 30_000;
