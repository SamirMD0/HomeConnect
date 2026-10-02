import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { fetchMe } from './src/api/auth-api';
import { HcApiError } from './src/api/hc-client';
import { StatusBanner } from './src/components/StatusBanner';
import { ConnectionSetupScreen } from './src/screens/ConnectionSetupScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { sessionFlowReducer } from './src/state/session-flow';
import {
  clearAllAuth,
  loadAuthToken,
  loadAuthUser,
  loadConnection,
  requireSecureStorage,
  saveAuthToken,
  saveAuthUser,
  StoredAuthUser,
} from './src/storage/secure-storage';
import { ConnectionSettings } from './src/types/scanner.types';

export default function App() {
  const [phase, dispatch] = useReducer(sessionFlowReducer, 'RESTORING');
  const [connection, setConnection] = useState<ConnectionSettings | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<StoredAuthUser | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [startupMessage, setStartupMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        await requireSecureStorage();
        const [storedConnection, storedToken, storedUser] = await Promise.all([
          loadConnection(),
          loadAuthToken(),
          loadAuthUser(),
        ]);
        if (!active) return;
        setConnection(storedConnection);
        setToken(storedToken);
        setAuthUser(storedUser);

        if (!storedConnection) {
          if (storedToken || storedUser) await clearAllAuth();
          dispatch({ type: 'RESTORED_WITHOUT_CONNECTION' });
          return;
        }
        if (!storedToken) {
          dispatch({ type: 'RESTORED_WITHOUT_TOKEN' });
          return;
        }

        try {
          const me = await fetchMe(storedConnection, storedToken);
          if (!active) return;
          const freshUser = { id: me.id, email: me.email, fullName: me.fullName, role: me.role };
          setAuthUser(freshUser);
          await saveAuthUser(freshUser);
          dispatch({ type: 'SESSION_VALID' });
        } catch (error) {
          if (!active) return;
          if (error instanceof HcApiError && error.kind === 'UNAUTHORIZED') {
            await clearAllAuth();
            setToken(null);
            setAuthUser(null);
            dispatch({ type: 'SESSION_INVALID' });
          } else {
            setStartupMessage('Could not confirm the server connection. Scans will retry when the server is reachable.');
            if (storedUser) dispatch({ type: 'SESSION_VALID' });
            else dispatch({ type: 'RESTORED_WITHOUT_TOKEN' });
          }
        }
      } catch (error) {
        if (active) setFatalError(error instanceof Error ? error.message : 'Secure storage is unavailable.');
      }
    };
    void restore();
    return () => { active = false; };
  }, []);

  const invalidateSession = async () => {
    await clearAllAuth();
    setToken(null);
    setAuthUser(null);
    setStartupMessage(null);
    dispatch({ type: 'SESSION_INVALID' });
  };

  const changeConnection = async () => {
    await clearAllAuth();
    setToken(null);
    setAuthUser(null);
    setStartupMessage(null);
    dispatch({ type: 'CHANGE_CONNECTION' });
  };

  const handleLoggedIn = async (accessToken: string, user: StoredAuthUser) => {
    await Promise.all([saveAuthToken(accessToken), saveAuthUser(user)]);
    setToken(accessToken);
    setAuthUser(user);
    setStartupMessage(null);
    dispatch({ type: 'LOGGED_IN' });
  };

  const body = (() => {
    if (fatalError) {
      return (
        <View style={styles.center}>
          <Text style={styles.fatalTitle}>Secure storage required / يلزم تخزين آمن</Text>
          <StatusBanner tone="danger" message={fatalError} />
          <Text style={styles.fatalCopy}>No session token was stored. This app will not use an insecure fallback.</Text>
        </View>
      );
    }
    if (phase === 'RESTORING') {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#047857" />
          <Text style={styles.loading}>Restoring session…</Text>
        </View>
      );
    }
    if (phase === 'SETUP') {
      return (
        <ConnectionSetupScreen
          initialSettings={connection}
          onConnected={(settings) => {
            setConnection(settings);
            setToken(null);
            setAuthUser(null);
            dispatch({ type: 'CONNECTION_SAVED' });
          }}
        />
      );
    }
    if (phase === 'LOGIN' && connection) {
      return (
        <LoginScreen
          connection={connection}
          startupMessage={startupMessage}
          onLoggedIn={(accessToken, user) => handleLoggedIn(accessToken, user)}
          onChangeConnection={changeConnection}
        />
      );
    }
    if (phase === 'SCANNING' && connection && token && authUser) {
      return (
        <ScannerScreen
          connection={connection}
          token={token}
          userDisplayName={authUser.fullName || authUser.email}
          startupMessage={startupMessage}
          onSessionInvalid={invalidateSession}
          onChangeConnection={changeConnection}
          onLogout={invalidateSession}
        />
      );
    }
    return (
      <ConnectionSetupScreen
        initialSettings={connection}
        onConnected={(settings) => { setConnection(settings); dispatch({ type: 'CONNECTION_SAVED' }); }}
      />
    );
  })();

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'right', 'bottom', 'left']}>
        {body}
        <StatusBar style="dark" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  loading: { color: '#475569', fontSize: 15 },
  fatalTitle: { color: '#0f172a', fontSize: 23, fontWeight: '900', textAlign: 'center' },
  fatalCopy: { color: '#64748b', fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
