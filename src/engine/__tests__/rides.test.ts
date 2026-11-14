import { at, journey, ride, stop, type VisitOptions } from '@/engine/__fixtures__/calls';
import { groupCallsByStop, isLive, isPrecise, ridesOnLeg, type Ride } from '@/engine/rides';
import type { StopCall } from '@/entur/calls';
import type { TransitLeg } from '@/model/types';

const krokasskiftet = stop('Krokåsskiftet');
const storavatnet = stop('Storavatnet');
const busstasjonen = stop('Bergen busstasjon');
const ravnanger = stop('Ravnanger');

const leg = ride('400, 410', krokasskiftet, storavatnet) as TransitLeg;

const rides = (calls: StopCall[], onLeg = leg) => ridesOnLeg(onLeg, groupCallsByStop(calls));
const clocks = (found: Ride[]) =>
  found.map((r) => `${r.line} ${r.boarding.expected.slice(11, 19)}–${r.alighting.expected.slice(11, 19)}`);

describe('ridesOnLeg', () => {
  it('pairs a departure from the first stop with the same vehicle arriving at the second', () => {
    const [found] = rides(
      journey(
        'a',
        '400',
        [
          [ravnanger, '06:57'],
          [krokasskiftet, '07:07', { expected: '07:09:20' }],
          [storavatnet, '07:28', { expected: '07:31:05', platform: 'B' }],
          [busstasjonen, '07:42'],
        ],
        { typicalDelay: { p50Seconds: 60, p90Seconds: 240 } },
      ),
    );

    expect(found).toEqual({
      serviceJourneyId: 'journey:a',
      date: '2026-11-16',
      line: '400',
      mode: 'bus',
      destination: 'Bergen busstasjon',
      boarding: {
        stop: krokasskiftet,
        quayId: 'quay:Krokåsskiftet',
        platform: null,
        aimed: at('07:07'),
        expected: at('07:09:20'),
        realtime: true,
        typicalDelay: { p50Seconds: 60, p90Seconds: 240 },
      },
      alighting: {
        stop: storavatnet,
        quayId: 'quay:Storavatnet:B',
        platform: 'B',
        aimed: at('07:28'),
        expected: at('07:31:05'),
        realtime: true,
        typicalDelay: { p50Seconds: 60, p90Seconds: 240 },
      },
      started: true,
      predictionInaccurate: false,
    });
  });

  it('takes every line of the leg, earliest departure first, and no other line', () => {
    const found = rides([
      ...journey('late', '400', [[krokasskiftet, '07:27'], [storavatnet, '07:48']]),
      ...journey('other', '403', [[krokasskiftet, '07:05'], [storavatnet, '07:30']]),
      ...journey('early', '410', [[krokasskiftet, '07:12'], [storavatnet, '07:35']]),
    ]);
    expect(clocks(found)).toEqual(['410 07:12:00–07:35:00', '400 07:27:00–07:48:00']);
  });

  it('sorts on the forecast, not the timetable', () => {
    const found = rides([
      ...journey('delayed', '400', [[krokasskiftet, '07:07', { expected: '07:20' }], [storavatnet, '07:28', { expected: '07:41' }]]),
      ...journey('on-time', '410', [[krokasskiftet, '07:12'], [storavatnet, '07:35']]),
    ]);
    expect(found.map((r) => r.serviceJourneyId)).toEqual(['journey:on-time', 'journey:delayed']);
  });

  it('drops a vehicle going the other way, which never reaches the second stop afterwards', () => {
    const found = rides([
      ...journey('home', '400', [[busstasjonen, '07:00'], [storavatnet, '07:14'], [krokasskiftet, '07:35'], [ravnanger, '07:45']]),
      ...journey('to-town', '400', [[krokasskiftet, '07:07'], [storavatnet, '07:28']]),
    ]);
    expect(found.map((r) => r.serviceJourneyId)).toEqual(['journey:to-town']);
  });

  it('drops a departure whose arrival Entur has not given, such as one beyond the time range', () => {
    const [atKrokasskiftet] = journey('far', '400', [[krokasskiftet, '09:55'], [storavatnet, '10:16']]);
    expect(rides([atKrokasskiftet])).toEqual([]);
  });

  it('gives no ride for a cancelled call, or where boarding or alighting is not allowed', () => {
    const run = (id: string, first: VisitOptions, second: VisitOptions) =>
      journey(id, '400', [[krokasskiftet, '07:07', first], [storavatnet, '07:28', second]]);

    expect(rides(run('a', { cancelled: true }, {}))).toEqual([]);
    expect(rides(run('b', {}, { cancelled: true }))).toEqual([]);
    expect(rides(run('c', { forBoarding: false }, {}))).toEqual([]);
    expect(rides(run('d', {}, { forAlighting: false }))).toEqual([]);
    expect(rides(run('e', {}, {}))).toHaveLength(1);
  });

  it('does not pair calls of the same journey on different service dates', () => {
    const monday = journey('a', '400', [[krokasskiftet, '07:07'], [storavatnet, '07:28']]);
    const tuesday = journey('a', '400', [[krokasskiftet, '07:07'], [storavatnet, '07:28']], { day: '2026-11-17' });
    const found = rides([monday[0], tuesday[1]]);
    expect(found).toEqual([]);
    expect(rides([...monday, ...tuesday])).toHaveLength(2);
  });

  describe('a journey Entur lists twice', () => {
    const twin = (id: string, options: Partial<StopCall>, expected?: string) =>
      journey(
        id,
        '400',
        [[krokasskiftet, '07:27', { expected }], [storavatnet, '07:48', { expected: expected && '07:53:10' }]],
        options,
      );

    it('keeps the one with real-time data, whichever comes first', () => {
      const planned = twin('planned', { realtime: false, started: false });
      const live = twin('live', {}, '07:32:40');

      for (const calls of [[...planned, ...live], [...live, ...planned]]) {
        const found = rides(calls);
        expect(found.map((r) => r.serviceJourneyId)).toEqual(['journey:live']);
        expect(found[0].boarding.expected).toBe(at('07:32:40'));
      }
    });

    it('keeps the one that is under way when Entur has flagged both, whichever comes first', () => {
      // As seen on 14 November 2026: the journey that does not report keeps the flag and the timetable.
      const silent = twin('silent', { started: false });
      const underWay = twin('under-way', {}, '07:30:31');

      for (const calls of [[...silent, ...underWay], [...underWay, ...silent]]) {
        const found = rides(calls);
        expect(found.map((r) => r.serviceJourneyId)).toEqual(['journey:under-way']);
        expect(found[0]).toMatchObject({ started: true, boarding: { expected: at('07:30:31') }, alighting: { expected: at('07:53:10') } });
      }
    });

    it('keeps the one that is under way before one that only has the flag', () => {
      const flagged = twin('flagged', { started: false });
      const underWay = twin('under-way', { realtime: false });
      expect(rides([...flagged, ...underWay]).map((r) => r.serviceJourneyId)).toEqual(['journey:under-way']);
    });

    it('keeps the first when both are flagged and neither has started', () => {
      const found = rides([...twin('one', { started: false }), ...twin('two', { started: false })]);
      expect(found.map((r) => r.serviceJourneyId)).toEqual(['journey:one']);
    });

    it('keeps one when neither has real-time data', () => {
      const found = rides([
        ...twin('one', { realtime: false, started: false }),
        ...twin('two', { realtime: false, started: false }),
      ]);
      expect(found).toHaveLength(1);
    });

    it('keeps both when they differ in timetable or platform', () => {
      const found = rides([
        ...twin('one', { realtime: false }),
        ...journey('later', '400', [[krokasskiftet, '07:28'], [storavatnet, '07:48']]),
        ...journey('other-platform', '400', [[krokasskiftet, '07:27', { platform: 'A' }], [storavatnet, '07:48']]),
      ]);
      expect(found).toHaveLength(3);
    });
  });

  describe('a route that passes a stop twice', () => {
    const blomsterdalen = stop('Blomsterdalen');
    const grana = stop('Grana');
    const birkelandsskiftet = stop('Birkelandsskiftet');

    it('boards the last time the vehicle passes the first stop before the second', () => {
      const found = rides(
        journey('loop', '57', [
          [blomsterdalen, '15:10'],
          [grana, '15:14'],
          [blomsterdalen, '15:18'],
          [birkelandsskiftet, '15:21'],
        ]),
        ride('57', blomsterdalen, birkelandsskiftet) as TransitLeg,
      );
      expect(clocks(found)).toEqual(['57 15:18:00–15:21:00']);
    });

    it('gets off the first time the vehicle reaches the second stop after boarding', () => {
      const found = rides(
        journey('loop', '57', [
          [birkelandsskiftet, '15:00'],
          [grana, '15:04'],
          [birkelandsskiftet, '15:09'],
          [blomsterdalen, '15:12'],
          [birkelandsskiftet, '15:16'],
        ]),
        ride('57', grana, birkelandsskiftet) as TransitLeg,
      );
      expect(clocks(found)).toEqual(['57 15:04:00–15:09:00']);
    });

    it('gives a ride for each round', () => {
      const found = rides(
        journey('rounds', '57', [
          [grana, '15:04'],
          [birkelandsskiftet, '15:09'],
          [grana, '15:24'],
          [birkelandsskiftet, '15:29'],
        ]),
        ride('57', grana, birkelandsskiftet) as TransitLeg,
      );
      expect(clocks(found)).toEqual(['57 15:04:00–15:09:00', '57 15:24:00–15:29:00']);
    });
  });
});

