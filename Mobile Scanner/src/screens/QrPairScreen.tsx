import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { theme } from '../theme';
import { ConnectionSettings } from '../types/scanner.types';
import { parsePairingPayload } from '../utils/pairing-payload';

/**
 * Full-screen QR pairing view drawn inside the current screen (not a Modal):
 * an Android Modal ignores the safe area and can swallow the permission
 * dialog. The camera is requested as soon as the view opens. When Android
 * will no longer ask ("Don't allow" chosen before), the only way back is the
 * app's settings page, so that is offered instead of a button that does nothing.
 */
interface QrPairScreenProps {
  visible: boolean;
  onCancel: () => void;
  onPaired: (settings: ConnectionSettings) => void;
}

export function QrPairScreen({ visible, onCancel, onPaired }: QrPairScreenProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [session, setSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [torch, setTorch] = useState(false);
  // A QR on a PC screen is small from arm's length; zooming makes its squares bigger.
  const [zoomed, setZoomed] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumed = useRef(false);
  const asked = useRef(false);

  // Ask once, automatically, the first time the scanner opens.
  useEffect(() => {
    if (!visible || !permission || permission.granted || asked.current) return;
    if (permission.canAskAgain) {
      asked.current = true;
      void requestPermission();
    }
  }, [visible, permission, requestPermission]);

  // Coming back from the settings page: re-read the permission.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission();
    });
    return () => sub.remove();
  }, [visible, getPermission]);

  // Android back button closes the scanner instead of leaving the app.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  });

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  if (!visible) return null;

  function close() {
    consumed.current = false;
    asked.current = false;
    setError(null);
    setTorch(false);
    onCancel();
  }

  const handleScan = ({ data }: { data: string }) => {
    if (consumed.current) return;
    const parsed = parsePairingPayload(data);
    if (!parsed) {
      // Another QR in view (or a half-read one): say so briefly and keep scanning.
      setError('Not the Home Connect code');
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setError(null), 2500);
      return;
    }
    consumed.current = true;
    onPaired(parsed);
  };

  const blocked = permission && !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.overlay}>
      <View style={styles.header}>
        <Ionicons name="qr-code-outline" size={26} color={theme.colors.brand} accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>
          Scan PC code
        </Text>
      </View>

      {error ? <StatusBanner tone="warning" message={error} /> : null}

      {permission?.granted ? (
        <View style={styles.cameraFrame} collapsable={false}>
          <CameraView
            key={`qr-${session}`}
            facing="back"
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            enableTorch={torch}
            zoom={zoomed ? 0.35 : 0}
            onBarcodeScanned={handleScan}
            onMountError={({ message }) => setError(`Camera could not start: ${message}`)}
          />
          <View pointerEvents="none" style={styles.aim} />
          <View style={styles.cameraTools}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'}
              accessibilityState={{ selected: torch }}
              onPress={() => setTorch((value) => !value)}
              style={[styles.tool, torch && styles.toolOn]}
            >
              <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={24} color="#FFFFFF" accessible={false} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={zoomed ? 'Zoom out' : 'Zoom in'}
              accessibilityState={{ selected: zoomed }}
              onPress={() => setZoomed((value) => !value)}
              style={[styles.tool, zoomed && styles.toolOn]}
            >
              <Ionicons name={zoomed ? 'contract-outline' : 'expand-outline'} size={24} color="#FFFFFF" accessible={false} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.permission}>
          <Ionicons name="camera-outline" size={56} color={theme.colors.muted} accessible={false} />
          <Text style={styles.permissionText}>{blocked ? 'Camera is blocked' : 'Camera permission needed'}</Text>
          {blocked ? (
            <AppButton label="Open settings" icon="settings-outline" onPress={() => void Linking.openSettings()} />
          ) : (
            <AppButton
              label="Allow camera"
              icon="camera-outline"
              onPress={() => {
                asked.current = true;
                void requestPermission();
              }}
            />
          )}
        </View>
      )}

      <View style={styles.actions}>
        {permission?.granted ? (
          <AppButton
            label="Restart camera"
            icon="refresh-outline"
            variant="secondary"
            onPress={() => {
              setError(null);
              consumed.current = false;
              setSession((value) => value + 1);
            }}
          />
        ) : null}
        <AppButton label="Type address" icon="create-outline" variant="secondary" onPress={close} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: theme.spacing.sm },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: '800' },
  cameraFrame: {
    flex: 1,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aim: {
    width: 220,
    height: 220,
    borderRadius: theme.radius.lg,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  cameraTools: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  tool: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  toolOn: { backgroundColor: theme.colors.brand },
  permission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    padding: theme.spacing.xl,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  permissionText: { color: theme.colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  actions: { gap: theme.spacing.sm },
});
