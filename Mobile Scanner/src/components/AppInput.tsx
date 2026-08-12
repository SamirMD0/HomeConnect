import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface AppInputProps extends TextInputProps {
  label: string;
  hint?: string;
}

export function AppInput({ label, hint, style, ...props }: AppInputProps) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        placeholderTextColor="#94a3b8"
        style={[styles.input, style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { color: '#334155', fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
});
