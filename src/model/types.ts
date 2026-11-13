/** A stop place in Entur's register, or one of the traveller's own places. */
export interface StopRef {
  /** NSR stop place id, or `place:<id>` for home and work. */
  id: string;
  name: string;
}

/** Where a trip starts or ends: an address the traveller walks to and from, or a stop. */
export interface Place {
  id: string;
  name: string;
  coordinates?: { latitude: number; longitude: number };
  stopPlaceId?: string;
}

export type TripTypeId = 'toWork' | 'fromWork';

export interface TripType {
  id: TripTypeId;
  label: string;
  from: Place;
  to: Place;
  /** The time of day the traveller normally makes this trip, as HH:MM. */
  window: { start: string; end: string };
}

export interface TransitLeg {
  kind: 'transit';
  from: StopRef;
  to: StopRef;
  /** Every line that runs this stretch and is equally good to take. */
  lines: string[];
  mode: string;
}

export interface WalkLeg {
  kind: 'walk';
  from: StopRef;
  to: StopRef;
  /** Entur's estimate of the walking time, until the traveller sets their own. */
  seconds?: number;
}

export type Leg = TransitLeg | WalkLeg;

/**
 * A saved way of making a trip: a chain of legs between stops. Where one end of
 * the trip is an address, the chain starts or ends at a stop near it (the anchor),
 * and how to get between the address and that stop is kept apart as connections.
 */
export interface Alternative {
  /** Identifies the chain of stops, independent of which lines run it. */
  key: string;
  tripType: TripTypeId;
  legs: Leg[];
}

/** A way between the traveller's address and a stop near it: walking, or a short ride. */
export interface Connection {
  key: string;
  tripType: TripTypeId;
  /** The stop where the connection meets the alternatives. */
  anchor: StopRef;
  legs: Leg[];
}

/** An alternative found by a mapping run, with what the run learned about it. */
export interface MappedAlternative extends Alternative {
  minDurationSeconds: number;
  maxDurationSeconds: number;
  transfers: number;
  timesFound: number;
  usesBoat: boolean;
  /** Heading it is listed under, by where the last vehicle is boarded. */
  group: string;
  /** Unusual enough to be folded away under "rarer suggestions". */
  rare: boolean;
  /** The stop near the address where this alternative starts or ends, if any. */
  anchor: StopRef | null;
  /** Every way found between the address and the anchor. */
  connections: Connection[];
}

export function placeRef(place: Place): StopRef {
  return { id: place.stopPlaceId ?? `place:${place.id}`, name: place.name };
}

/** Which end of the trip is an address the traveller walks to or from. */
export type PlaceSide = 'start' | 'end' | null;

export function placeSide(tripType: TripType): PlaceSide {
  if (!tripType.from.stopPlaceId) return 'start';
  if (!tripType.to.stopPlaceId) return 'end';
  return null;
}
