import { useCallback, useEffect, useRef, useState } from 'react';

import { REFRESH_INTERVAL_MS } from '@/config';
import { fetchDepartures, type DepartureBoard } from '@/entur/departures';

export interface DeparturesState {
  board: DepartureBoard | null;
  /** True only until the first answer, or failure, has arrived. */
  loading: boolean;
  /** Set when the latest fetch failed. An older board may still be shown. */
  failed: boolean;
  refresh: () => void;
}

/** Fetches the departure board for a stop and keeps it fresh while mounted. */
export function useDepartures(stopPlaceId: string): DeparturesState {
  const [board, setBoard] = useState<DepartureBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    fetchDepartures(stopPlaceId, 12, { signal: current.signal })
      .then((next) => {
        setBoard(next);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        if (current.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });
  }, [stopPlaceId]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
    };
  }, [refresh]);

  return { board, loading, failed, refresh };
}
