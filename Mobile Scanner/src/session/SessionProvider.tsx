import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { fetchMe, type AuthenticatedUser } from '../api/auth-api';
import {
  backendBaseUrl,
  configureApiSession,
  HcApiError,
  refreshApiSession,
} from '../api/hc-client';
import type { CompatibilityState } from '../api/system-api';
import { findPc } from '../connection/find-pc';
import { useBranchSession } from '../branches/useBranchSession';
import { clearQueryCache } from '../query/client';
import {
  loadAuthUser,
  loadConnection,
  requireSecureStorage,
  saveAuthUser,
  saveConnection,
} from '../storage/secure-storage';
import type { ConnectionSettings } from '../types/scanner.types';
import { can, type Permission } from '../permissions/can';
import { TokenSession } from './token-session';
import { registerForegroundSession } from './foreground-session';
import { loadCloudPairing, saveCloudPairing, clearCloudPairing } from '../offline/cloud-storage';
import { pairedUser, type CloudPairing } from '../offline/cloud-pairing';
import { setCloudMode, wipeCloudData } from '../offline/cloud-mode';
import { setSelectedBranch, type MobileBranch } from '../branches/branch-selection';

function useSessionState() {
  const [cloud, setCloud] = useState<CloudPairing | null>(null);
  const cloudRef = useRef(cloud); cloudRef.current = cloud;
  const [cloudUser, setCloudUser] = useState<AuthenticatedUser | null>(null);
  const [cloudBranches, setCloudBranches] = useState<MobileBranch[]>([]);
  const [cloudBranchId, setCloudBranchId] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);
  const enterCloud = (pairing: CloudPairing) => {
    setCloudMode(true); setCloud(pairing); setCloudUser(pairedUser(pairing));
    setCloudBranches(pairing.branchIds.map((id, index) => ({ id, name: `Branch ${index + 1}` })));
    setCloudBranchId(pairing.branchIds[0]!);
  };
  const [restoring, setRestoring] = useState(true);
  const [connection, setConnection] = useState<ConnectionSettings | null>(null);
  const connectionRef = useRef(connection);
  connectionRef.current = connection;
  const [token, setToken] = useState<string | null>(null);
  const [credentials] = useState(() => new TokenSession(setToken));
  const [offline, setOffline] = useState(false);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [userVerified, setUserVerified] = useState(false);
  const verifiedRef = useRef(userVerified);
  verifiedRef.current = userVerified;
  const [sessionRevision, setSessionRevision] = useState(0);
  const [compat, setCompat] = useState<CompatibilityState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  // A connection whose PC was already found (by the connect screen or a
  // re-search), so the startup check does not search again for it.
  const resolvedRef = useRef<{ connection: ConnectionSettings; compat: CompatibilityState } | null>(
    null
  );
  const searchingRef = useRef(false);
  const lastSearchRef = useRef(0);
  const switchTo = useCallback(async (found: { settings: ConnectionSettings; compat: CompatibilityState }) => {
    await saveConnection(found.settings).catch(() => undefined);
    resolvedRef.current = { connection: found.settings, compat: found.compat };
    setConnection(found.settings);
  }, []);
  // The PC stopped answering: look for it on its other addresses (its IP can
  // change after a router restart). At most once every 30 seconds.
  const searchAgain = useCallback(() => {
    const current = connectionRef.current;
    if (!current?.alternates?.length || searchingRef.current) return;
    if (Date.now() - lastSearchRef.current < 30_000) return;
    searchingRef.current = true;
    lastSearchRef.current = Date.now();
    void findPc(current)
      .then(async (found) => {
        if (connectionRef.current === current && found.settings.host !== current.host)
          await switchTo(found);
      })
      .catch(() => undefined)
      .finally(() => {
        searchingRef.current = false;
      });
  }, [switchTo]);
  const [restoreRevision, setRestoreRevision] = useState(0);
  const signOut = useCallback(async (notice?: string) => {
    if (cloudRef.current) {
      await clearCloudPairing();
      try { await wipeCloudData(); }
      finally {
        setCloudMode(false); setCloud(null); setCloudUser(null); setCloudBranches([]); setCloudBranchId(null);
        setConnection(null); setCompat(null); setError(null); setConnectionNotice(notice ?? null);
        await clearQueryCache();
      }
      return;
    }
    const clearing = credentials.signOut(connectionRef.current);
    setUser(null);
    setUserVerified(false);
    setSessionRevision((value) => value + 1);
    setOffline(false);
    try {
      await Promise.all([clearQueryCache(), clearing]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not clear the saved session.');
    }
  }, [credentials]);
  useEffect(() => registerForegroundSession(AppState), []);
  useEffect(() => {
    let active = true;
    setRestoring(true);
    setError(null);
    void (async () => {
      try {
        await requireSecureStorage();
        const savedCloud = await loadCloudPairing();
        if (savedCloud) { if (active) enterCloud(savedCloud); return; }
        const [savedConnection, savedUser] = await Promise.all([
          loadConnection(),
          loadAuthUser(),
          credentials.restore(),
        ]);
        if (!active) return;
        setConnection(savedConnection);
        setUser(savedUser);
      } catch (failure) {
        if (active)
          setError(failure instanceof Error ? failure.message : 'Could not restore the session.');
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [restoreRevision, credentials]);
  useEffect(() => {
    if (!connection) return;
    configureApiSession({
      baseUrl: backendBaseUrl(connection),
      getToken: () => credentials.accessToken,
      signOut,
      refresh: () => credentials.refresh(connection),
      onConnectionChange: (online) => {
        setOffline(!online);
        if (!online) searchAgain();
      },
    });
    return () => configureApiSession(null);
  }, [connection, signOut, sessionRevision, credentials, searchAgain]);
  useEffect(() => {
    if (restoring || !connection) return;
    let active = true;
    setError(null);
    const resolved = resolvedRef.current;
    if (resolved?.connection === connection) {
      setCompat(resolved.compat);
      return;
    }
    setCompat(null);
    void findPc(connection)
      .then(async (found) => {
        if (!active) return;
        if (sameAddresses(found.settings, connection)) setCompat(found.compat);
        else await switchTo(found);
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [connection, restoring, revision, switchTo]);
  useEffect(() => {
    if (!connection || !token) return;
    let active = true;
    void fetchMe(connection, token)
      .then(async (current) => {
        if (active) {
          setUser(current);
          setUserVerified(true);
          await saveAuthUser(current);
        }
      })
      .catch(async (failure) => {
        if (active && failure instanceof HcApiError && failure.kind === 'UNAUTHORIZED')
          await signOut();
        else if (
          active &&
          failure instanceof HcApiError &&
          failure.kind === 'NETWORK' &&
          verifiedRef.current
        )
          setOffline(true);
        else if (active)
          setError(failure instanceof Error ? failure.message : 'Could not verify your account.');
      });
    return () => {
      active = false;
    };
  }, [connection, token, signOut, revision]);
  const branch = useBranchSession(
    !cloud && compat && !compat.blocked ? connection : null,
    user && userVerified ? token : null,
    signOut
  );
  useEffect(() => { if (cloud) setSelectedBranch(cloudBranchId); }, [cloud, cloudBranchId]);
  const cloudBranch = {
    selected: cloudBranches.find(item => item.id === cloudBranchId) ?? null,
    branches: cloudBranches, busy: false, error: null,
    choose: async (value: MobileBranch) => { if (!cloud?.branchIds.includes(value.id)) return; await clearQueryCache(); setCloudBranchId(value.id); },
    switchBranch: async () => { setCloudBranchId(null); setSelectedBranch(null); await clearQueryCache(); },
    retry: () => {},
  };
  const connectCloud = async (pairing: CloudPairing) => {
    await signOut(); await wipeCloudData(); await clearQueryCache();
    await saveCloudPairing(pairing); setConnection(null); setCompat(null); setError(null); setConnectionNotice(null); enterCloud(pairing);
  };
  const login = async (
    accessToken: string,
    current: AuthenticatedUser,
    refreshToken: string | null = null
  ) => {
    await clearQueryCache();
    await credentials.login(accessToken, current, refreshToken);
    setUser(current);
    setUserVerified(false);
    setSessionRevision((value) => value + 1);
    setOffline(false);
  };
  const changeConnection = async () => {
    await signOut();
    setConnection(null);
    setCompat(null);
    setError(null);
    setConnectionNotice(null);
  };
  /** `compat` is passed when the caller already found the PC at this address. */
  const connect = (value: ConnectionSettings, compat?: CompatibilityState) => {
    setConnectionNotice(null);
    resolvedRef.current = compat ? { connection: value, compat } : null;
    setConnection(value);
    setCompat(null);
    setError(null);
  };
  const phase = cloud ? (cloudBranch.selected ? 'ready' : 'branch') : restoring
    ? 'restoring'
    : error
      ? 'error'
      : !connection
        ? 'setup'
        : !compat
          ? 'restoring'
          : compat.blocked
            ? 'update'
            : !token || !user
              ? 'login'
              : !userVerified
                ? 'restoring'
                : !branch.selected
                  ? 'branch'
                  : 'ready';
  return {
    phase,
    mode: cloud ? 'cloud' as const : 'lan' as const,
    cloudPairing: cloud,
    connection: cloud ? { host: new URL(cloud.relay).hostname, port: 443, mode: 'cloud' as const, relay: cloud.relay } : connection,
    token: cloud ? 'cloud-local-session' : token,
    user: cloud ? cloudUser : user,
    branch: cloud ? cloudBranch : branch,
    connectionNotice,
    connectCloud,
    updateCloudIdentity: (current: AuthenticatedUser | null, branches: MobileBranch[]) => {
      if (current) setCloudUser(current);
      if (cloudRef.current) setCloudBranches(cloudRef.current.branchIds.map((id, index) => branches.find(branch => branch.id === id) ?? { id, name: `Branch ${index + 1}` }));
    },
    error,
    offline,
    warning: compat?.warning ?? null,
    signOut,
    login,
    changeConnection,
    connect,
    invalidateToken: async (expiredToken: string) => {
      if (credentials.accessToken === expiredToken) {
        // Native bill parsing is synchronous; join its recovery instead of
        // treating a recoverable upload 401 as an explicit sign-out.
        await refreshApiSession().catch(() => undefined);
      }
    },
    retry: () =>
      connection ? setRevision((value) => value + 1) : setRestoreRevision((value) => value + 1),
    can: (permission: Permission) => can(permission, cloud ? cloudUser : user),
  };
}
type Session = ReturnType<typeof useSessionState>;
const SessionContext = createContext<Session | null>(null);
export function SessionProvider({ children }: PropsWithChildren) {
  return <SessionContext.Provider value={useSessionState()}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is required');
  return value;
}

function sameAddresses(a: ConnectionSettings, b: ConnectionSettings): boolean {
  const list = (value: ConnectionSettings) => (value.alternates ?? []).join(',');
  return a.host === b.host && a.port === b.port && list(a) === list(b);
}
