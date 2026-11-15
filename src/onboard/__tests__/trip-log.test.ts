import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import type { StopCall } from '@/entur/calls';
import type { JourneyCall } from '@/entur/journey';
import type { Alternative, Connection, StopRef } from '@/model/types';
import { vehicle } from '@/onboard/__fixtures__/vehicle';
import { planOnBoard } from '@/onboard/follow';
import { finishLog, logAnswer, observe, observeVehicle, startLog, tripReport, type TripLog } from '@/onboard/trip-log';
import type { Following } from '@/onboard/vehicle';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

const work: StopRef = { id: 'place:work', name: 'Jobb' };
const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
const birkelandsskiftet = stop('Birkelandsskiftet');
const mohlenpris = stop('Møhlenpris');
const busstasjonen = stop('Bergen busstasjon');
const dolvik = stop('Dolvik');
const blomsterdalen = stop('Blomsterdalen');

const clock = (time: string) => new Date(at(time)).toISOString();

describe('a trip home from work with one change', () => {
  const alternatives: Alternative[] = [
    { key: 'mohlenpris', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)] },
  ];
  const connections: Connection[] = [
    { key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] },
  ];
  const routes: SavedRoutes = {
    ...NO_ROUTES,
    alternatives,
    connections,
    transferWalks: [transferWalk(mohlenpris, 'N', mohlenpris, 'S', 152)],
  };

  /** The 50E, twenty seconds late from Birkelandsskiftet, forecast at Møhlenpris at the given clock. */
  const the50E = (atMohlenpris: string, left = 1) =>
    vehicle(
      '50E',
      '50E',
      [
        [birkelandsskiftet, '15:30', { expected: '15:30:20', platform: 'D' }],
        [mohlenpris, '15:57', { expected: atMohlenpris, platform: 'N' }],
        [busstasjonen, '16:05'],
      ],
      { left },
    );
  /** The bus home, ten seconds late from Møhlenpris. Entur has measured it there once it has left. */
  const the410 = (options: { left?: number; standing?: boolean } = {}) =>
    vehicle(
      'a',
      '410',
      [
        [mohlenpris, '16:02:30', { expected: options.left ? '16:02:40' : '16:02:30', platform: 'S' }],
        [krokasskiftet, '16:35:20', { expected: options.left ? '16:36:05' : '16:35:20' }],
      ],
      options,
    );
  const later = journey('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']]);
  const leaving: StopCall[] = [...the410(), ...later];

  const on50E: Following = { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id };
  const on410: Following = { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id };
  const onLater: Following = { serviceJourneyId: 'journey:b', date: '2026-11-16', boardedAt: mohlenpris.id };
  const look = (now: string, journeyCalls: JourneyCall[], following: Following, calls = leaving, saved = routes) =>
    planOnBoard('fromWork', tripPaths(saved, 'fromWork'), journeyCalls, calls, saved, new Date(at(now)), following);

  /** The whole trip: on the 50E, off at Møhlenpris, on the 410, and home. */
  function wholeTrip(): TripLog {
    let log = startLog('fromWork', new Date(at('15:31')));
    // On the 50E. The forecast at Møhlenpris slips from 15:58:10 to 15:58:40.
    log = observe(log, look('15:40', the50E('15:58:10'), on50E));
    log = observe(log, look('15:50', the50E('15:58:40'), on50E));
    // Off at Møhlenpris, where the 50E was at 15:58:50.
    log = observe(log, look('15:59:30', the50E('15:58:50', 2), { ...on50E, gotOffAt: mohlenpris.id }));
    // On the 410, which left ten seconds late, and then at Krokåsskiftet.
    log = observe(log, look('16:03', the410({ left: 1 }), on410, []));
    log = observe(log, look('16:36:30', the410({ left: 1, standing: true }), on410, []));
    return finishLog(log, new Date(at('16:36:40')));
  }

  it('has the timetable against the measured time for every vehicle', () => {
    expect(tripReport(wholeTrip()).legs).toEqual([
      {
        line: '50E',
        mode: 'bus',
        destination: 'Bergen busstasjon',
        from: birkelandsskiftet,
        fromPlatform: 'D',
        departure: { aimed: at('15:30'), expected: at('15:30:20'), actual: at('15:30:20'), lateSeconds: 20 },
        to: mohlenpris,
        toPlatform: 'N',
        arrival: { aimed: at('15:57'), expected: at('15:58:50'), actual: at('15:58:50'), lateSeconds: 110 },
      },
      {
        line: '410',
        mode: 'bus',
        destination: 'Krokåsskiftet',
        from: mohlenpris,
        fromPlatform: 'S',
        departure: { aimed: at('16:02:30'), expected: at('16:02:40'), actual: at('16:02:40'), lateSeconds: 10 },
        to: krokasskiftet,
        toPlatform: null,
        arrival: { aimed: at('16:35:20'), expected: at('16:36:05'), actual: at('16:36:05'), lateSeconds: 45 },
      },
    ]);
  });

  it('has the transfer time the app showed against how the change went', () => {
    expect(tripReport(wholeTrip()).transfers).toEqual([
      {
        made: true,
        at: clock('16:03'),
        line: '410',
        from: mohlenpris,
        to: mohlenpris,
        toPlatform: 'S',
        walkSeconds: 152,
        // 15:58:10 to 16:02:30 less the walk, when first shown.
        firstForecast: { at: clock('15:40'), marginSeconds: 108 },
        // 15:58:50 to 16:02:30 less the walk, at the last look before the change.
        lastForecast: { at: clock('15:59:30'), marginSeconds: 68 },
        // The 50E was there at 15:58:50 and the 410 left at 16:02:40: 230 seconds less the walk.
        actualMarginSeconds: 78,
        actualStatus: 'tight',
        asRecommended: true,
        // What the plan had when the traveller boarded.
        planMarginSeconds: 108,
      },
    ]);
  });

  it('has the arrival against what the app first said', () => {
    const { arrival, startedAt, finishedAt, tripType } = tripReport(wholeTrip());
    expect({ tripType, startedAt, finishedAt }).toEqual({ tripType: 'fromWork', startedAt: clock('15:31'), finishedAt: clock('16:36:40') });
    expect(arrival).toEqual({
      firstEstimate: { at: clock('15:40'), arrival: clock('16:35:20'), tripId: expect.stringContaining('journey:50E') },
      lastEstimate: { at: clock('16:36:30'), arrival: clock('16:36:05'), tripId: 'journey:a@2026-11-16:stop:Møhlenpris>NSR:StopPlace:32541' },
      atLastStop: { aimed: at('16:35:20'), expected: at('16:36:05'), actual: at('16:36:05'), lateSeconds: 45 },
      walkSecondsAfter: null,
      atDoor: clock('16:36:05'),
      measured: true,
      lateSeconds: 45,
    });
  });

  it('has what happened in order', () => {
    const { events } = tripReport(wholeTrip());
    expect(events.map((event) => `${event.at.slice(11, 19)} ${event.kind}`)).toEqual([
      // In UTC, an hour behind.
      '14:40:00 boarded',
      '14:40:00 recommendation',
      '14:59:30 gotOff',
      '15:03:00 changed',
      '15:03:00 recommendation',
      '15:36:40 arrived',
    ]);
    expect(events[0]).toEqual({ kind: 'boarded', at: clock('15:40'), line: '50E', destination: 'Bergen busstasjon', stop: birkelandsskiftet });
    expect(events[1]).toMatchObject({ kind: 'recommendation', arrival: clock('16:35:20'), lines: ['50E', '410'] });
    expect(events[2]).toEqual({ kind: 'gotOff', at: clock('15:59:30'), line: '50E', stop: mohlenpris });
    expect(events[3]).toEqual({ kind: 'changed', at: clock('16:03'), line: '410', destination: 'Krokåsskiftet', stop: mohlenpris, asRecommended: true });
    expect(events[5]).toEqual({ kind: 'arrived', at: clock('16:36:40'), stop: krokasskiftet });
  });

  it('has the plan as it stood when the traveller boarded, and whether it was followed', () => {
    const { plan } = tripReport(wholeTrip());
    expect(plan).toEqual({
      at: clock('15:40'),
      arrival: clock('16:35:20'),
      legs: [
        { serviceJourneyId: 'journey:50E', date: '2026-11-16', line: '50E', from: birkelandsskiftet, to: mohlenpris, departure: at('15:30:20'), arrival: at('15:58:10'), ridden: true },
        { serviceJourneyId: 'journey:a', date: '2026-11-16', line: '410', from: mohlenpris, to: krokasskiftet, departure: at('16:02:30'), arrival: at('16:35:20'), ridden: true },
      ],
      transfers: [{ line: '410', from: mohlenpris, to: mohlenpris, toPlatform: 'S', marginSeconds: 108, walkSeconds: 152, made: true }],
      followed: true,
    });
  });

  it('keeps the plan from the first look, and the first estimate with it, however the plan changes later', () => {
    let log = startLog('fromWork', new Date(at('15:31')));
    log = observe(log, look('15:40', the50E('15:58:10'), on50E));
    // The 50E falls behind, and the plan becomes the next bus home.
    log = observe(log, look('15:55', the50E('16:01:00'), on50E));

    expect(log.planAtStart).toMatchObject({ at: clock('15:40'), trip: { arrival: clock('16:35:20') } });
    expect(log.firstEstimate).toMatchObject({ at: clock('15:40'), arrival: clock('16:35:20') });
    expect(log.estimate).toMatchObject({ at: clock('15:55'), arrival: clock('16:53') });
    expect(tripReport(log).arrival).toMatchObject({ firstEstimate: { arrival: clock('16:35:20') }, lastEstimate: { arrival: clock('16:53') } });
  });

  it('tells that the plan was not followed when the traveller rode another vehicle', () => {
    let log = startLog('fromWork', new Date(at('15:31')));
    log = observe(log, look('15:40', the50E('15:58:10'), on50E));
    log = observe(log, look('15:55', the50E('16:01:00'), on50E));
    log = observe(log, look('16:21', vehicle('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']], { left: 1 }), onLater, []));
    const report = tripReport(log);

    expect(report.plan).toMatchObject({ followed: false, legs: [{ line: '50E', ridden: true }, { line: '410', ridden: false }], transfers: [{ made: false, marginSeconds: 108 }] });
    // The change that was lost is the plan's. The one made instead was not in it.
    expect(report.transfers.map((transfer) => [transfer.made, transfer.planMarginSeconds])).toEqual([
      [false, 108],
      [true, null],
    ]);
  });

  it('takes in the answers to the app\'s questions as things that happened', () => {
    let log = observe(startLog('fromWork', new Date(at('15:31'))), look('15:40', the50E('15:58:10'), on50E));
    log = logAnswer(log, { question: { kind: 'gotOff', stop: mohlenpris, platform: 'N' }, yes: true, source: 'traveller', at: clock('15:59') });
    log = logAnswer(log, {
      question: {
        kind: 'boarded',
        vehicle: { serviceJourneyId: 'journey:a', date: '2026-11-16', line: '410', destination: 'Krokåsskiftet', stop: mohlenpris, platform: 'S', departure: at('16:02:30') },
      },
      yes: false,
      source: 'detected',
      at: clock('16:03'),
    });

    expect(log.events.slice(2)).toEqual([
      { kind: 'answer', at: clock('15:59'), question: 'gotOff', stop: mohlenpris, line: null, yes: true, source: 'traveller' },
      { kind: 'answer', at: clock('16:03'), question: 'boarded', stop: mohlenpris, line: '410', yes: false, source: 'detected' },
    ]);
  });

  it('finds where the traveller got off from the change the app showed, when it is not told', () => {
    let log = startLog('fromWork', new Date(at('15:31')));
    log = observe(log, look('15:40', the50E('15:58:10'), on50E));
    // The app is told of the 410 only. When it last looked, the 50E had not been at Møhlenpris.
    log = observe(log, look('16:03', the410({ left: 1 }), on410, []));

    const [first] = tripReport(log).legs;
    expect(first.to).toEqual(mohlenpris);
    expect(first.arrival).toEqual({ aimed: at('15:57'), expected: at('15:58:10'), actual: null, lateSeconds: null });
    // Without the measured arrival there is no saying how the change went.
    expect(tripReport(log).transfers[0]).toMatchObject({ made: true, lastForecast: { marginSeconds: 108 }, actualMarginSeconds: null, actualStatus: null });

    // The 50E looked up again, while it is still under way, gives the time it was there.
    const again = look('16:04', the50E('15:59:10', 2), on50E).vehicle;
    log = observeVehicle(log, again!);
    expect(tripReport(log).legs[0].arrival).toEqual({ aimed: at('15:57'), expected: at('15:59:10'), actual: at('15:59:10'), lateSeconds: 130 });
    expect(tripReport(log).transfers[0]).toMatchObject({ actualMarginSeconds: 58, actualStatus: 'tight' });
  });

  describe('a change that is lost', () => {
    /** On the 50E, which then falls so far behind that the 410 is given up. */
    function lost(): TripLog {
      let log = startLog('fromWork', new Date(at('15:31')));
      log = observe(log, look('15:40', the50E('15:58:10'), on50E));
      // 16:01:00 to 16:02:30 less the walk is 62 seconds too late. The next 410 is the trip.
      return observe(log, look('15:55', the50E('16:01:00'), on50E));
    }

    it('is told, with what the app last showed for it', () => {
      const log = lost();
      expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'lost', 'recommendation']);
      expect(log.events[2]).toEqual({ kind: 'lost', at: clock('15:55'), line: '410', stop: mohlenpris, marginSeconds: 108 });
    });

    it('is in the report beside the change that was made instead', () => {
      const log = observe(lost(), look('16:21', vehicle('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']], { left: 1 }), onLater, []));

      expect(tripReport(log).transfers).toMatchObject([
        { made: false, at: clock('15:55'), line: '410', to: mohlenpris, firstForecast: { marginSeconds: 108 }, lastForecast: { marginSeconds: 108 }, actualMarginSeconds: null },
        // 16:01:00 to 16:20:00 less the walk.
        { made: true, at: clock('16:21'), line: '410', lastForecast: { at: clock('15:55'), marginSeconds: 988 }, asRecommended: true },
      ]);
    });

    it('is not lost after all when the traveller makes it', () => {
      const log = observe(lost(), look('16:03', the410({ left: 1 }), on410, []));
      expect(tripReport(log).transfers).toMatchObject([{ made: true, line: '410', lastForecast: { marginSeconds: 108 }, asRecommended: false }]);
      expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'recommendation', 'changed', 'recommendation']);
    });

    it('is not lost when its vehicle is gone from the plan because it has left with the traveller on it', () => {
      // As seen against Entur: waiting at the stop, the bus leaves, and the next look has the plan on the bus after it.
      let log = startLog('fromWork', new Date(at('15:31')));
      log = observe(log, look('15:40', the50E('15:58:10'), on50E));
      const waiting = { ...on50E, gotOffAt: mohlenpris.id };
      log = observe(log, look('15:59:30', the50E('15:58:10', 2), waiting));
      log = observe(log, look('16:02:50', the50E('15:58:10', 2), waiting, later));
      expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'gotOff', 'lost', 'recommendation']);

      // The traveller then says they are on it.
      log = observe(log, look('16:03', the410({ left: 1 }), on410, []));
      expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'gotOff', 'recommendation', 'changed', 'recommendation']);
      expect(log.lost).toEqual({});
      expect(tripReport(log).transfers).toMatchObject([{ made: true, line: '410', planMarginSeconds: 108 }]);
    });

    it('is told once, though the app looks again', () => {
      const log = observe(lost(), look('15:56', the50E('16:01:00'), on50E));
      expect(log.events.filter((event) => event.kind === 'lost')).toHaveLength(1);
    });

    it('is not lost when the traveller stays on past the stop', () => {
      const both: SavedRoutes = {
        ...routes,
        alternatives: [...alternatives, { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] }],
      };
      const calls = [...leaving, ...journey('c', '400', [[busstasjonen, '16:10'], [krokasskiftet, '16:50']])];
      let log = startLog('fromWork', new Date(at('15:31')));
      log = observe(log, look('15:40', the50E('15:58:10'), on50E, calls, both));
      log = observe(log, look('15:59', the50E('15:58:10', 2), on50E, calls, both));

      expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'recommendation']);
      expect(log.lost).toEqual({});
      expect(log.estimate?.arrival).toBe(clock('16:50'));
    });
  });

  it('takes the same departure under another journey id as the same vehicle', () => {
    // Entur lists the 50E twice. The app first follows the journey that stays silent, then the one that reports.
    const silent = the50E('15:57', 0).map((call) => ({ ...call, expectedArrival: call.aimedArrival, expectedDeparture: call.aimedDeparture }));
    const reporting = the50E('15:58:10').map((call) => ({ ...call, serviceJourneyId: 'journey:50E-twin' }));
    let log = startLog('fromWork', new Date(at('15:31')));
    log = observe(log, look('15:32', silent, on50E));
    log = observe(log, look('15:40', reporting, { ...on50E, serviceJourneyId: 'journey:50E-twin' }));

    expect(log.legs).toHaveLength(1);
    expect(log.changes).toEqual([]);
    expect(log.legs[0]).toMatchObject({ serviceJourneyId: 'journey:50E-twin', departure: { actual: at('15:30:20') } });
    expect(log.events.map((event) => event.kind)).toEqual(['boarded', 'recommendation', 'recommendation']);

    // The change to the 410 is then logged against the journey that reports.
    log = observe(log, look('15:59:30', reporting.map((call, index) => (index === 1 ? { ...call, actualArrival: call.expectedArrival, actualDeparture: call.expectedDeparture } : call)), { ...on50E, serviceJourneyId: 'journey:50E-twin', gotOffAt: mohlenpris.id }));
    log = observe(log, look('16:03', the410({ left: 1 }), on410, []));
    expect(tripReport(log).transfers).toMatchObject([{ made: true, line: '410', firstForecast: { at: clock('15:40'), marginSeconds: 108 }, asRecommended: true }]);
  });

  it('tells when the traveller did not change as the top trip said', () => {
    let log = startLog('fromWork', new Date(at('15:31')));
    log = observe(log, look('15:40', the50E('15:58:10'), on50E));
    // The top trip says the 410 at 16:02:30. The traveller is on the one at 16:20.
    log = observe(log, look('16:21', vehicle('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']], { left: 1 }), onLater, []));

    expect(log.events[2]).toMatchObject({ kind: 'changed', asRecommended: false });
    // The app never showed that change, so it has no transfer time for it.
    expect(tripReport(log).transfers).toMatchObject([{ made: true, walkSeconds: null, firstForecast: null, lastForecast: null, asRecommended: false }]);
    expect(tripReport(log).legs[0].to).toEqual(mohlenpris);
  });

  it('leaves the log as it is for a look without a vehicle, and after the trip is ended', () => {
    const log = wholeTrip();
    expect(observe(log, look('16:40', the410({ left: 1, standing: true }), on410, []))).toBe(log);
    expect(finishLog(log, new Date(at('16:50')))).toBe(log);

    const started = startLog('fromWork', new Date(at('15:31')));
    expect(observe(started, look('15:40', [], on50E))).toBe(started);
  });

  it('has no arrival before the trip is ended', () => {
    const log = observe(startLog('fromWork', new Date(at('15:31'))), look('15:40', the50E('15:58:10'), on50E));
    expect(tripReport(log).arrival).toMatchObject({ atLastStop: null, atDoor: null, measured: false, lateSeconds: null });
    expect(tripReport(log).finishedAt).toBeNull();
  });
});

