import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { REFRESH_INTERVAL_MS } from '@/config';
import { planTrips, type TripPlan } from '@/engine/plan';
import { log } from '@/logging/logger';
import type { TripTypeId } from '@/model/types';
import { loadRoutes } from '@/storage/alternatives';

/** What is known for one trip type. */
interface Known {
  /** The latest plan that arrived. Kept while a new one is fetched, and when fetching fails. */
  plan: TripPlan | null;
  /** True when no alternatives are saved for the trip type, so there is nothing to plan. */
  noRoutes: boolean;
  /** Set when the latest fetch failed. */
  failed: boolean;
}

const NOTHING: Known = { plan: null, noRoutes: false, failed: false };

export interface TripPlanState extends Known {
  /** True until the first answer, or failure, for this trip type has arrived. */
  loading: boolean;
  refresh: () => void;
}

/** True while the screen is focused and the app is in the foreground. */
function useActive(): boolean {
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);

  return focused && foreground;
}

/**
 * The planned trips for a trip type, fetched when the screen comes into view
 * and every REFRESH_INTERVAL_MS while it stays in view with the app in the
 * foreground. The plan already shown stays until a new one has arrived, so
 * nothing blinks while fetching, and stays with a failure flag when a fetch
 * fails. What is known for the other trip type is kept, so switching back
 * shows it at once while it is refreshed.
 */
export function useTripPlan(tripType: TripTypeId): TripPlanState {
  const active = useActive();
  const [known, setKnown] = useState<Partial<Record<TripTypeId, Known>>>({});
  const [settled, setSettled] = useState<Partial<Record<TripTypeId, boolean>>>({});
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    const update = (next: Partial<Known>) => {
      if (current.signal.aborted) return;
      setKnown((all) => ({ ...all, [tripType]: { ...NOTHING, ...all[tripType], ...next } }));
      setSettled((all) => (all[tripType] ? all : { ...all, [tripType]: true }));
    };

    (async () => {
      const routes = await loadRoutes();
      if (!routes.alternatives.some((alternative) => alternative.tripType === tripType)) {
        update({ plan: null, noRoutes: true, failed: false });
        return;
      }
      const plan = await planTrips(tripType, new Date(), { routes, entur: { signal: current.signal } });
      update({ plan, noRoutes: false, failed: false });
    })().catch((error: unknown) => {
      if (current.signal.aborted) return;
      log.error(error, { where: 'useTripPlan', tripType });
      update({ failed: true });
    });
  }, [tripType]);

  useEffect(() => {
    if (!active) return;
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [active, refresh]);

  const current = known[tripType] ?? NOTHING;
  return { ...current, loading: !settled[tripType], refresh };
}