describe('isLive and isPrecise', () => {
  const of = (options: Partial<StopCall>) =>
    rides(journey('a', '400', [[krokasskiftet, '07:07'], [storavatnet, '07:28']], options))[0];

  it('takes the forecast as live only for a vehicle that is under way and reports', () => {
    expect(isLive(of({ started: true, realtime: true }))).toBe(true);
    // Entur sets the flag hours before the journey starts.
    expect(isLive(of({ started: false, realtime: true }))).toBe(false);
    expect(isLive(of({ started: true, realtime: false }))).toBe(false);
  });

  it('takes light rail and boat without a live forecast as exact', () => {
    expect(isPrecise(of({ transportMode: 'tram', realtime: false, started: false }))).toBe(true);
    expect(isPrecise(of({ transportMode: 'water', realtime: false, started: false }))).toBe(true);
    expect(isPrecise(of({ transportMode: 'water', realtime: true, started: false }))).toBe(true);
  });

  it('does not for a bus, nor for a boat that is under way and reports', () => {
    expect(isPrecise(of({ transportMode: 'bus', realtime: false, started: false }))).toBe(false);
    expect(isPrecise(of({ transportMode: 'bus', realtime: true, started: false }))).toBe(false);
    expect(isPrecise(of({ transportMode: 'water', realtime: true, started: true }))).toBe(false);
  });
});