describe('a trip to work that ends with a walk', () => {
  const routes: SavedRoutes = {
    ...NO_ROUTES,
    alternatives: [{ key: 'dolvik', tripType: 'toWork', legs: [ride('400', krokasskiftet, dolvik), ride('51', dolvik, blomsterdalen)] }],
    connections: [{ key: 'from-blomsterdalen', tripType: 'toWork', anchor: blomsterdalen, legs: [walk(blomsterdalen, work, 660)] }],
  };
  const on51: Following = { serviceJourneyId: 'journey:51', date: '2026-11-16', boardedAt: dolvik.id };
  const the51 = (options: { left: number; standing?: boolean }) =>
    vehicle('51', '51', [[dolvik, '07:55'], [blomsterdalen, '08:05', { expected: '08:06:30' }], [stop('Flyplassen'), '08:12']], options);
  const look = (now: string, journeyCalls: JourneyCall[]) =>
    planOnBoard('toWork', tripPaths(routes, 'toWork'), journeyCalls, [], routes, new Date(at(now)), on51);

  it('counts the walk from where the top trip ended into the arrival at the door', () => {
    let log = startLog('toWork', new Date(at('07:56')));
    log = observe(log, look('07:57', the51({ left: 1 })));
    // At Blomsterdalen, a minute and a half late. The app is told that the traveller is there after the walk.
    log = observe(log, look('08:06:40', the51({ left: 1, standing: true })));
    const report = tripReport(finishLog(log, new Date(at('08:18'))));

    expect(report.legs[0]).toMatchObject({ to: blomsterdalen, arrival: { actual: at('08:06:30'), lateSeconds: 90 } });
    expect(report.arrival).toEqual({
      firstEstimate: { at: clock('07:57'), arrival: clock('08:17:30'), tripId: expect.any(String) },
      lastEstimate: { at: clock('08:06:40'), arrival: clock('08:17:30'), tripId: expect.any(String) },
      atLastStop: { aimed: at('08:05'), expected: at('08:06:30'), actual: at('08:06:30'), lateSeconds: 90 },
      walkSecondsAfter: 660,
      atDoor: clock('08:17:30'),
      measured: true,
      lateSeconds: 0,
    });
    expect(report.events[report.events.length - 1]).toEqual({ kind: 'arrived', at: clock('08:18'), stop: blomsterdalen });
  });

  it('uses the last forecast, and says so, when the arrival was never measured', () => {
    const log = observe(startLog('toWork', new Date(at('07:56'))), look('07:57', the51({ left: 1 })));
    const { arrival } = tripReport(finishLog(log, new Date(at('08:18'))));
    expect(arrival).toMatchObject({ atDoor: clock('08:17:30'), measured: false, atLastStop: { actual: null, lateSeconds: null } });
  });

  it('ends where it is told that the traveller got off', () => {
    const log = observe(startLog('toWork', new Date(at('07:56'))), look('07:57', the51({ left: 1 })));
    const report = tripReport(finishLog(log, new Date(at('08:20')), 'stop:Flyplassen'));
    // That is not where the top trip ended, so the app has no walk to count from there.
    expect(report.legs[0].to).toEqual(stop('Flyplassen'));
    expect(report.arrival).toMatchObject({ walkSecondsAfter: null, atDoor: clock('08:12') });
  });
});
