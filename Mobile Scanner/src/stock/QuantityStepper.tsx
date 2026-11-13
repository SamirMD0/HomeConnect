import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { theme } from '../theme';

/** − [ n ] + with a typed value. Follows outside changes (scans) unless the field is mid-edit. */
export function QuantityStepper({
  value,
  min,
  label,
  onChange,
}: {
  value: number;
  min: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText((previous) => (previous === '' || Number(previous) === value ? previous : String(value)));
  }, [value]);
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <AppButton label="−" variant="secondary" disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} />
      <TextInput
        accessibilityLabel={label}
        value={text}
        keyboardType="number-pad"
        onChangeText={(next) => {
          setText(next);
          if (/^\d+$/.test(next) && Number(next) >= min) onChange(Number(next));
        }}
        onBlur={() => setText(String(value))}
        style={{
          minWidth: 72,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          padding: 10,
          fontSize: 16,
          textAlign: 'center',
          color: theme.colors.text,
          backgroundColor: theme.colors.surface,
        }}
      />
      <AppButton label="+" variant="secondary" onPress={() => onChange(value + 1)} />
    </View>
  );
}
