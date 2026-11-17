import { useState } from 'react';
import { Text, View } from 'react-native';
import { AppInput } from '../components/AppInput';
import { AppButton } from '../components/AppButton';
import { StatusBanner } from '../components/StatusBanner';
import { useLockState, useSecurity } from './SecurityProvider';
export function SecuritySettings() {
  const { controller } = useSecurity(),
    state = useLockState();
  const [old, setOld] = useState(''),
    [pin, setPin] = useState(''),
    [again, setAgain] = useState(''),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const work = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await action();
      if (result === false) setMessage('Fingerprint was not enabled. Your PIN still works.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header">Phone lock</Text>
      <Text>Lock after being away</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {([1, 5, 15] as const).map((minutes) => (
          <AppButton
            key={minutes}
            label={`${minutes} min`}
            variant={state.record?.minutes === minutes ? 'primary' : 'secondary'}
            disabled={busy}
            onPress={() => void work(() => controller!.preferences({ minutes }))}
          />
        ))}
      </View>
      <AppButton
        label={
          state.record?.biometric ? 'Turn fingerprint / face off' : 'Turn fingerprint / face on'
        }
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void work(() => controller!.preferences({ biometric: !state.record?.biometric }))
        }
      />
      <AppButton
        label="Change PIN"
        variant="secondary"
        disabled={busy}
        onPress={() => setEditing((value) => !value)}
      />
      {editing && (
        <>
          <AppInput
            label="Current PIN"
            value={old}
            onChangeText={setOld}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="off"
          />
          <AppInput
            label="New PIN"
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="off"
          />
          <AppInput
            label="Enter new PIN again"
            value={again}
            onChangeText={setAgain}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="off"
          />
          <AppButton
            label="Save new PIN"
            loading={busy}
            onPress={() =>
              void work(async () => {
                try {
                  await controller!.changePin(old, pin, again);
                  setEditing(false);
                  setMessage('PIN changed.');
                } finally {
                  setOld('');
                  setPin('');
                  setAgain('');
                }
              })
            }
          />
        </>
      )}
      {!!message && <StatusBanner tone="info" message={message} />}
      <AppButton label="Lock now" variant="secondary" onPress={() => controller?.lock()} />
    </View>
  );
}
