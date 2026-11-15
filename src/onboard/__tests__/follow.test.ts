import { formatClock } from '@/core/time';
import { formatMargin } from '@/core/transfer';
import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import type { PlannedTrip, Transfer } from '@/engine/trips';
import type { StopCall, StopCallsResponse } from '@/entur/calls';
import type { JourneyCall, JourneyCallsResponse } from '@/entur/journey';
import { setLogSinks } from '@/logging/logger';
import type { Alternative, Connection, StopRef } from '@/model/types';
import { silentTwin, vehicle } from '@/onboard/__fixtures__/vehicle';
import { firstVehicleOf, followVehicle, nextVehicleOf, planOnBoard, type OnBoardPlan, type PlanMemory } from '@/onboard/follow';
import type { Following } from '@/onboard/vehicle';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const grana = stop('Grana');
const birkelandsskiftet = stop('Birkelandsskiftet');
const adlandsflaten = stop('Ådlandsflaten');
const dolvik = stop('Dolvik');
const mohlenpris = stop('Møhlenpris');
const storavatnet = stop('Storavatnet');
const frieda = stop('Frieda Fasmer');
const blomsterdalen = stop('Blomsterdalen');
const busstasjonen = stop('Bergen busstasjon');
const festplassen = stop('Festplassen');

const clock = (time: string) => new Date(time).toISOString();

/** A card as the on board screen is to show it: the arrival, the table, and the line under it. */
function card(trip: PlannedTrip): string[] {
  const missed = trip.rows.flatMap((row) =>
    row.kind === 'ride' && row.transfer?.status === 'missed' && row.transfer.arrivalIfMissed
      ? [`Rekker du den ikke: fremme ${formatClock(row.transfer.arrivalIfMissed)}`]
      : [],
  );
  return [
    `Fremme ${formatClock(trip.arrival)}`,
    // The first row is the vehicle the traveller is on. It is in the heading, not in the table.
    ...trip.rows.slice(1).map((row) => {
      if (row.kind === 'walk') return `Gå ${row.position === 'end' ? `fra ${row.from.name}` : `til ${row.to.name}`} ${Math.round(row.seconds / 60)} min`;
      const where = row.fromPlatform ? `${row.from.name} ${row.fromPlatform}` : row.from.name;
      return `${row.line} ${where}${row.transfer ? ` ${formatMargin(row.transfer.marginSeconds)}` : ''}`;
    }),
    ...missed,
  ];
}

const heading = (plan: OnBoardPlan) => `Du er på ${plan.vehicle?.line} mot ${plan.vehicle?.destination}`;
const stopsAhead = (plan: OnBoardPlan) =>
  plan.vehicle?.stops.map((ahead) => `${ahead.stop.name} ${formatClock(ahead.arrival.expected)}`);

/** The transfers of a trip, in order. */
const transfers = (trip: PlannedTrip): Transfer[] =>
  trip.rows.flatMap((row) => (row.kind === 'ride' && row.transfer ? [row.transfer] : []));

beforeEach(() => setLogSinks([]));

