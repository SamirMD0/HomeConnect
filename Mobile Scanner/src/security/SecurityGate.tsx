import { useEffect, useState, type PropsWithChildren } from 'react';
import { Alert, Text, View, ActivityIndicator } from 'react-native';
import { useSession } from '../session/SessionProvider';
import { AuthLayout } from '../ui/AuthLayout';
import { AppInput } from '../components/AppInput';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { useLockState, useSecurity } from './SecurityProvider';
import { hasBiometrics } from './biometrics';
import { openLocalDb } from '../offline/expo-db';
const pinInput = {
  secureTextEntry: true,
  keyboardType: 'number-pad' as const,
  maxLength: 6,
  autoComplete: 'off' as const,
  importantForAutofill: 'no' as const,
  contextMenuHidden: true,
};
export function ProtectedContent({
  allowed,
  children,
  fallback,
}: {
  allowed: boolean;
  fallback: React.ReactNode;
  children: React.ReactNode;
}) {
  return <>{allowed ? children : fallback}</>;
}
function PinForm({ setup = false }: { setup?: boolean }) {
  const security = useSecurity(),
    lock = useLockState();
  const [pin, setPin] = useState(''),
    [again, setAgain] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const wait = Math.max(0, Math.ceil(((lock.record?.lockedUntil ?? 0) - now) / 1000));
  const run = async (work: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await work();
      if (result === false) setError('The PIN is incorrect.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPin('');
      setAgain('');
      setBusy(false);
    }
  };
  const blocked = Boolean(wait) || !pin || (setup && !again);
  // The keyboard's Done key submits too, so a typed PIN never just sits there.
  const submit = () => {
    if (blocked) return;
    void run(() => (setup ? security.setup(pin, again) : security.controller!.unlockPin(pin)));
  };
  return (
    <AuthLayout title={setup ? 'Create your PIN' : 'Unlock Home Connect'}>
      {setup && <Text>Choose a 4–6 digit PIN for this phone.</Text>}
      <AppInput
        {...pinInput}
        label={setup ? 'New PIN' : 'PIN'}
        value={pin}
        onChangeText={setPin}
        editable={!busy}
        returnKeyType={setup ? 'next' : 'done'}
        onSubmitEditing={setup ? undefined : submit}
      />
      {setup && (
        <AppInput
          {...pinInput}
          label="Enter PIN again"
          value={again}
          onChangeText={setAgain}
          editable={!busy}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
      )}
      {!!error && <StatusBanner tone="warning" message={error} />}
      {!!wait && <Text accessibilityLiveRegion="polite">Try again in {wait} seconds.</Text>}
      <AppButton
        label={setup ? 'Save PIN' : 'Unlock'}
        loading={busy}
        disabled={blocked}
        onPress={submit}
      />
      {!setup && lock.record?.biometric && (
        <AppButton
          label="Unlock with fingerprint or face"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const result = await security.controller!.unlockBiometric();
              if (!result) setError('Use your PIN to unlock.');
              return true;
            })
          }
        />
      )}
      {!setup && (
        <AppButton
          label="Forgot PIN"
          variant="secondary"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              const db = await openLocalDb();
              const [{ count } = { count: 0 }] = await db.query<{ count: number }>(
                "SELECT count(*) AS count FROM outbox WHERE archived=0 AND local_status IN ('queued','sent','awaiting_photo','pending','claimed')"
              );
              Alert.alert(
                'Pair this phone again?',
                `${count} unfinished action${count === 1 ? '' : 's'} on this phone. Unsent actions and photos cannot be sent after this reset. Their summaries will be kept. Check the shop PC before entering them again.`,
                [
                  { text: 'Keep phone', style: 'cancel' },
                  {
                    text: 'Reset and pair again',
                    style: 'destructive',
                    onPress: () =>
                      void security.controller!.forget().catch((error) => setError(error.message)),
                  },
                ]
              );
            })
          }
        />
      )}
    </AuthLayout>
  );
}
function BiometricOffer() {
  const security = useSecurity();
  const [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    void hasBiometrics()
      .then(setAvailable)
      .catch(() => {});
  }, []);
  return (
    <AuthLayout title="PIN saved">
      {available && (
        <>
          <Text>You can also use this phone’s fingerprint or face unlock.</Text>
          <AppButton
            label="Enable fingerprint or face"
            loading={busy}
            onPress={() => {
              setBusy(true);
              void security
                .controller!.preferences({ biometric: true })
                .then((success) => {
                  if (success) security.finishOffer();
                  else setError('Use your PIN, or try fingerprint again.');
                })
                .catch((error) => setError(error.message))
                .finally(() => setBusy(false));
            }}
          />
        </>
      )}
      {!!error && <StatusBanner tone="warning" message={error} />}
      {/* Always a clear way forward: "Use PIN" as an outlined button read as no button at all. */}
      <AppButton
        label={available ? 'Continue with PIN only' : 'Continue'}
        variant={available ? 'secondary' : 'primary'}
        icon="arrow-forward"
        disabled={busy}
        onPress={security.finishOffer}
      />
    </AuthLayout>
  );
}
export function SecurityGate({ children }: PropsWithChildren) {
  const session = useSession(),
    security = useSecurity(),
    state = useLockState();
  useEffect(() => {
    if (
      session.mode === 'cloud' &&
      ['loading', 'setup', 'locked', 'wiping', 'error'].includes(state.phase)
    )
      void import('./capture-cache')
        .then((cache) => cache.clearCloudCaptureCache())
        .catch(() => {});
  }, [session.mode, state.phase]);
  if (session.mode !== 'cloud') return <>{children}</>;
  const fallback = state.hidden ? (
    <View style={{ flex: 1, backgroundColor: '#fff' }} accessibilityLabel="Home Connect locked" />
  ) : !security.ready || state.phase === 'loading' || state.phase === 'wiping' ? (
    <AuthLayout title="Home Connect locked">
      {security.error ? (
        <StatusBanner tone="warning" message={security.error} />
      ) : (
        <ActivityIndicator accessibilityLabel="Preparing secure phone storage" />
      )}
    </AuthLayout>
  ) : state.phase === 'setup' ? (
    <PinForm setup />
  ) : state.phase === 'error' ? (
    <AuthLayout title="Home Connect locked">
      <StatusBanner tone="warning" message={state.error ?? 'Could not read security settings.'} />
      <AppButton
        label="Pair again"
        onPress={() =>
          Alert.alert(
            'Pair again?',
            'Saved action summaries will be kept. Check the PC before entering actions again.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset phone',
                style: 'destructive',
                onPress: () => void security.controller!.forget(),
              },
            ]
          )
        }
      />
    </AuthLayout>
  ) : security.offering ? (
    <BiometricOffer />
  ) : (
    <PinForm />
  );
  // Preserve a short camera/picker round trip only with native preview protection.
  // Once locked, the data tree is always unmounted, including all portal content.
  const allowed =
    security.ready &&
    state.phase === 'unlocked' &&
    !security.offering &&
    (!state.hidden || security.previewProtected);
  return (
    <ProtectedContent allowed={allowed} fallback={fallback}>
      <View style={{ flex: 1, display: state.hidden ? 'none' : 'flex' }}>{children}</View>
    </ProtectedContent>
  );
}
