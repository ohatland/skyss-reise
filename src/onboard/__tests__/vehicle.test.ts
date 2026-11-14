import { at, ride, stop } from '@/engine/__fixtures__/calls';
import type { TripPath } from '@/engine/paths';
import type { TransitLeg } from '@/model/types';
import { silentTwin, vehicle } from '@/onboard/__fixtures__/vehicle';
import { follow, onwardPaths, vehicleRide, type Followed } from '@/onboard/vehicle';

const a = stop('A');
const b = stop('B');
const c = stop('C');
const d = stop('D');
const ref = { serviceJourneyId: 'journey:x', date: '2026-11-16' };

/** A bus that runs A, B, C, D, ten minutes apart from 10:00. */
const bus = (options: Parameters<typeof vehicle>[3] = {}) =>
  vehicle('x', '5', [[a, '10:00'], [b, '10:10'], [c, '10:20'], [d, '10:30']], options);
const followed = (calls: ReturnType<typeof bus>, now: string, following = {}): Followed =>
  follow(calls, { ...ref, ...following }, new Date(at(now)))!;
const leg = (from = a, to = c, lines = '5') => ride(lines, from, to) as TransitLeg;

describe('which stops the vehicle has left', () => {
  it('are those Entur has measured its departure from', () => {
    expect(followed(bus({ left: 2 }), '10:15').passed).toEqual([true, true, false, false]);
  });

  it('are not the one where it stands', () => {
    expect(followed(bus({ left: 2, standing: true }), '10:20').passed).toEqual([true, true, false, false]);
  });

  it('are also those before a stop it is measured at, though Entur missed it there', () => {
    const calls = bus({ left: 3 }).map((call, index) => (index === 1 ? { ...call, actualArrival: null, actualDeparture: null } : call));
    expect(followed(calls, '10:25').passed).toEqual([true, true, true, false]);
  });

  it('are not those whose forecast has come and gone while the vehicle has yet to report from them', () => {
    // At 10:12 the bus is forecast to have left B at 10:10. Entur has not measured it there: it may be late.
    expect(followed(bus({ left: 1 }), '10:12').passed).toEqual([true, false, false, false]);
  });

  it('are those whose time has come, for a vehicle that never reports', () => {
    const silent = bus({ realtime: false });
    expect(followed(silent, '09:59').passed).toEqual([false, false, false, false]);
    expect(followed(silent, '10:10').passed).toEqual([true, false, false, false]);
    expect(followed(silent, '10:10:01').passed).toEqual([true, true, false, false]);
  });

  it('are those whose time has come, for a journey Entur has only filled the timetable in for', () => {
    // Entur lists the departure twice. This journey gets the timetable as its arrival at A and B, and nothing measured.
    const twin = silentTwin(bus(), at('10:12'));
    expect(twin.map((call) => call.actualArrival)).toEqual([at('10:00'), at('10:10'), null, null]);

    const state = followed(twin, '10:12');
    expect(state.passed).toEqual([true, true, false, false]);
    // The arrivals are not measurements, and are not passed on as such.
    expect(state.calls.map((call) => call.actualArrival)).toEqual([null, null, null, null]);
    expect(followed(silentTwin(bus(), at('10:10')), '10:10').passed).toEqual([true, false, false, false]);
  });

  it('are never the last stop, where the journey ends', () => {
    expect(followed(bus({ realtime: false }), '11:00').passed).toEqual([true, true, true, false]);
    const done = bus({ left: 3, standing: true }).map((call, index) => (index === 3 ? { ...call, actualDeparture: call.expectedDeparture } : call));
    expect(followed(done, '10:31').passed).toEqual([true, true, true, false]);
  });
});

