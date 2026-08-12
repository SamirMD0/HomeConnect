import { StatusBar } from 'expo-status-bar';
import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { scannerApi, ScannerApiError } from './src/api/scanner-api';
import { StatusBanner } from './src/components/StatusBanner';
import { ConnectionSetupScreen } from './src/screens/ConnectionSetupScreen';
import { PairingScreen } from './src/screens/PairingScreen';
import { ScannerScreen } from './src/screens/ScannerScreen';
import { sessionFlowReducer } from './src/state/session-flow';
import {
  clearSessionToken,
  loadConnection,
  loadSessionToken,
  requireSecureStorage,
} from './src/storage/secure-storage';
import { ConnectionSettings } from './src/types/scanner.types';

export default function App() {
  const [phase, dispatch] = useReducer(sessionFlowReducer, 'RESTORING');
  const [connection, setConnection] = useState<ConnectionSettings | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [startupMessage, setStartupMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        await requireSecureStorage();
        const [storedConnection, storedToken] = await Promise.all([loadConnection(), loadSessionToken()]);
        if (!active) return;
        setConnection(storedConnection);
        setToken(storedToken);

        if (!storedConnection) {
          if (storedToken) await clearSessionToken();
          dispatch({ type: 'RESTORED_WITHOUT_CONNECTION' });
          return;
        }
        if (!storedToken) {
          dispatch({ type: 'RESTORED_WITHOUT_TOKEN' });
          return;
        }

        try {
          await scannerApi.session(storedConnection, storedToken);
          if (active) dispatch({ type: 'SESSION_VALID' });
        } catch (error) {
          if (!active) return;
          if (error instanceof ScannerApiError && error.kind === 'UNAUTHORIZED') {
            await clearSessionToken();
            setToken(null);
            dispatch({ type: 'SESSION_INVALID' });
          } else {
            setStartupMessage('Could not confirm the PC connection. You can retry by scanning when the PC is available.');
            dispatch({ type: 'SESSION_VALID' });
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
    await clearSessionToken();
    setToken(null);
    setStartupMessage(null);
    dispatch({ type: 'SESSION_INVALID' });
  };

  const changeConnection = async () => {
    await clearSessionToken();
    setToken(null);
    setStartupMessage(null);
    dispatch({ type: 'CHANGE_CONNECTION' });
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
      return <View style={styles.center}><ActivityIndicator size="large" color="#047857" /><Text style={styles.loading}>Restoring scanner session…</Text></View>;
    }
    if (phase === 'SETUP') {
      return <ConnectionSetupScreen initialSettings={connection} onConnected={(settings) => { setConnection(settings); setToken(null); dispatch({ type: 'CONNECTION_SAVED' }); }} />;
    }
    if (phase === 'PAIRING' && connection) {
      return <PairingScreen connection={connection} onPaired={(nextToken) => { setToken(nextToken); dispatch({ type: 'PAIRED' }); }} onChangeConnection={() => void changeConnection()} />;
    }
    if (phase === 'SCANNING' && connection && token) {
      return <ScannerScreen connection={connection} token={token} startupMessage={startupMessage} onSessionInvalid={invalidateSession} onPairAgain={invalidateSession} onChangeConnection={changeConnection} />;
    }
    return <ConnectionSetupScreen initialSettings={connection} onConnected={(settings) => { setConnection(settings); dispatch({ type: 'CONNECTION_SAVED' }); }} />;
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
