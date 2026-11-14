import { at, journey, ride, stop, transferWalk, walk } from '@/engine/__fixtures__/calls';
import { tripPaths } from '@/engine/paths';
import type { StopCall } from '@/entur/calls';
import type { JourneyCall } from '@/entur/journey';
import type { Alternative, StopRef } from '@/model/types';
import { vehicle } from '@/onboard/__fixtures__/vehicle';
import { planOnBoard, type OnBoardPlan } from '@/onboard/follow';
import { afterLook, startSession, type OnBoardSession } from '@/onboard/session';
import { NO_ROUTES, type SavedRoutes } from '@/storage/alternatives';

/**
 * A trip from work on the 50E, with a change at Møhlenpris or at the bus
 * station, and a stop on the way, Danmarksplass, where no saved way goes on.
 */
export const work: StopRef = { id: 'place:work', name: 'Jobb' };
export const krokasskiftet: StopRef = { id: 'NSR:StopPlace:32541', name: 'Krokåsskiftet' };
export const birkelandsskiftet = stop('Birkelandsskiftet');
export const danmarksplass = stop('Danmarksplass');
export const mohlenpris = stop('Møhlenpris');
export const busstasjonen = stop('Bergen busstasjon');

const alternatives: Alternative[] = [
  { key: 'mohlenpris', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, mohlenpris), ride('400, 410', mohlenpris, krokasskiftet)] },
  { key: 'busstasjonen', tripType: 'fromWork', legs: [ride('50E', birkelandsskiftet, busstasjonen), ride('400, 410', busstasjonen, krokasskiftet)] },
];
export const routes: SavedRoutes = {
  ...NO_ROUTES,
  alternatives,
  connections: [{ key: 'walk-birk', tripType: 'fromWork', anchor: birkelandsskiftet, legs: [walk(work, birkelandsskiftet, 1200)] }],
  transferWalks: [transferWalk(mohlenpris, 'N', mohlenpris, 'S', 152)],
};
export const paths = tripPaths(routes, 'fromWork');

/** The 50E from Birkelandsskiftet: Danmarksplass 15:45, Møhlenpris 15:58:10, the bus station 16:05. */
export const the50E = (options: Parameters<typeof vehicle>[3] = { left: 1 }) =>
  vehicle(
    '50E',
    '50E',
    [
      [birkelandsskiftet, '15:30', { platform: 'D' }],
      [danmarksplass, '15:45'],
      [mohlenpris, '15:57', { expected: '15:58:10', platform: 'N' }],
      [busstasjonen, '16:05'],
    ],
    options,
  );

/** The 410 home from Møhlenpris at 16:02:30. */
export const the410 = (options: Parameters<typeof vehicle>[3]) =>
  vehicle('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']], options);

/** Buses home: from Møhlenpris at 16:02:30 and 16:20, and from the bus station at 16:30. */
export const busesHome: StopCall[] = [
  ...journey('a', '410', [[mohlenpris, '16:02:30', { platform: 'S' }], [krokasskiftet, '16:35']]),
  ...journey('b', '410', [[mohlenpris, '16:20', { platform: 'S' }], [krokasskiftet, '16:53']]),
  ...journey('c', '400', [[busstasjonen, '16:30'], [krokasskiftet, '17:10']]),
];

export const onThe50E = startSession('fromWork', { serviceJourneyId: 'journey:50E', date: '2026-11-16', boardedAt: birkelandsskiftet.id });
export const onThe410 = startSession('fromWork', { serviceJourneyId: 'journey:a', date: '2026-11-16', boardedAt: mohlenpris.id });

/** The plan at a moment, for the session's vehicle with these calls. */
export const look = (session: OnBoardSession, now: string, journeyCalls: JourneyCall[], calls: StopCall[] = busesHome): OnBoardPlan =>
  planOnBoard('fromWork', paths, journeyCalls, calls, routes, new Date(at(now)), session.following, session.memory);

/** Looks, and gives the plan and the session after it with the question asked. */
export function see(session: OnBoardSession, now: string, journeyCalls: JourneyCall[], calls: StopCall[] = busesHome) {
  const plan = look(session, now, journeyCalls, calls);
  return { plan, ...afterLook(session, plan) };
}

/** The rides of the active plan, as "line from→to". */
export const planOf = (plan: OnBoardPlan) =>
  plan.activePlan?.rows.flatMap((row) => (row.kind === 'ride' ? [`${row.line} ${row.from.name}→${row.to.name}`] : []));
