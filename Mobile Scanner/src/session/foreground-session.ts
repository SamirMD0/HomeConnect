import { markSessionForForegroundCheck, prepareApiSession } from '../api/hc-client';

type AppStateSource = {
  currentState: string;
  addEventListener(event: 'change', listener: (state: string) => void): { remove(): void };
};

export function registerForegroundSession(appState: AppStateSource) {
  let previous = appState.currentState;
  const subscription = appState.addEventListener('change', (state) => {
    if (state !== 'active' || previous !== 'active') markSessionForForegroundCheck();
    if (state === 'active' && previous !== 'active') {
      // mark synchronously before focus refetches or queue sync can start.
      // Network failures are reported through the session's offline banner.
      void prepareApiSession().catch(() => undefined);
    }
    previous = state;
  });
  return () => subscription.remove();
}
