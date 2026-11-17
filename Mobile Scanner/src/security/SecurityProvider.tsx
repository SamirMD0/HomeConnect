import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { ownerKey } from '../offline/outbox';
import { openLocalDb } from '../offline/expo-db';
import { PinController } from './pin-controller';
import { authenticateBiometric } from './biometrics';
import { secretStorage } from './storage';
import { setSecurityController } from './runtime';
import { protectCloudPreview } from './preview-protection';
interface Security {
  controller: PinController | null;
  ready: boolean;
  error: string | null;
  offering: boolean;
  previewProtected: boolean;
  setup: (pin: string, again: string) => Promise<void>;
  finishOffer: () => void;
}
const Context = createContext<Security | null>(null);
export function SecurityProvider({ children }: PropsWithChildren) {
  const session = useSession(),
    latest = useRef(session);
  latest.current = session;
  const owner = session.cloudPairing ? ownerKey(session.cloudPairing) : null;
  const [controller, setController] = useState<PinController | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [offering, setOffering] = useState(false);
  const [previewProtected, setPreviewProtected] = useState(false);
  const cloud = Boolean(owner);
  useEffect(() => {
    setPreviewProtected(false);
    if (!cloud) return;
    let active = true;
    let release: (() => Promise<void>) | undefined;
    const protection = protectCloudPreview().then(async (cleanup) => {
      if (!active) {
        await cleanup();
        return;
      }
      release = cleanup;
      if (active) setPreviewProtected(true);
    });
    void protection.catch(() => {});
    return () => {
      active = false;
      void release?.().catch(() => {});
    };
  }, [cloud]);
  useEffect(() => {
    setReady(false);
    setError(null);
    setOffering(false);
    if (!owner) {
      setController(null);
      setSecurityController(null);
      return;
    }
    let active = true;
    const current = new PinController(owner, {
      storage: secretStorage,
      random: async () =>
        Array.from((await import('expo-crypto')).getRandomBytes(16), (byte) =>
          byte.toString(16).padStart(2, '0')
        ).join(''),
      biometric: authenticateBiometric,
      wipe: (message) => latest.current.signOut(message),
    });
    setController(current);
    setSecurityController(current);
    current.appState(AppState.currentState);
    const subscription = AppState.addEventListener('change', current.appState);
    void Promise.all([current.load(), openLocalDb()])
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active)
          setError(
            'Secure phone storage could not open. Use the new phone app, then try again. Your saved actions have not been removed.'
          );
      });
    return () => {
      active = false;
      subscription.remove();
      void current.stop();
    };
  }, [owner]);
  const matched = owner && controller?.owner === owner ? controller : null;
  return (
    <Context.Provider
      value={{
        controller: matched,
        ready: Boolean(matched) && ready,
        error,
        offering,
        previewProtected,
        setup: async (pin, again) => {
          if (!matched) throw new Error('Wait for secure storage.');
          setOffering(true);
          try {
            await matched.setup(pin, again);
            if (matched.getState().phase !== 'unlocked') setOffering(false);
          } catch (error) {
            setOffering(false);
            throw error;
          }
        },
        finishOffer: () => setOffering(false),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSecurity() {
  const value = useContext(Context);
  if (!value) throw new Error('SecurityProvider is required');
  return value;
}
const EMPTY = { phase: 'loading' as const, hidden: false, record: null, error: null };
export function useLockState() {
  const { controller } = useSecurity();
  return useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getState ?? (() => EMPTY),
    controller?.getState ?? (() => EMPTY)
  );
}
