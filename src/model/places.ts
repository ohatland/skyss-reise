import { STOPS } from '@/config';
import type { Place, StopRef, TripType, TripTypeId } from '@/model/types';

/** Work is an address, so that walking to and from the stops is part of the trip. */
export const WORK: Place = {
  id: 'work',
  name: 'Jobb',
  coordinates: { latitude: 60.283051, longitude: 5.242414 },
};

/** Home is the stop itself until a walking time from the door is set. */
export const HOME: Place = {
  id: 'home',
  name: 'Krokåsskiftet',
  stopPlaceId: STOPS.krokasskiftet,
};

export const TRIP_TYPES: Record<TripTypeId, TripType> = {
  toWork: {
    id: 'toWork',
    label: 'Til jobb',
    from: HOME,
    to: WORK,
    window: { start: '06:30', end: '08:30' },
  },
  fromWork: {
    id: 'fromWork',
    label: 'Fra jobb',
    from: WORK,
    to: HOME,
    window: { start: '14:30', end: '17:00' },
  },
};

/** Stops a mapping run is forced through, to surface routes Entur otherwise leaves out. */
export const DEFAULT_VIA_STOPS: StopRef[] = [
  { id: STOPS.strandkaiterminalen, name: 'Strandkaiterminalen' },
  { id: STOPS.kokstadskiftet, name: 'Kokstadskiftet' },
];