describe('to work, on the first bus', () => {
  const alternatives: Alternative[] = [
    { key: 'frieda', tripType: 'toWork', legs: [ride('400, 410', krokasskiftet, frieda), ride('23E', frieda, dolvik), ride('51', dolvik, blomsterdalen)] },
    { key: 'mohlenpris', tripType: 'toWork', legs: [ride('400, 410', krokasskiftet, mohlenpris), ride('50E', mohlenpris, birkelandsskiftet)] },
    { key: 'storavatnet', tripType: 'toWork', legs: [ride('400, 410', krokasskiftet, storavatnet), ride('23', storavatnet, dolvik), ride('50E', dolvik, birkelandsskiftet)] },
    { key: 'busstasjonen', tripType: 'toWork', legs: [ride('400, 410', krokasskiftet, busstasjonen), ride('1', busstasjonen, birkelandsskiftet, 'tram')] },
  ];
  const connections: Connection[] = [
    { key: 'from-blomsterdalen', tripType: 'toWork', anchor: blomsterdalen, legs: [walk(blomsterdalen, work, 660)] },
    { key: 'from-birk', tripType: 'toWork', anchor: birkelandsskiftet, legs: [walk(birkelandsskiftet, work, 1200)] },
  ];
  const routes: SavedRoutes = { ...NO_ROUTES, alternatives, connections };
  const paths = tripPaths(routes, 'toWork');

  /** The 400 of the approved sketch: two minutes late from Krokåsskiftet, and at the bus station ten seconds after the light rail. */
  const the400 = (options: Parameters<typeof vehicle>[3] = { left: 1 }) =>
    vehicle(
      '400',
      '400',
      [
        [krokasskiftet, '07:07', { expected: '07:09' }],
        [storavatnet, '07:20', { platform: 'B' }],
        [frieda, '07:31'],
        [mohlenpris, '07:40'],
        [busstasjonen, '07:48', { expected: '07:50:10', platform: 'Q' }],
      ],
      options,
    );
  const tram = { transportMode: 'tram', realtime: false, started: false };
  const onward: StopCall[] = [
    ...journey('23E', '23E', [[frieda, '07:35'], [dolvik, '07:51:50', { platform: 'A' }]]),
    ...journey('51', '51', [[dolvik, '07:55', { platform: 'B' }], [blomsterdalen, '08:05']]),
    ...journey('50E-a', '50E', [[mohlenpris, '07:41:10'], [birkelandsskiftet, '08:13']]),
    ...journey('23', '23', [[storavatnet, '07:26:50', { platform: 'B' }], [dolvik, '07:43:30', { platform: 'A' }]]),
    ...journey('50E-b', '50E', [[dolvik, '07:45', { platform: 'B' }], [birkelandsskiftet, '08:17']]),
    ...journey('1-a', '1', [[busstasjonen, '07:50', { platform: 'A' }], [birkelandsskiftet, '08:24']], tram),
    ...journey('1-b', '1', [[busstasjonen, '07:55', { platform: 'A' }], [birkelandsskiftet, '08:29']], tram),
  ];
  const on400: Following = { serviceJourneyId: 'journey:400', date: '2026-11-16', boardedAt: krokasskiftet.id };
  const plan = (now: string, journeyCalls = the400(), calls = onward, following = on400) =>
    planOnBoard('toWork', paths, journeyCalls, calls, routes, new Date(at(now)), following);

  it('tells which vehicle the traveller is on, and when it is at each stop ahead where they can change', () => {
    const { vehicle: followed, at: moment, tripType } = plan('07:15');

    expect(heading(plan('07:15'))).toBe('Du er på 400 mot Bergen busstasjon');
    expect(tripType).toBe('toWork');
    expect(moment).toBe(clock(at('07:15')));
    expect(stopsAhead(plan('07:15'))).toEqual(['Storavatnet 07:20', 'Frieda Fasmer 07:31', 'Møhlenpris 07:40', 'Bergen busstasjon 07:50']);
    expect(followed).toMatchObject({ line: '400', mode: 'bus', started: true, live: true, precise: false, gotOff: null });
    expect(followed?.boarding).toMatchObject({
      stop: krokasskiftet,
      departure: { aimed: at('07:07'), expected: at('07:09'), actual: at('07:09') },
      passed: true,
    });
    // The forecast is Entur's, to the second.
    expect(followed?.stops[3].arrival).toEqual({ aimed: at('07:48'), expected: at('07:50:10'), actual: null });
    expect(followed?.route.map((visited) => visited.stop.name)).toEqual([
      'Krokåsskiftet',
      'Storavatnet',
      'Frieda Fasmer',
      'Møhlenpris',
      'Bergen busstasjon',
    ]);
  });

  it('gives every trip on to work as a card, by when the traveller is at work, with the transfer time of each change', () => {
    const { trips } = plan('07:15');

    expect(trips.map(card)).toEqual([
      ['Fremme 08:16', '23 Storavatnet B 6:50', '51 Dolvik B 11:30', 'Gå fra Blomsterdalen 11 min'],
      ['Fremme 08:33', '50E Møhlenpris 1:10', 'Gå fra Birkelandsskiftet 20 min'],
      ['Fremme 08:37', '23 Storavatnet B 6:50', '50E Dolvik B 1:30', 'Gå fra Birkelandsskiftet 20 min'],
      ['Fremme 08:44', '1 Bergen busstasjon A −0:10', 'Gå fra Birkelandsskiftet 20 min', 'Rekker du den ikke: fremme 08:49'],
    ]);
    // Two ways reach the same 51. They are one card, and the one with most to spare is it.
    expect(trips[0].alternatives.map(card)).toEqual([
      ['Fremme 08:16', '23E Frieda Fasmer 4:00', '51 Dolvik B 3:10', 'Gå fra Blomsterdalen 11 min'],
    ]);
    expect(trips.slice(1).map((trip) => trip.alternatives)).toEqual([[], [], []]);
    expect(trips.map((trip) => trip.to)).toEqual([work, work, work, work]);
  });

  it('has the vehicle the traveller is on as the first row of every trip, to where they get off it', () => {
    const { trips } = plan('07:15');
    const first = trips.map((trip) => trip.rows[0]);

    expect(first.map((row) => row.kind === 'ride' && `${row.line} ${row.from.name} → ${row.to.name}`)).toEqual([
      '400 Krokåsskiftet → Storavatnet',
      '400 Krokåsskiftet → Møhlenpris',
      '400 Krokåsskiftet → Storavatnet',
      '400 Krokåsskiftet → Bergen busstasjon',
    ]);
    expect(first.every((row) => row.kind === 'ride' && row.transfer === null)).toBe(true);
    expect(first[0]).toMatchObject({ serviceJourneyId: 'journey:400', date: '2026-11-16', marking: { kind: 'deviation', scheduledClock: '07:07' } });
  });

  it('shows a transfer missed by ten seconds in red, with when the traveller is there by the next departure', () => {
    const [, , , last] = plan('07:15').trips;
    expect(transfers(last)).toEqual([
      { marginSeconds: -10, status: 'missed', walkSeconds: 0, arrivalIfMissed: clock(at('08:49')) },
    ]);
  });

  it('no longer offers a stop the vehicle has left', () => {
    // The 400 has left Storavatnet and Frieda Fasmer.
    const later = plan('07:33', the400({ left: 3 }));
    expect(stopsAhead(later)).toEqual(['Møhlenpris 07:40', 'Bergen busstasjon 07:50']);
    expect(later.trips.map(card)).toEqual([
      ['Fremme 08:33', '50E Møhlenpris 1:10', 'Gå fra Birkelandsskiftet 20 min'],
      ['Fremme 08:44', '1 Bergen busstasjon A −0:10', 'Gå fra Birkelandsskiftet 20 min', 'Rekker du den ikke: fremme 08:49'],
    ]);
  });

  it('still offers the stop where the vehicle stands', () => {
    const standing = plan('07:31:10', the400({ left: 2, standing: true }));
    expect(stopsAhead(standing)).toEqual(['Frieda Fasmer 07:31', 'Møhlenpris 07:40', 'Bergen busstasjon 07:50']);
  });

  it('follows a vehicle that has not yet come to where the traveller boards, and does not offer that stop', () => {
    // The button on the front page is pressed while waiting at Krokåsskiftet.
    const waiting = plan('07:05', the400({ left: 0 }));
    expect(waiting.vehicle).toMatchObject({ started: false, live: false });
    expect(waiting.vehicle?.boarding).toMatchObject({ stop: krokasskiftet, passed: false });
    expect(stopsAhead(waiting)).toEqual(['Storavatnet 07:20', 'Frieda Fasmer 07:31', 'Møhlenpris 07:40', 'Bergen busstasjon 07:50']);
    expect(waiting.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 08:16', 'Fremme 08:33', 'Fremme 08:37', 'Fremme 08:44']);
  });

  it('follows the vehicle from its first stop when it is not told where the traveller boarded', () => {
    const unknown = plan('07:15', the400(), onward, { serviceJourneyId: 'journey:400', date: '2026-11-16' });
    expect(unknown.vehicle?.boarding).toBeNull();
    expect(unknown.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 08:16', 'Fremme 08:33', 'Fremme 08:37', 'Fremme 08:44']);

    const elsewhere = plan('07:15', the400(), onward, { ...on400, boardedAt: 'stop:Nowhere' });
    expect(elsewhere.vehicle?.boarding).toBeNull();
    expect(elsewhere.trips).toHaveLength(4);
  });

  it('takes the next departure when the one onward is cancelled, and drops the trip when there is none', () => {
    const cancel = (id: string) => onward.map((call) => (call.serviceJourneyId === `journey:${id}` ? { ...call, cancelled: true } : call));

    // Without the first light rail, the next one is the trip, with five minutes less ten seconds to spare.
    // It is there 33 minutes after the plan, and so is kept for "show more".
    expect(plan('07:15', the400(), cancel('1-a')).hidden.map(card)).toEqual([
      ['Fremme 08:49', '1 Bergen busstasjon A 4:50', 'Gå fra Birkelandsskiftet 20 min'],
    ]);
    // There is only one 50E from Møhlenpris.
    expect(plan('07:15', the400(), cancel('50E-a')).trips.map((trip) => card(trip)[0])).toEqual(['Fremme 08:16', 'Fremme 08:37', 'Fremme 08:44']);
  });

  it('does not offer a stop where the vehicle will not let the traveller off', () => {
    const skips = the400().map((call) => (call.stopPlaceId === mohlenpris.id ? { ...call, cancelled: true } : call));
    expect(stopsAhead(plan('07:15', skips))).toEqual(['Storavatnet 07:20', 'Frieda Fasmer 07:31', 'Bergen busstasjon 07:50']);

    const noAlighting = the400().map((call) => (call.stopPlaceId === mohlenpris.id ? { ...call, forAlighting: false } : call));
    expect(plan('07:15', noAlighting).trips.map((trip) => card(trip)[0])).toEqual(['Fremme 08:16', 'Fremme 08:37', 'Fremme 08:44']);
  });

  it('tells what a missed transfer costs by the next possible trip onward, whichever way that goes', () => {
    // From Birkelandsskiftet the 56 saves nine minutes of walking, when there is one.
    const withBus: SavedRoutes = {
      ...routes,
      connections: [
        ...connections,
        { key: 'bus-birk', tripType: 'toWork', anchor: birkelandsskiftet, legs: [ride('56', birkelandsskiftet, adlandsflaten), walk(adlandsflaten, work, 660)] },
      ],
    };
    const calls = [
      ...onward,
      ...journey('56-a', '56', [[birkelandsskiftet, '08:26'], [adlandsflaten, '08:31']]),
      ...journey('56-b', '56', [[birkelandsskiftet, '08:31'], [adlandsflaten, '08:36']]),
    ];
    const { trips } = planOnBoard('toWork', tripPaths(withBus, 'toWork'), the400({ left: 4 }), calls, withBus, new Date(at('07:45')), on400);

    // Walking and taking the 56 from the same light rail are one card. If that light rail is missed, the next one
    // with the next 56 is there at 08:47, before the next one and the walk at 08:49. Both trips say so. And since
    // the first light rail is forecast as missed, the trip by the next one is the plan, on top.
    expect(trips.map(card)).toEqual([
      ['Fremme 08:47', '1 Bergen busstasjon A 4:50', '56 Birkelandsskiftet 2:00', 'Gå fra Ådlandsflaten 11 min'],
      ['Fremme 08:42', '1 Bergen busstasjon A −0:10', '56 Birkelandsskiftet 2:00', 'Gå fra Ådlandsflaten 11 min', 'Rekker du den ikke: fremme 08:47'],
    ]);
    expect(trips[1].alternatives.map(card)).toEqual([
      ['Fremme 08:44', '1 Bergen busstasjon A −0:10', 'Gå fra Birkelandsskiftet 20 min', 'Rekker du den ikke: fremme 08:47'],
    ]);
  });

  it('shows the plan as the trip of its card, with a trip that is there sooner behind it', () => {
    // From Birkelandsskiftet the 56 saves nine minutes of walking, but leaves half a minute after the light rail is there.
    const withBus: SavedRoutes = {
      ...routes,
      alternatives: [alternatives[3]],
      connections: [
        connections[1],
        { key: 'bus-birk', tripType: 'toWork', anchor: birkelandsskiftet, legs: [ride('56', birkelandsskiftet, adlandsflaten), walk(adlandsflaten, work, 660)] },
      ],
    };
    const calls = [
      ...journey('1-b', '1', [[busstasjonen, '07:55', { platform: 'A' }], [birkelandsskiftet, '08:29']], tram),
      ...journey('56', '56', [[birkelandsskiftet, '08:29:30'], [adlandsflaten, '08:36']]),
    ];
    const followed = planOnBoard('toWork', tripPaths(withBus, 'toWork'), the400({ left: 4 }), calls, withBus, new Date(at('07:45')), on400);

    // Both trips end on the same light rail and are one card. The walk is the plan, and so the trip the card shows.
    expect(followed.trips.map(card)).toEqual([['Fremme 08:49', '1 Bergen busstasjon A 4:50', 'Gå fra Birkelandsskiftet 20 min']]);
    expect(followed.activePlan?.alternatives.map(card)).toEqual([
      ['Fremme 08:47', '1 Bergen busstasjon A 4:50', '56 Birkelandsskiftet 0:30', 'Gå fra Ådlandsflaten 11 min'],
    ]);
    expect(followed.planHolds).toBe('withMargin');
  });

  describe('on a vehicle without real-time data', () => {
    const blind = { realtime: false, started: false };

    it('counts on the timetable, and takes the stops whose time has come as left', () => {
      const scheduled = the400({ left: 0, ...blind }).map((call) => ({ ...call, expectedArrival: call.aimedArrival, expectedDeparture: call.aimedDeparture }));
      const followed = plan('07:25', scheduled);

      expect(followed.vehicle).toMatchObject({ started: false, live: false, precise: false });
      expect(stopsAhead(followed)).toEqual(['Frieda Fasmer 07:31', 'Møhlenpris 07:40', 'Bergen busstasjon 07:48']);
      // By the timetable the bus is at the bus station at 07:48, two minutes before the light rail.
      expect(followed.trips.map(card)).toEqual([
        ['Fremme 08:16', '23E Frieda Fasmer 4:00', '51 Dolvik B 3:10', 'Gå fra Blomsterdalen 11 min'],
        ['Fremme 08:33', '50E Møhlenpris 1:10', 'Gå fra Birkelandsskiftet 20 min'],
        ['Fremme 08:44', '1 Bergen busstasjon A 2:00', 'Gå fra Birkelandsskiftet 20 min'],
      ]);
      expect(followed.trips[0].rows[0]).toMatchObject({ started: false, marking: { kind: 'scheduled' } });
    });

    it('takes light rail and boat as exact', () => {
      const lightRail = vehicle('1-a', '1', [[busstasjonen, '07:50', { platform: 'A' }], [birkelandsskiftet, '08:24']], tram);
      const followed = plan('08:00', lightRail, [], { serviceJourneyId: 'journey:1-a', date: '2026-11-16', boardedAt: busstasjonen.id });

      expect(followed.vehicle).toMatchObject({ line: '1', mode: 'tram', live: false, precise: true });
      expect(followed.trips.map(card)).toEqual([['Fremme 08:44', 'Gå fra Birkelandsskiftet 20 min']]);
      expect(followed.trips[0].rows[0]).toMatchObject({ precise: true, started: false });
    });
  });

  describe('staying on the vehicle', () => {
    it('is one trip whether a saved leg runs all the way or two saved legs meet at a stop on the way', () => {
      const viaStoravatnet: SavedRoutes = {
        ...routes,
        alternatives: [
          alternatives[3],
          { key: 'change', tripType: 'toWork', legs: [ride('410', krokasskiftet, storavatnet), ride('400', storavatnet, busstasjonen), ride('1', busstasjonen, birkelandsskiftet, 'tram')] },
        ],
      };
      // What leaves the stops ahead includes the 400 itself.
      const calls = [...onward, ...the400().slice(1)];
      const followed = planOnBoard('toWork', tripPaths(viaStoravatnet, 'toWork'), the400(), calls, viaStoravatnet, new Date(at('07:15')), on400);

      // The trip by the next light rail is the plan. The one by the first, which may yet be caught, is listed once.
      expect(followed.trips.map(card)).toEqual([
        ['Fremme 08:49', '1 Bergen busstasjon A 4:50', 'Gå fra Birkelandsskiftet 20 min'],
        ['Fremme 08:44', '1 Bergen busstasjon A −0:10', 'Gå fra Birkelandsskiftet 20 min', 'Rekker du den ikke: fremme 08:49'],
      ]);
      expect(followed.trips.map((trip) => trip.alternatives)).toEqual([[], []]);
      expect(followed.trips[1].rows[0]).toMatchObject({ from: krokasskiftet, to: busstasjonen, transfer: null });
      // The 400 is not saved to Storavatnet, so there is nothing to change to there.
      expect(stopsAhead(followed)).toEqual(['Bergen busstasjon 07:50']);
    });

    it('is not what the traveller does when a transfer is missed, since the vehicle has left too', () => {
      const viaFestplassen: SavedRoutes = {
        ...routes,
        alternatives: [
          { key: 'short', tripType: 'toWork', legs: [ride('400', krokasskiftet, mohlenpris), ride('50E', mohlenpris, birkelandsskiftet)] },
          { key: 'long', tripType: 'toWork', legs: [ride('400', krokasskiftet, mohlenpris), ride('400', mohlenpris, festplassen), ride('1', festplassen, birkelandsskiftet, 'tram')] },
        ],
      };
      const bus = vehicle('400', '400', [[krokasskiftet, '07:09'], [mohlenpris, '07:40'], [festplassen, '07:43']], { left: 1 });
      const calls = [
        ...bus.slice(1),
        // The 50E leaves Møhlenpris twenty seconds before the 400 is there.
        ...journey('50E', '50E', [[mohlenpris, '07:39:40'], [birkelandsskiftet, '08:10']]),
        ...journey('1', '1', [[festplassen, '07:50'], [birkelandsskiftet, '08:20']], tram),
      ];
      const followed = planOnBoard('toWork', tripPaths(viaFestplassen, 'toWork'), bus, calls, viaFestplassen, new Date(at('07:15')), on400);

      // Staying on to Festplassen is the plan. The 50E, which may yet be caught, is there first.
      expect(followed.trips.map(card)).toEqual([
        ['Fremme 08:40', '1 Festplassen 7:00', 'Gå fra Birkelandsskiftet 20 min'],
        ['Fremme 08:30', '50E Møhlenpris −0:20', 'Gå fra Birkelandsskiftet 20 min'],
      ]);
      // Having got off for the 50E and missed it, the traveller is not on the 400 to Festplassen either.
      expect(transfers(followed.trips[1])[0].arrivalIfMissed).toBeNull();
    });
  });

  it('gives no trips for a vehicle that runs none of the saved legs, but still tells what it is', () => {
    const other = vehicle('999', '999', [[krokasskiftet, '07:09'], [mohlenpris, '07:40']], { left: 1 });
    const followed = plan('07:15', other, onward, { serviceJourneyId: 'journey:999', date: '2026-11-16', boardedAt: krokasskiftet.id });
    expect(heading(followed)).toBe('Du er på 999 mot Møhlenpris');
    expect(followed.vehicle?.stops).toEqual([]);
    expect(followed.trips).toEqual([]);

    // The 400 the other way calls at the same stops, but never at the second stop of a leg after its first.
    const back = vehicle('back', '400', [[busstasjonen, '07:00'], [mohlenpris, '07:10'], [krokasskiftet, '07:40']], { left: 1 });
    expect(plan('07:05', back, onward, { serviceJourneyId: 'journey:back', date: '2026-11-16' }).trips).toEqual([]);
  });

  it('gives no vehicle and no trips for a journey Entur does not know', () => {
    expect(plan('07:15', [])).toEqual({
      tripType: 'toWork',
      at: clock(at('07:15')),
      following: on400,
      vehicle: null,
      activePlan: null,
      planHolds: null,
      planReason: null,
      trips: [],
      hidden: [],
      memory: { held: null, seen: [], removed: [] },
    });
  });

  it('gives the vehicle of a card, and the next one, for the app to follow', () => {
    const [top] = plan('07:15').trips;
    expect(firstVehicleOf(top)).toEqual(on400);
    expect(nextVehicleOf(top, on400)).toEqual({
      following: { serviceJourneyId: 'journey:23', date: '2026-11-16', boardedAt: storavatnet.id },
      alightedAt: storavatnet,
    });
    expect(nextVehicleOf(top, { serviceJourneyId: 'journey:23', date: '2026-11-16' })).toEqual({
      following: { serviceJourneyId: 'journey:51', date: '2026-11-16', boardedAt: dolvik.id },
      alightedAt: dolvik,
    });
    // The 51 is the last vehicle, and the 50E is not in the trip.
    expect(nextVehicleOf(top, { serviceJourneyId: 'journey:51', date: '2026-11-16' })).toBeNull();
    expect(nextVehicleOf(top, { serviceJourneyId: 'journey:50E-a', date: '2026-11-16' })).toBeNull();
  });

  it('goes on from the next vehicle once the traveller is on it', () => {
    // On the 23 from Storavatnet, which has left.
    const the23 = vehicle('23', '23', [[storavatnet, '07:26:50', { platform: 'B' }], [dolvik, '07:43:30', { platform: 'A' }]], { left: 1 });
    const next = nextVehicleOf(plan('07:15').trips[0], on400);
    const followed = plan('07:30', the23, onward, next?.following);

    expect(heading(followed)).toBe('Du er på 23 mot Dolvik');
    expect(stopsAhead(followed)).toEqual(['Dolvik 07:43']);
    expect(followed.trips.map(card)).toEqual([
      ['Fremme 08:16', '51 Dolvik B 11:30', 'Gå fra Blomsterdalen 11 min'],
      ['Fremme 08:37', '50E Dolvik B 1:30', 'Gå fra Birkelandsskiftet 20 min'],
    ]);
  });

  it('is there with the walk alone on the last vehicle', () => {
    const the51 = vehicle('51', '51', [[dolvik, '07:55', { platform: 'B' }], [blomsterdalen, '08:05', { expected: '08:06:30' }]], { left: 1 });
    const followed = plan('08:00', the51, [], { serviceJourneyId: 'journey:51', date: '2026-11-16', boardedAt: dolvik.id });

    // 08:06:30 and eleven minutes. The clock shows whole minutes.
    expect(followed.trips.map(card)).toEqual([['Fremme 08:17', 'Gå fra Blomsterdalen 11 min']]);
    expect(followed.trips[0].arrival).toBe(clock(at('08:17:30')));
    expect(followed.trips[0].arrivalRealtime).toBe(true);
  });
});

describe('from work, changing at Møhlenpris', () => {
  const alternatives: Alternative[] = [
    { key: 'mohlenpris', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)] },
  ];
  const connections: Connection[] = [
    { key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] },
    { key: 'bus-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, grana, 240), ride('57', grana, birkelandsskiftet)] },
  ];
  // Crossing the road at Møhlenpris takes 2:32.
  const routes: SavedRoutes = {
    ...NO_ROUTES,
    alternatives,
    connections,
    transferWalks: [transferWalk(mohlenpris, 'N', mohlenpris, 'S', 152)],
  };
  const paths = tripPaths(routes, 'fromWork');

  /** The 50E: left Birkelandsskiftet, and forecast at Møhlenpris at the given clock. It goes on to the bus station. */
  const the50E = (expected = '15:58:10', options: Parameters<typeof vehicle>[3] = { left: 1 }) =>
    vehicle(
      '50E',
      '50E',
      [
        [birkelandsskiftet, '15:30', { platform: 'D' }],
        [mohlenpris, '15:57', { expected, platform: 'N' }],
        [busstasjonen, '16:05'],
      ],
      options,
    );
  /** A bus home from the other side of the road at Møhlenpris. */
  const home = (id: string, departs: string, arrives: string, options: Partial<StopCall> = {}) =>
    journey(id, '410', [[mohlenpris, departs, { platform: 'S' }], [krokasskiftet, arrives]], options);
  const next = home('next', '16:20', '16:53');

  const on50E: Following = { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id };
  const plan = (now: string, journeyCalls: JourneyCall[], calls: StopCall[], following = on50E) =>
    planOnBoard('fromWork', paths, journeyCalls, calls, routes, new Date(at(now)), following);
  /** The cards when the bus home leaves Møhlenpris at the given clock, with a later one behind it. */
  const leaving = (departs: string, later = next) => plan('15:40', the50E(), [...home('a', departs, '16:35'), ...later]).trips;
  /** The trip by the next bus home, 19:18 after the 50E. Where the first one is too tight, it is the plan, on top. */
  const byTheNext = ['Fremme 16:53', '410 Møhlenpris S 19:18'];

  it('has the transfer time left after walking, in seconds', () => {
    // 15:58:10 to 16:02:30 is 260 seconds, less 152 to cross the road.
    const [trip] = leaving('16:02:30');
    expect(card(trip)).toEqual(['Fremme 16:35', '410 Møhlenpris S 1:48']);
    expect(transfers(trip)).toEqual([{ marginSeconds: 108, status: 'tight', walkSeconds: 152, arrivalIfMissed: clock(at('16:53')) }]);
    expect(trip.to).toEqual(krokasskiftet);
  });

  it('is green above three minutes and yellow at three', () => {
    expect(transfers(leaving('16:03:43')[0])[0]).toMatchObject({ marginSeconds: 181, status: 'good' });
    expect(transfers(leaving('16:03:42')[0])[0]).toMatchObject({ marginSeconds: 180, status: 'tight' });
  });

  it('makes a transfer with nothing to spare, in yellow', () => {
    const [, trip] = leaving('16:00:42');
    expect(transfers(trip)[0]).toMatchObject({ marginSeconds: 0, status: 'tight' });
    expect(leaving('16:00:42').map(card)).toEqual([byTheNext, ['Fremme 16:35', '410 Møhlenpris S 0:00']]);
  });

  it('keeps a transfer missed by a second, in red, with when the next departure is there', () => {
    const [, trip] = leaving('16:00:41');
    expect(transfers(trip)[0]).toEqual({ marginSeconds: -1, status: 'missed', walkSeconds: 152, arrivalIfMissed: clock(at('16:53')) });
    expect(leaving('16:00:41').map(card)).toEqual([byTheNext, ['Fremme 16:35', '410 Møhlenpris S −0:01', 'Rekker du den ikke: fremme 16:53']]);
  });

  it('keeps a transfer missed by 59 seconds, and by a minute', () => {
    expect(leaving('15:59:43').map(card)).toEqual([byTheNext, ['Fremme 16:35', '410 Møhlenpris S −0:59', 'Rekker du den ikke: fremme 16:53']]);
    expect(leaving('15:59:42').map(card)).toEqual([byTheNext, ['Fremme 16:35', '410 Møhlenpris S −1:00', 'Rekker du den ikke: fremme 16:53']]);
  });

  it('moves to the next departure when the transfer is missed by 61 seconds', () => {
    // 15:58:10 to 16:20:00 is 1310 seconds, less 152.
    expect(leaving('15:59:41').map(card)).toEqual([byTheNext]);
  });

  it('has no trip left when the last departure onward is missed by 61 seconds', () => {
    expect(leaving('15:59:41', [])).toEqual([]);
    // Within the minute it stays, with nothing to tell about a next departure.
    expect(leaving('15:59:42', []).map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris S −1:00']]);
  });

  it('goes from green to yellow to red, and then to the next departure, as the vehicle falls behind', () => {
    const calls = [...home('a', '16:01:40', '16:35'), ...next];
    const as = (expected: string) => plan('15:40', the50E(expected), calls).trips.map(card);

    expect(as('15:55:38')).toEqual([['Fremme 16:35', '410 Møhlenpris S 3:30']]);
    expect(transfers(plan('15:40', the50E('15:55:38'), calls).trips[0])[0].status).toBe('good');
    expect(as('15:58:08')).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:00']]);
    expect(transfers(plan('15:40', the50E('15:58:08'), calls).trips[0])[0].status).toBe('tight');
    // Once it is red, the trip by the next bus is the plan, on top.
    expect(as('15:59:38')).toEqual([
      ['Fremme 16:53', '410 Møhlenpris S 17:50'],
      ['Fremme 16:35', '410 Møhlenpris S −0:30', 'Rekker du den ikke: fremme 16:53'],
    ]);
    expect(as('16:00:08')).toEqual([
      ['Fremme 16:53', '410 Møhlenpris S 17:20'],
      ['Fremme 16:35', '410 Møhlenpris S −1:00', 'Rekker du den ikke: fremme 16:53'],
    ]);
    expect(as('16:00:09')).toEqual([['Fremme 16:53', '410 Møhlenpris S 17:19']]);
  });

  it('counts with the next vehicle being late too', () => {
    // The bus home is forecast two minutes late, which gives the traveller the time.
    const late = journey('a', '410', [[mohlenpris, '15:59', { expected: '16:01', platform: 'S' }], [krokasskiftet, '16:33', { expected: '16:36' }]]);
    expect(plan('15:40', the50E(), late).trips.map(card)).toEqual([['Fremme 16:36', '410 Møhlenpris S 0:18']]);
  });

  it('counts with the time the traveller has set for the walk before the one from Entur', () => {
    const quick: SavedRoutes = { ...routes, walkOverrides: { 'quay:Møhlenpris:N>quay:Møhlenpris:S': 60 } };
    const { trips } = planOnBoard('fromWork', paths, the50E(), home('a', '16:00:41', '16:35'), quick, new Date(at('15:40')), on50E);
    expect(trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:31']]);
  });

  it('skips a departure onward that is cancelled', () => {
    const calls = [...home('a', '16:02:30', '16:35', { cancelled: true }), ...next];
    expect(plan('15:40', the50E(), calls).trips.map(card)).toEqual([['Fremme 16:53', '410 Møhlenpris S 19:18']]);
    expect(plan('15:40', the50E(), home('a', '16:02:30', '16:35', { cancelled: true })).trips).toEqual([]);
  });

  describe('at the last stop of the journey', () => {
    /** A 50E that ends at Møhlenpris. */
    const ending = (options: Parameters<typeof vehicle>[3]) =>
      vehicle('50E', '50E', [[birkelandsskiftet, '15:30', { platform: 'D' }], [mohlenpris, '15:57', { expected: '15:58:10', platform: 'N' }]], options);
    const calls = [...home('a', '16:02:30', '16:35'), ...next];

    it('changes there as at any other stop', () => {
      const followed = plan('15:40', ending({ left: 1 }), calls);
      expect(stopsAhead(followed)).toEqual(['Møhlenpris 15:58']);
      expect(followed.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:48']]);
    });

    it('still offers the stop when the vehicle is there and goes no further, counting from when it arrived', () => {
      // Entur has measured the arrival at 15:58:40, half a minute after its last forecast.
      const arrived = ending({ left: 1, standing: true }).map((call) =>
        call.stopPlaceId === mohlenpris.id ? { ...call, actualArrival: at('15:58:40') } : call,
      );
      const followed = plan('16:00', arrived, calls);

      expect(followed.vehicle?.stops.map((ahead) => ahead.passed)).toEqual([false]);
      expect(followed.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:18']]);
    });

    it('is there when the last stop is where the trip ends', () => {
      const the410 = vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35', { expected: '16:37:20' }]], { left: 1 });
      const followed = plan('16:10', the410, [], { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });

      expect(heading(followed)).toBe('Du er på 410 mot Krokåsskiftet');
      expect(stopsAhead(followed)).toEqual(['Krokåsskiftet 16:37']);
      expect(followed.trips.map(card)).toEqual([['Fremme 16:37']]);
      expect(followed.trips[0].arrival).toBe(clock(at('16:37:20')));
      expect(followed.trips[0].rows).toHaveLength(1);
    });
  });

  describe('when the traveller has got off and waits', () => {
    // The 50E was at Møhlenpris at 15:58:10 and has left for the bus station.
    const gone = the50E('15:58:10', { left: 2 });
    const calls = [...home('a', '16:02:30', '16:35'), ...next];

    it('has nothing to offer from the vehicle, which has left the stop', () => {
      const followed = plan('15:59:30', gone, calls);
      expect(followed.vehicle?.stops).toEqual([]);
      expect(followed.trips).toEqual([]);
    });

    it('keeps the ways on from the stop when told that the traveller got off there', () => {
      const followed = plan('15:59:30', gone, calls, { ...on50E, gotOffAt: mohlenpris.id });

      expect(followed.vehicle?.gotOff).toMatchObject({ stop: mohlenpris, passed: true, arrival: { actual: at('15:58:10') } });
      expect(stopsAhead(followed)).toEqual(['Møhlenpris 15:58']);
      expect(followed.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:48']]);
    });

    it('offers only the ways on from that stop while the vehicle is still on its way there', () => {
      const both: SavedRoutes = {
        ...routes,
        alternatives: [...alternatives, { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] }],
      };
      const fromStation = journey('b', '400', [[busstasjonen, '16:10'], [krokasskiftet, '16:50']]);
      const all = [...calls, ...fromStation];
      const run = (following: Following) =>
        planOnBoard('fromWork', tripPaths(both, 'fromWork'), the50E(), all, both, new Date(at('15:40')), following).trips.map(card);

      expect(run(on50E)).toEqual([
        ['Fremme 16:35', '410 Møhlenpris S 1:48'],
        ['Fremme 16:50', '400 Bergen busstasjon 5:00'],
      ]);
      expect(run({ ...on50E, gotOffAt: mohlenpris.id })).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:48']]);
    });
  });

  describe('the active plan', () => {
    // Two ways home: off at Møhlenpris, or on to the bus station, where a 400 leaves at 16:10.
    const both: SavedRoutes = {
      ...routes,
      alternatives: [...alternatives, { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] }],
    };
    /** The 50E is at Møhlenpris at 15:58:10 and at the bus station at 16:05. */
    const look = (atMohlenpris: string, fromStation: string, arrives = '16:50', later: StopCall[] = []) =>
      planOnBoard(
        'fromWork',
        tripPaths(both, 'fromWork'),
        the50E(),
        [...home('a', atMohlenpris, '16:35'), ...later, ...journey('c', '400', [[busstasjonen, fromStation], [krokasskiftet, arrives]])],
        both,
        new Date(at('15:40')),
        on50E,
      );
    const viaMohlenpris = (margin: string) => ['Fremme 16:35', `410 Møhlenpris S ${margin}`];
    const viaStation = (margin: string) => ['Fremme 16:50', `400 Bergen busstasjon ${margin}`];

    it('is the trip that is there first when every change has a minute to spare', () => {
      // 15:58:10 to 16:01:42 less 152 seconds is a minute exactly.
      const followed = look('16:01:42', '16:10');
      expect(followed.trips.map(card)).toEqual([viaMohlenpris('1:00'), viaStation('5:00')]);
      expect(followed.activePlan).toBe(followed.trips[0]);
      expect(followed.planHolds).toBe('withMargin');
    });

    it('is a later trip when the first one has a change with less than a minute', () => {
      const followed = look('16:01:41', '16:10');
      // The trip by Møhlenpris is still there first, and is listed under the plan.
      expect(followed.trips.map(card)).toEqual([viaStation('5:00'), viaMohlenpris('0:59')]);
      expect(followed.activePlan).toBe(followed.trips[0]);
      expect(followed.planHolds).toBe('withMargin');
    });

    it('is the next departure the same way when that is there before any other trip with a minute to spare', () => {
      const followed = look('16:01:41', '16:10', '16:50', home('b', '16:06', '16:39'));
      // 15:58:10 to 16:06:00 less the walk. The bus at 16:01:41 is still a card, since it is caught by the forecast.
      expect(followed.trips.map(card)).toEqual([['Fremme 16:39', '410 Møhlenpris S 5:18'], viaMohlenpris('0:59'), viaStation('5:00')]);
      expect(followed.planHolds).toBe('withMargin');
    });

    it('is the first trip without a missed change when none has a minute to spare', () => {
      const followed = look('16:01:12', '16:05:10');
      expect(followed.trips.map(card)).toEqual([viaMohlenpris('0:30'), viaStation('0:10')]);
      expect(followed.planHolds).toBe('withoutMargin');

      // A change forecast as missed is not planned on while another trip is caught.
      const red = look('16:00:12', '16:05:10');
      expect(red.trips.map(card)).toEqual([viaStation('0:10'), viaMohlenpris('−0:30')]);
      expect(red.planHolds).toBe('withoutMargin');
    });

    it('is the first trip of all when every one has a change forecast as missed', () => {
      const followed = look('16:00:12', '16:04:50');
      expect(followed.trips.map(card)).toEqual([viaMohlenpris('−0:30'), viaStation('−0:10')]);
      expect(followed.activePlan).toBe(followed.trips[0]);
      expect(followed.planHolds).toBe('missed');
    });

    it('holds with margin when there is no change to make', () => {
      const the410 = vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']], { left: 1 });
      const followed = plan('16:10', the410, [], { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });
      expect(followed.planHolds).toBe('withMargin');
      expect(followed.activePlan).toBe(followed.trips[0]);
    });

    it('follows the forecasts from one look to the next', () => {
      const calls = [...home('a', '16:01:42', '16:35'), ...journey('c', '400', [[busstasjonen, '16:10'], [krokasskiftet, '16:50']])];
      const as = (expected: string) =>
        card(planOnBoard('fromWork', tripPaths(both, 'fromWork'), the50E(expected), calls, both, new Date(at('15:40')), on50E).activePlan!)[0];
      // A second later at Møhlenpris, and the plan is the bus station. A second earlier again, and it is back.
      expect([as('15:58:10'), as('15:58:11'), as('15:58:10')]).toEqual(['Fremme 16:35', 'Fremme 16:50', 'Fremme 16:35']);
    });

    describe('and the cards kept for "show more"', () => {
      it('are those that are there more than half an hour after the plan', () => {
        const within = look('16:02:30', '16:10', '17:05');
        expect(within.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 16:35', 'Fremme 17:05']);
        expect(within.hidden).toEqual([]);

        const beyond = look('16:02:30', '16:10', '17:05:01');
        expect(beyond.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 16:35']);
        expect(beyond.hidden.map((trip) => card(trip)[0])).toEqual(['Fremme 17:05']);
      });

      it('are counted from the plan, not from the card that is there first', () => {
        // The plan is the bus station at 16:50. A card at 17:10 is 35 minutes after the first card, 20 after the plan.
        const followed = look('16:01:41', '16:10', '16:50', []);
        expect(followed.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 16:50', 'Fremme 16:35']);
        expect(followed.hidden).toEqual([]);
      });

      it('never include a card that is there before the plan', () => {
        const followed = look('16:01:41', '16:10', '17:30');
        expect(followed.trips.map((trip) => card(trip)[0])).toEqual(['Fremme 17:30', 'Fremme 16:35']);
        expect(followed.hidden).toEqual([]);
      });
    });
  });

  describe('the plan held from one look to the next', () => {
    // Two ways home: off at Møhlenpris for a bus at 16:02:30, or on to the bus station for one at 16:10.
    const both: SavedRoutes = {
      ...routes,
      alternatives: [...alternatives, { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] }],
    };
    const ways = tripPaths(both, 'fromWork');
    interface Seen {
      /** When the bus from Møhlenpris leaves, and when it is at Krokåsskiftet. */
      a?: [string, string];
      /** The same for the bus from the bus station. */
      c?: [string, string];
      more?: StopCall[];
      following?: Following;
      journey?: JourneyCall[];
    }
    const look = ({ a = ['16:02:30', '16:35:20'], c = ['16:10', '16:35:50'], more = [], following = on50E, journey: own = the50E() }: Seen, memory: PlanMemory | null) =>
      planOnBoard(
        'fromWork',
        ways,
        own,
        [...home('a', a[0], a[1]), ...journey('c', '400', [[busstasjonen, c[0]], [krokasskiftet, c[1]]]), ...more],
        both,
        new Date(at('15:40')),
        following,
        memory,
      );
    const via = (followed: OnBoardPlan) => followed.trips.map((trip) => (trip.cardKey.startsWith('journey:a@') ? 'Møhlenpris' : trip.cardKey.startsWith('journey:c@') ? 'busstasjonen' : trip.cardKey));
    /** The plan after a first look where the bus from Møhlenpris is there first, half a minute before the other. */
    const first = look({}, null);

    it('is the best trip at the first look, and is remembered', () => {
      expect(via(first)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(first.planReason).toBe('first');
      expect(first.memory.held).toEqual({
        id: first.activePlan?.id,
        vehicles: [
          { serviceJourneyId: 'journey:50E', date: '2026-11-16' },
          { serviceJourneyId: 'journey:a', date: '2026-11-16' },
        ],
      });
    });

    it('stays on top though another trip is now there sooner, in the same minute', () => {
      const moved: Seen = { a: ['16:02:30', '16:35:55'], c: ['16:10', '16:35:05'] };
      const held = look(moved, first.memory);
      expect(via(held)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(held.planReason).toBe('held');
      expect(held.activePlan).toBe(held.trips[0]);
      // The times are those of this look.
      expect(held.activePlan?.arrival).toBe(clock(at('16:35:55')));

      // Without what was remembered, the other trip would be the plan.
      expect(via(look(moved, null))).toEqual(['busstasjonen', 'Møhlenpris']);
    });

    it('stays on top though the other trip now has more to spare', () => {
      // Both are there at 16:35:20. The bus from the station now leaves twenty minutes after the 50E is there.
      const held = look({ c: ['16:25', '16:35:20'] }, first.memory);
      expect(via(held)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(held.planReason).toBe('held');
      expect(via(look({ c: ['16:25', '16:35:20'] }, null))).toEqual(['busstasjonen', 'Møhlenpris']);
    });

    it('gives way to a trip that is there a whole minute sooner, as the time is shown', () => {
      // 16:34:59 shows as 16:34, a minute before 16:35.
      const sooner = look({ c: ['16:10', '16:34:59'] }, first.memory);
      expect(via(sooner)).toEqual(['busstasjonen', 'Møhlenpris']);
      expect(sooner.planReason).toBe('earlier');

      // 16:35:00 against 16:35:59 is the same minute, though almost a minute apart.
      expect(look({ a: ['16:02:30', '16:35:59'], c: ['16:10', '16:35:00'] }, first.memory).planReason).toBe('held');
      // 16:35:59 against 16:36:00 is not, though a second apart.
      expect(look({ a: ['16:02:30', '16:36:00'], c: ['16:10', '16:35:59'] }, first.memory).planReason).toBe('earlier');
    });

    it('gives way when a change of it has less than a minute left', () => {
      // 15:58:10 to 16:01:42 less the walk is a minute, and to 16:01:41 a second less.
      expect(look({ a: ['16:01:42', '16:35:20'] }, first.memory).planReason).toBe('held');

      const failed = look({ a: ['16:01:41', '16:35:20'] }, first.memory);
      expect(failed.planReason).toBe('failed');
      // The trip by Møhlenpris is still a card, under the plan, though it is there first.
      expect(via(failed)).toEqual(['busstasjonen', 'Møhlenpris']);
      expect(failed.memory.held?.vehicles[1]).toEqual({ serviceJourneyId: 'journey:c', date: '2026-11-16' });
    });

    it('is not given the top back when it holds again, unless it is there a whole minute sooner', () => {
      const failed = look({ a: ['16:01:41', '16:35:20'] }, first.memory);
      const again = look({}, failed.memory);
      expect(via(again)).toEqual(['busstasjonen', 'Møhlenpris']);
      expect(again.planReason).toBe('held');

      const sooner = look({ a: ['16:02:30', '16:34:20'] }, failed.memory);
      expect(via(sooner)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(sooner.planReason).toBe('earlier');
    });

    it('is held along one way too, where another departure is now the one with most to spare', () => {
      // A 400 leaves Møhlenpris a minute after the 410 and is at Krokåsskiftet twenty seconds after it.
      const other = (arrives: string) => journey('a2', '400', [[mohlenpris, '16:03:30', { platform: 'S' }], [krokasskiftet, arrives]]);
      const start = look({ more: other('16:35:40') }, null);
      expect(start.activePlan?.cardKey).toBe('journey:a@2026-11-16');

      // Now both are there at 16:35:20. The 400 has a minute more to spare and would be the trip of that way.
      const held = look({ more: other('16:35:20') }, start.memory);
      expect(held.activePlan?.cardKey).toBe('journey:a@2026-11-16');
      expect(held.planReason).toBe('held');
      expect(held.trips.map((trip) => trip.cardKey)).toEqual(['journey:a@2026-11-16', 'journey:a2@2026-11-16', 'journey:c@2026-11-16']);
      expect(look({ more: other('16:35:20') }, null).activePlan?.cardKey).toBe('journey:a2@2026-11-16');
    });

    it('is held when the traveller has got off, and is what is left of it when they are on its next vehicle', () => {
      const waiting = look({ following: { ...on50E, gotOffAt: mohlenpris.id }, journey: the50E('15:58:10', { left: 2 }), c: ['16:25', '16:35:20'] }, first.memory);
      expect(waiting.planReason).toBe('held');

      const the410 = vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35:20']], { left: 1 });
      const riding = look({ following: { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id }, journey: the410 }, waiting.memory);
      expect(riding.planReason).toBe('held');
      expect(riding.memory.held?.vehicles).toEqual([{ serviceJourneyId: 'journey:a', date: '2026-11-16' }]);
      expect(card(riding.activePlan!)).toEqual(['Fremme 16:35']);
    });

    it('is a new one when the traveller is on a vehicle that was not in it', () => {
      const the400 = vehicle('c', '400', [[busstasjonen, '16:10'], [krokasskiftet, '16:35:50']], { left: 1 });
      const riding = look({ following: { serviceJourneyId: 'journey:c', date: '2026-11-16', boardedAt: busstasjonen.id }, journey: the400 }, first.memory);
      expect(riding.planReason).toBe('first');
      expect(card(riding.activePlan!)).toEqual(['Fremme 16:35']);
    });

    it('is held in the same way when no trip has a minute to spare on every change', () => {
      // Half a minute at Møhlenpris, ten seconds at the bus station.
      const tight: Seen = { a: ['16:01:12', '16:35:20'], c: ['16:05:10', '16:35:50'] };
      const start = look(tight, null);
      expect(via(start)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(start.planHolds).toBe('withoutMargin');

      const held = look({ a: ['16:01:12', '16:35:55'], c: ['16:05:10', '16:35:05'] }, start.memory);
      expect(via(held)).toEqual(['Møhlenpris', 'busstasjonen']);
      expect(held.planReason).toBe('held');

      // A trip with the minute on every change then takes its place, though it is there in the same minute.
      const better = look({ a: ['16:01:12', '16:35:20'], c: ['16:10', '16:35:50'] }, start.memory);
      expect(via(better)).toEqual(['busstasjonen', 'Møhlenpris']);
      expect(better.planReason).toBe('failed');
      expect(better.planHolds).toBe('withMargin');
    });

    it('is no longer held when its vehicle is cancelled', () => {
      const cancelled = planOnBoard('fromWork', ways, the50E(), [...home('a', '16:02:30', '16:35:20', { cancelled: true }), ...journey('c', '400', [[busstasjonen, '16:10'], [krokasskiftet, '16:35:50']])], both, new Date(at('15:40')), on50E, first.memory);
      expect(via(cancelled)).toEqual(['busstasjonen']);
      expect(cancelled.planReason).toBe('failed');
    });
  });

  describe('a change that was shown and then given up', () => {
    const calls = [...home('a', '16:02:30', '16:35'), ...next];
    /** A look with the 50E forecast at Møhlenpris at the given clock. The bus home leaves at 16:02:30, 2:32 away. */
    const look = (atMohlenpris: string, memory: PlanMemory | null) =>
      planOnBoard('fromWork', paths, the50E(atMohlenpris), calls, routes, new Date(at('15:40')), on50E, memory);
    const cards = (followed: OnBoardPlan) => followed.trips.map(card);
    const theNext = (margin: string) => ['Fremme 16:53', `410 Møhlenpris S ${margin}`];
    const red = (margin: string) => ['Fremme 16:35', `410 Møhlenpris S ${margin}`, 'Rekker du den ikke: fremme 16:53'];
    const key = 'journey:50E@2026-11-16:stop:Møhlenpris>journey:a@2026-11-16:stop:Møhlenpris';

    const shown = look('15:58:10', null);

    it('stays, in red, while it is missed by three minutes or less', () => {
      expect(cards(shown)).toEqual([['Fremme 16:35', '410 Møhlenpris S 1:48']]);
      expect(shown.memory).toMatchObject({ seen: [key], removed: [] });

      const late = look('16:00:28', shown.memory);
      expect(cards(late)).toEqual([theNext('17:00'), red('−0:30')]);
      const later = look('16:00:59', late.memory);
      expect(cards(later)).toEqual([theNext('16:29'), red('−1:01')]);
      const latest = look('16:02:58', later.memory);
      expect(cards(latest)).toEqual([theNext('14:30'), red('−3:00')]);
      expect(latest.memory.removed).toEqual([]);
    });

    it('is gone when it is missed by more than three minutes, and is remembered as given up', () => {
      const gone = look('16:02:59', shown.memory);
      expect(cards(gone)).toEqual([theNext('14:29')]);
      expect(gone.memory.removed).toEqual([key]);
    });

    it('does not come back while it is still forecast as missed, however little', () => {
      const gone = look('16:02:59', shown.memory);
      // Three minutes too late exactly, where it would have stayed had it not been given up.
      expect(cards(look('16:02:58', gone.memory))).toEqual([theNext('14:30')]);
      // A minute too late, where it is shown even when it is new.
      const closer = look('16:00:58', gone.memory);
      expect(cards(closer)).toEqual([theNext('16:30')]);
      // A second too late.
      const almost = look('15:59:59', closer.memory);
      expect(cards(almost)).toEqual([theNext('17:29')]);
      expect(almost.memory.removed).toEqual([key]);

      // Without what was remembered, it is back in red at once.
      expect(cards(look('16:00:58', null))).toEqual([theNext('16:30'), red('−1:00')]);
    });

    it('comes back when the forecast says it is caught, with nothing to spare or more', () => {
      const gone = look('16:02:59', shown.memory);
      const caught = look('15:59:58', gone.memory);
      // The next bus is still the plan. The first one is a card again, and is there first.
      expect(cards(caught)).toEqual([theNext('17:30'), ['Fremme 16:35', '410 Møhlenpris S 0:00']]);
      expect(caught.memory.removed).toEqual([]);
      expect(caught.planReason).toBe('held');

      // Having come back, it stays in red again when it is missed anew.
      expect(cards(look('16:01:28', caught.memory))).toEqual([theNext('16:00'), red('−1:30')]);
    });

    it('does not go and come when the forecast moves about the limit', () => {
      let memory: PlanMemory | null = shown.memory;
      const seenAs: string[] = [];
      // Three minutes too late, then a second more, then back and forth.
      for (const forecast of ['16:02:58', '16:02:59', '16:02:57', '16:03:00', '16:00:50', '16:02:59']) {
        const followed = look(forecast, memory);
        seenAs.push(followed.trips.length === 2 ? 'red' : 'gone');
        memory = followed.memory;
      }
      expect(seenAs).toEqual(['red', 'gone', 'gone', 'gone', 'gone', 'gone']);
    });

    it('is not held back when it was never shown: a change first seen within the minute is shown in red', () => {
      // At the first look the bus home is already missed by more than a minute. It has never been a card.
      const never = look('16:00:59', null);
      expect(cards(never)).toEqual([theNext('16:29')]);
      expect(never.memory.removed).toEqual([]);
      // Nor at the next look, when other changes have been shown. Under three minutes too late it is still no card.
      const still = look('16:01:10', never.memory);
      expect(cards(still)).toEqual([theNext('16:18')]);
      expect(still.memory).toMatchObject({ seen: ['journey:50E@2026-11-16:stop:Møhlenpris>journey:next@2026-11-16:stop:Møhlenpris'], removed: [] });
      expect(cards(look('16:00:28', still.memory))).toEqual([theNext('17:00'), red('−0:30')]);
    });
  });

  it('follows the bus from Grana, which is part of the way from work to the stop', () => {
    const the57 = vehicle('57', '57', [[grana, '15:21', { expected: '15:23' }], [birkelandsskiftet, '15:25', { expected: '15:26:40', platform: 'C' }]], { left: 1 });
    const calls = [
      ...journey('50E', '50E', [[birkelandsskiftet, '15:29', { platform: 'D' }], [mohlenpris, '15:57', { expected: '15:57:50', platform: 'N' }]]),
      ...home('a', '16:02:30', '16:35'),
    ];
    const followed = plan('15:24', the57, calls, { serviceJourneyId: 'journey:57', date: '2026-11-16', boardedAt: grana.id });

    expect(heading(followed)).toBe('Du er på 57 mot Birkelandsskiftet');
    expect(stopsAhead(followed)).toEqual(['Birkelandsskiftet 15:26']);
    // 15:26:40 to 15:29:00, and 15:57:50 to 16:02:30 less 152 seconds.
    expect(followed.trips.map(card)).toEqual([['Fremme 16:35', '50E Birkelandsskiftet D 2:20', '410 Møhlenpris S 2:08']]);
  });

  describe('past midnight', () => {
    const nextDay = '2026-11-17';
    /** The last 50E of Monday, at Møhlenpris after midnight. */
    const night = vehicle(
      '50E',
      '50E',
      [
        [birkelandsskiftet, '23:40', { platform: 'D' }],
        [mohlenpris, '00:07', { expected: '00:08:10', platform: 'N', day: nextDay }],
        [busstasjonen, '00:15', { day: nextDay }],
      ],
      { left: 1 },
    );
    /** A bus home that still belongs to Monday's timetable, though it leaves on Tuesday. */
    const nightBus = (id: string, departs: string, arrives: string, day = nextDay) =>
      journey(id, '410', [[mohlenpris, departs, { platform: 'S', day }], [krokasskiftet, arrives, { day: nextDay }]]);

    it('counts the transfer time across the change of date', () => {
      const followed = plan('23:50', night, nightBus('a', '00:12', '00:45'));
      // 00:08:10 to 00:12:00 is 230 seconds, less 152.
      expect(followed.trips.map(card)).toEqual([['Fremme 00:45', '410 Møhlenpris S 1:18']]);
      expect(followed.trips[0].arrival).toBe(clock(at('00:45', nextDay)));
      expect(stopsAhead(followed)).toEqual(['Møhlenpris 00:08']);
    });

    it('does not take a bus that left before midnight because its clock reads higher', () => {
      const calls = [...nightBus('early', '23:59', '00:30', '2026-11-16'), ...nightBus('a', '00:12', '00:45')];
      expect(plan('23:50', night, calls).trips.map(card)).toEqual([['Fremme 00:45', '410 Møhlenpris S 1:18']]);
    });

    it('keeps following after midnight a vehicle that started the day before', () => {
      const now = new Date(at('00:05', nextDay));
      const followed = planOnBoard('fromWork', paths, night, nightBus('a', '00:12', '00:45'), routes, now, on50E);
      expect(stopsAhead(followed)).toEqual(['Møhlenpris 00:08']);
      expect(followed.trips.map(card)).toEqual([['Fremme 00:45', '410 Møhlenpris S 1:18']]);
    });

    it('keeps the minute of grace across midnight', () => {
      const now = new Date(at('00:05', nextDay));
      const run = (departs: string) =>
        planOnBoard('fromWork', paths, night, [...nightBus('a', departs, '00:45'), ...nightBus('b', '00:40', '01:13')], routes, now, on50E).trips.map(card);

      expect(run('00:09:42')).toEqual([
        ['Fremme 01:13', '410 Møhlenpris S 29:18'],
        ['Fremme 00:45', '410 Møhlenpris S −1:00', 'Rekker du den ikke: fremme 01:13'],
      ]);
      expect(run('00:09:41')).toEqual([['Fremme 01:13', '410 Møhlenpris S 29:18']]);
    });
  });
});

describe('followVehicle', () => {
  const alternatives: Alternative[] = [
    { key: 'mohlenpris', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)] },
  ];
  const routes: SavedRoutes = {
    ...NO_ROUTES,
    alternatives,
    connections: [{ key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] }],
  };
  const the50E = vehicle('50E', '50E', [[birkelandsskiftet, '15:30'], [mohlenpris, '15:57', { expected: '15:58:10' }]], { left: 1 });
  const the410 = journey('410', '410', [[mohlenpris, '16:02:30'], [krokasskiftet, '16:35']]);
  const on50E: Following = { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id };

  const toJourneyResponse = (calls: JourneyCall[]): JourneyCallsResponse => ({
    serviceJourney: calls.length
      ? {
          id: calls[0].serviceJourneyId,
          line: { publicCode: calls[0].line, transportMode: calls[0].transportMode },
          estimatedCalls: calls.map((call) => ({
            aimedArrivalTime: call.aimedArrival,
            expectedArrivalTime: call.expectedArrival,
            actualArrivalTime: call.actualArrival,
            aimedDepartureTime: call.aimedDeparture,
            expectedDepartureTime: call.expectedDeparture,
            actualDepartureTime: call.actualDeparture,
            realtime: call.realtime,
            cancellation: call.cancelled,
            predictionInaccurate: call.predictionInaccurate,
            forBoarding: call.forBoarding,
            forAlighting: call.forAlighting,
            stopPositionInPattern: call.position,
            empiricalDelay: null,
            quay: { id: call.quayId, publicCode: call.platform, name: call.stopName, stopPlace: { id: call.stopPlaceId, name: call.stopName } },
            destinationDisplay: { frontText: call.destination },
          })),
        }
      : null,
  });
  const toStopResponse = (calls: StopCall[]): StopCallsResponse => ({
    stopPlaces: [...new Set(calls.map((call) => call.stopPlaceId))].map((id) => ({
      id,
      estimatedCalls: calls
        .filter((call) => call.stopPlaceId === id)
        .map((call) => ({
          date: call.date,
          aimedArrivalTime: call.aimedArrival,
          expectedArrivalTime: call.expectedArrival,
          aimedDepartureTime: call.aimedDeparture,
          expectedDepartureTime: call.expectedDeparture,
          realtime: call.realtime,
          cancellation: call.cancelled,
          predictionInaccurate: call.predictionInaccurate,
          forBoarding: call.forBoarding,
          forAlighting: call.forAlighting,
          stopPositionInPattern: call.position,
          empiricalDelay: null,
          quay: { id: call.quayId, publicCode: call.platform },
          destinationDisplay: { frontText: call.destination },
          serviceJourney: { id: call.serviceJourneyId, line: { publicCode: call.line, transportMode: call.transportMode } },
          serviceJourneyEstimatedCalls: { first: { actualDepartureTime: call.started ? call.aimedDeparture : null } },
        })),
    })),
  });

  /** Entur as on board sees it: it knows the followed journey, the lines, and what leaves the stops. */
  function entur(journeyCalls: JourneyCall[], calls: StopCall[], otherJourneys: JourneyCall[][] = []) {
    const asked: { operation: string; variables: Record<string, unknown> }[] = [];
    const journeyWith = (id: unknown) => otherJourneys.find((other) => other[0].serviceJourneyId === id) ?? journeyCalls;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const { query, variables } = JSON.parse(init.body as string) as { query: string; variables: Record<string, unknown> };
      const operation = query.includes('serviceJourney(') ? 'journey' : query.includes('lines(') ? 'lines' : 'calls';
      asked.push({ operation, variables });
      const data =
        operation === 'journey'
          ? toJourneyResponse(journeyWith(variables.id))
          : operation === 'lines'
            ? { lines: (variables.codes as string[]).map((code) => ({ id: `SKY:Line:${code}`, publicCode: code })) }
            : toStopResponse(calls);
      return { ok: true, status: 200, json: async () => ({ data }) } as Response;
    }) as unknown as typeof fetch;
    return { asked, fetchImpl };
  }

  // First, so that the lines are not already known from another test of this file.
  it('asks Entur for the journey, and for what leaves the stops ahead on the lines onward', async () => {
    const { asked, fetchImpl } = entur(the50E, the410);
    await followVehicle('fromWork', on50E, new Date(at('15:40')), { routes, entur: { fetchImpl } });

    expect(asked.map((a) => a.operation)).toEqual(['journey', 'lines', 'calls']);
    expect(asked[0].variables).toEqual({ id: 'journey:50E', date: '2026-11-16' });
    expect(asked[1].variables.codes).toEqual(['400', '410']);
    expect(asked[2].variables).toMatchObject({
      ids: ['NSR:StopPlace:32541', 'stop:Møhlenpris'],
      lines: ['SKY:Line:400', 'SKY:Line:410'],
      start: clock(at('15:40')),
    });
  });

  it('gives the ranked trips on from the vehicle at a moment', async () => {
    const { fetchImpl } = entur(the50E, the410);
    const plan = await followVehicle('fromWork', on50E, new Date(at('15:40')), { routes, entur: { fetchImpl } });

    expect(heading(plan)).toBe('Du er på 50E mot Møhlenpris');
    expect(plan.at).toBe(clock(at('15:40')));
    expect(plan.following).toEqual(on50E);
    expect(plan.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris 4:20']]);
  });

  it('asks about no stops when the vehicle goes all the way, or runs nothing that is saved', async () => {
    const last = vehicle('410', '410', [[mohlenpris, '16:02:30'], [krokasskiftet, '16:35']], { left: 1 });
    const { asked, fetchImpl } = entur(last, []);
    const plan = await followVehicle(
      'fromWork',
      { serviceJourneyId: 'journey:410', date: '2026-11-16', boardedAt: mohlenpris.id },
      new Date(at('16:10')),
      { routes, entur: { fetchImpl } },
    );
    expect(asked.map((a) => a.operation)).toEqual(['journey']);
    expect(plan.trips.map(card)).toEqual([['Fremme 16:35']]);
  });

  it('gives no vehicle for a journey Entur does not know', async () => {
    const { asked, fetchImpl } = entur([], the410);
    const plan = await followVehicle('fromWork', on50E, new Date(at('15:40')), { routes, entur: { fetchImpl } });
    expect(plan.vehicle).toBeNull();
    expect(plan.trips).toEqual([]);
    expect(asked.map((a) => a.operation)).toEqual(['journey']);
  });

  describe('when Entur lists the departure twice', () => {
    const visits = (late: boolean): Parameters<typeof vehicle>[2] => [
      [birkelandsskiftet, '15:30'],
      [mohlenpris, '15:57', late ? { expected: '16:01' } : {}],
      [busstasjonen, '16:05', late ? { expected: '16:09' } : {}],
    ];
    /**
     * The journey a card may hold: Entur has set its real-time flag, but it stays on the timetable, with the
     * timetable filled in as the arrival at the stops it should have passed. As seen on 14 November 2026.
     */
    const silent = silentTwin(vehicle('50E', '50E', visits(false)), at('15:40'));
    /** The journey that reports: the same timetable, four minutes late. */
    const reporting = vehicle('50E-twin', '50E', visits(true), { left: 1 });
    const buses = [...journey('410', '410', [[mohlenpris, '16:02:30'], [krokasskiftet, '16:35']]), ...journey('410-b', '410', [[mohlenpris, '16:20'], [krokasskiftet, '16:53']])];
    const run = (now: string, journeyCalls: JourneyCall[], atStops: StopCall[], others: JourneyCall[][] = []) => {
      const fake = entur(journeyCalls, atStops, others);
      return followVehicle('fromWork', on50E, new Date(at(now)), { routes, entur: { fetchImpl: fake.fetchImpl } }).then((plan) => ({ plan, asked: fake.asked }));
    };

    it('follows the journey that reports, and tells which one that is', async () => {
      const { plan, asked } = await run('15:40', silent, [...buses, ...reporting.slice(1)], [reporting]);

      // By the timetable the 410 at 16:02:30 is caught with 5:30 to spare. The bus is in fact at Møhlenpris at 16:01.
      expect(plan.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris 1:30']]);
      expect(plan.vehicle).toMatchObject({ serviceJourneyId: 'journey:50E-twin', started: true, live: true });
      expect(plan.following).toEqual({ ...on50E, serviceJourneyId: 'journey:50E-twin' });
      expect(asked.map((a) => a.operation)).toEqual(['journey', 'lines', 'calls', 'journey', 'calls']);
      expect(asked[2].variables).toMatchObject({ ids: ['stop:Bergen busstasjon'], lines: ['SKY:Line:50E'] });
      expect(asked[3].variables).toEqual({ id: 'journey:50E-twin', date: '2026-11-16' });
    });

    it('follows the journey asked for when no other journey with its timetable is under way', async () => {
      // Another 50E is under way, ten minutes later.
      const later = vehicle('50E-later', '50E', [[birkelandsskiftet, '15:40'], [mohlenpris, '16:07'], [busstasjonen, '16:15']], { left: 1 });
      const { plan } = await run('15:45', silent, [...buses, ...later.slice(1)], [later]);
      expect(plan.vehicle).toMatchObject({ serviceJourneyId: 'journey:50E', started: false, live: false });
      expect(plan.following).toEqual(on50E);
      expect(plan.trips.map(card)).toEqual([['Fremme 16:35', '410 Møhlenpris 5:30']]);

      // One with the same times at the last stop, but another way there, is not the same departure either.
      const otherWay = vehicle('50E-other', '50E', [[birkelandsskiftet, '15:30'], [dolvik, '15:45'], [busstasjonen, '16:05']], { left: 1 });
      const second = await run('15:45', silent, [...buses, ...otherWay.slice(1)], [otherWay]);
      expect(second.plan.following).toEqual(on50E);

      // A twin that has not started either says nothing about which of the two will report.
      const alsoSilent = silent.map((call) => ({ ...call, serviceJourneyId: 'journey:50E-twin' }));
      const third = await run('15:45', silent, [...buses, ...alsoSilent.slice(1)], [alsoSilent]);
      expect(third.plan.following).toEqual(on50E);
    });

    it('does not look for another journey before the one asked for should have started, or once it reports', async () => {
      const before = await run('15:30:59', silentTwin(vehicle('50E', '50E', visits(false)), at('15:30:59')), buses);
      expect(before.asked.map((a) => a.operation)).toEqual(['journey', 'calls']);

      const reports = await run('15:40', vehicle('50E', '50E', visits(true), { left: 1 }), buses);
      expect(reports.asked.map((a) => a.operation)).toEqual(['journey', 'calls']);
    });

    it('does not look for another journey for light rail, which never reports', async () => {
      const tram = vehicle('50E', '50E', visits(false), { left: 0, transportMode: 'tram', realtime: false });
      const { asked, plan } = await run('15:40', tram, buses);
      expect(asked.map((a) => a.operation)).toEqual(['journey', 'calls']);
      expect(plan.vehicle).toMatchObject({ precise: true });
    });
  });

  it('throws when Entur cannot be reached', async () => {
    const failing = (async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    await expect(followVehicle('fromWork', on50E, new Date(at('15:40')), { routes, entur: { fetchImpl: failing } })).rejects.toThrow('503');
  });
});