describe('where the traveller can get off', () => {
  it('is every stop the vehicle has not left', () => {
    expect(followed(bus({ left: 2 }), '10:15').open).toEqual([false, false, true, true]);
  });

  it('is not the stop where they boarded, nor one before it', () => {
    const waiting = followed(bus(), '09:50', { boardedAt: b.id });
    expect(waiting.boarding).toBe(1);
    expect(waiting.open).toEqual([false, false, true, true]);
  });

  it('is not a stop they have stayed on past, nor one before it', () => {
    const stayed = followed(bus({ left: 1 }), '10:05', { boardedAt: a.id, stayedOnAt: c.id });
    expect(stayed.open).toEqual([false, false, false, true]);
    // The vehicle may still stand at the stop. The traveller has said they are not getting off there.
    expect(followed(bus({ left: 1, standing: true }), '10:10', { boardedAt: a.id, stayedOnAt: b.id }).open).toEqual([false, false, true, true]);
    // A stop before where they boarded changes nothing.
    expect(followed(bus({ left: 2 }), '10:15', { boardedAt: b.id, stayedOnAt: a.id }).open).toEqual([false, false, true, true]);
  });

  it('is only where they have got off, once they have', () => {
    const off = followed(bus({ left: 3 }), '10:22', { boardedAt: a.id, gotOffAt: b.id });
    expect(off.gotOff).toBe(1);
    expect(off.open).toEqual([false, true, false, false]);
  });

  it('is not a stop that is cancelled or does not let passengers off', () => {
    const calls = bus({ left: 1 }).map((call, index) => (index === 1 ? { ...call, cancelled: true } : index === 2 ? { ...call, forAlighting: false } : call));
    expect(followed(calls, '10:05').open).toEqual([false, false, false, true]);
  });

  it('takes a stop the traveller cannot have got off at as not got off', () => {
    const before = followed(bus({ left: 2 }), '10:15', { boardedAt: b.id, gotOffAt: a.id });
    expect(before.gotOff).toBeNull();
    expect(before.open).toEqual([false, false, true, true]);
  });

  it('has the traveller board a vehicle that calls twice at the stop the last time it left it', () => {
    const loop = vehicle('x', '5', [[a, '10:00'], [b, '10:10'], [a, '10:20'], [c, '10:30']], { left: 3 });
    expect(followed(loop, '10:25', { boardedAt: a.id }).boarding).toBe(2);
    // Before it has been there at all, the first time it comes.
    expect(follow(vehicle('x', '5', [[a, '10:00'], [b, '10:10'], [a, '10:20'], [c, '10:30']]), { ...ref, boardedAt: a.id }, new Date(at('09:50')))?.boarding).toBe(0);
  });

  it('is nowhere for a journey without calls', () => {
    expect(follow([], ref, new Date(at('10:00')))).toBeNull();
  });
});

describe('the ride on the followed vehicle over a saved leg', () => {
  it('goes from where the traveller boarded to the second stop of the leg, by Entur’s forecast', () => {
    const late = vehicle('x', '5', [[a, '10:00'], [b, '10:10', { expected: '10:11:30' }], [c, '10:20', { expected: '10:22:15', platform: 'F' }], [d, '10:30']], { left: 2 });
    const found = vehicleRide(followed(late, '10:15', { boardedAt: b.id }), leg(a, c));

    expect(found?.alighting).toBe(2);
    expect(found?.ride).toMatchObject({
      serviceJourneyId: 'journey:x',
      date: '2026-11-16',
      line: '5',
      started: true,
      boarding: { stop: b, aimed: at('10:10'), expected: at('10:11:30') },
      alighting: { stop: c, platform: 'F', aimed: at('10:20'), expected: at('10:22:15'), realtime: true },
    });
  });

  it('takes the measured time before the forecast, where the two differ', () => {
    const calls = bus({ left: 1, standing: true }).map((call, index) => (index === 1 ? { ...call, actualArrival: at('10:10:40') } : call));
    expect(vehicleRide(followed(calls, '10:11'), leg(a, b))?.ride.alighting.expected).toBe(at('10:10:40'));
  });

  it('is none when the vehicle is not of the lines of the leg', () => {
    expect(vehicleRide(followed(bus({ left: 1 }), '10:05'), leg(a, c, '6, 7'))).toBeNull();
    expect(vehicleRide(followed(bus({ left: 1 }), '10:05'), leg(a, c, '6, 5'))).not.toBeNull();
  });

  it('is none when the vehicle does not call at both stops of the leg, in that order', () => {
    const state = followed(bus({ left: 1 }), '10:05');
    expect(vehicleRide(state, leg(a, stop('E')))).toBeNull();
    expect(vehicleRide(state, leg(stop('E'), c))).toBeNull();
    expect(vehicleRide(state, leg(d, c))).toBeNull();
  });

  it('is none when the vehicle has left the second stop of the leg', () => {
    expect(vehicleRide(followed(bus({ left: 3 }), '10:25'), leg(a, c))).toBeNull();
    expect(vehicleRide(followed(bus({ left: 3 }), '10:25'), leg(a, d))).not.toBeNull();
  });

  it('is there for a leg saved from a stop the traveller did not board at', () => {
    // The leg is saved from B. The traveller boarded at A and is on the vehicle all the same.
    expect(vehicleRide(followed(bus({ left: 1 }), '10:05', { boardedAt: a.id }), leg(b, d))?.ride).toMatchObject({
      boarding: { stop: a },
      alighting: { stop: d },
    });
  });
});

