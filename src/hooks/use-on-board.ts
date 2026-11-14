import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { ON_BOARD_REFRESH_INTERVAL_MS } from '@/config';
import { useActive } from '@/hooks/use-active';
import { onBoardStore, type OnBoardState } from '@/onboard/store';

export interface OnBoard {
  /** The trip on board. Null when there is none. */
  state: OnBoardState | null;
  /** Answers the question that is asked, and looks again at once. */
  answer: (yes: boolean) => void;
  /** "Jeg har gått av". False when the app does not yet know where the vehicle is. */
  gotOff: () => boolean;
  /** Whether "Jeg har gått av" can be taken now. */
  canGetOff: boolean;
  /** Looks again now, as after a failure. */
  refresh: () => void;
  /** Ends the trip where there is no way on: it is over, and the screen goes back to the front page. */
  finish: () => void;
  /** Leaves the trip. */
  end: () => void;
}

/** True while a trip on board is going, so that the front page can lead back to it. */
export function useTripGoing(): boolean {
  const state = useSyncExternalStore(onBoardStore.subscribe, onBoardStore.get, onBoardStore.get);
  return state !== null && !state.over;
}

/**
 * The trip on board, which lasts while the app is open, apart from the screen.
 * While the screen is in view with the app in the foreground, Entur is looked
 * at once and then every ON_BOARD_REFRESH_INTERVAL_MS, and not otherwise.
 */
export function useOnBoard(): OnBoard {
  const state = useSyncExternalStore(onBoardStore.subscribe, onBoardStore.get, onBoardStore.get);
  const active = useActive();
  const going = state !== null && !state.over;

  useEffect(() => {
    if (!active || !going) return;
    void onBoardStore.refresh();
    const timer = setInterval(() => void onBoardStore.refresh(), ON_BOARD_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, going]);

  const answer = useCallback((yes: boolean) => {
    onBoardStore.answer(yes);
    void onBoardStore.refresh();
  }, []);

  const gotOff = useCallback(() => {
    const done = onBoardStore.gotOff();
    if (done) void onBoardStore.refresh();
    return done;
  }, []);

  const refresh = useCallback(() => void onBoardStore.refresh(), []);
  const finish = useCallback(() => onBoardStore.finish(), []);
  const end = useCallback(() => onBoardStore.end(), []);

  // Read again whenever the trip changes, which is at every look.
  const canGetOff = state !== null && onBoardStore.canGetOff();

  return { state, answer, gotOff, canGetOff, refresh, finish, end };
}