describe('the ways on from the followed vehicle', () => {
  const path = (legs: TripPath['legs'], legsToAddress = 0): TripPath => ({ legs, legsToAddress });
  const state = followed(bus({ left: 1 }), '10:05', { boardedAt: a.id });
  const chain = (ways: ReturnType<typeof onwardPaths>) =>
    ways.map((way) => way.path.legs.map((part) => `${part.kind === 'walk' ? 'gå' : part.lines.join('/')} ${part.from.name}→${part.to.name}`).join(', '));

  it('are the saved paths from each leg the vehicle runs, with that leg as the traveller’s own ride', () => {
    const ways = onwardPaths([path([ride('5', a, c), ride('8', c, stop('E'))])], state);
    expect(chain(ways)).toEqual(['5 A→C, 8 C→E']);
    expect(ways[0].alighting).toBe(2);
    expect(ways[0].ride.alighting.stop).toEqual(c);
  });

  it('start at any leg of a path, leaving out what comes before it', () => {
    const ways = onwardPaths([path([ride('9', stop('Z'), a), ride('5', a, b), ride('5', b, d), ride('8', d, stop('E'))])], state);
    // On to B and then further on the same vehicle, or straight to D.
    expect(chain(ways)).toEqual(['5 A→B, 5 B→D, 8 D→E', '5 A→D, 8 D→E']);
  });

  it('are given once when two paths go on the same way from the same stop', () => {
    const ways = onwardPaths(
      [
        path([ride('5', a, c), ride('8', c, stop('E'))]),
        path([ride('9', stop('Z'), b), ride('5', b, c), ride('8', c, stop('E'))]),
      ],
      state,
    );
    expect(chain(ways)).toEqual(['5 A→C, 8 C→E']);
  });

  it('keep count of the legs that are the way to the address', () => {
    const work = { id: 'place:work', name: 'Jobb' };
    const whole = path([ride('5', a, c), ride('8', c, stop('E')), { kind: 'walk', from: stop('E'), to: work, seconds: 300 }], 2);
    expect(onwardPaths([whole], state).map((way) => way.path.legsToAddress)).toEqual([2]);

    // On the 8, which is itself part of the way to the address, every leg left is.
    const the8 = vehicle('y', '8', [[c, '10:25'], [stop('E'), '10:35']], { left: 1 });
    const on8 = follow(the8, { serviceJourneyId: 'journey:y', date: '2026-11-16', boardedAt: c.id }, new Date(at('10:30')))!;
    const [last] = onwardPaths([whole], on8);
    expect(last.path.legs).toHaveLength(2);
    expect(last.path.legsToAddress).toBe(2);
  });

  it('are none for a vehicle that runs no leg of the paths', () => {
    expect(onwardPaths([path([ride('8', c, stop('E'))])], state)).toEqual([]);
    expect(onwardPaths([], state)).toEqual([]);
  });
});
