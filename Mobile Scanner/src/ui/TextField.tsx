import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { theme } from '../theme';

export interface TextFieldProps extends TextInputProps {
  label: string;
  /** Adds a red asterisk; screen readers hear "required". */
  required?: boolean;
  hint?: string;
  /** Replaces the hint and turns the border red. */
  error?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Visually hide the label (search boxes); screen readers still read it. */
  hideLabel?: boolean;
}

/**
 * Filled light-blue field with the label above (Noble reference). Focus turns
 * the border brand blue; `secureTextEntry` adds a show/hide eye.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    required,
    hint,
    error,
    icon,
    hideLabel,
    secureTextEntry,
    style,
    onFocus,
    onBlur,
    editable = true,
    ...props
  },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const secure = Boolean(secureTextEntry);
  return (
    <View style={styles.group}>
      {hideLabel ? null : (
        <Text style={styles.label}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      )}
      <View
        style={[
          styles.box,
          focused && styles.focused,
          error ? styles.errored : null,
          !editable && styles.disabled,
        ]}
      >
        {icon ? (
          <Ionicons name={icon} size={20} color={theme.colors.muted} accessible={false} />
        ) : null}
        <TextInput
          ref={ref}
          {...props}
          editable={editable}
          secureTextEntry={secure && !revealed}
          accessibilityLabel={`${label}${required ? ', required' : ''}`}
          accessibilityHint={error ?? hint}
          placeholderTextColor={theme.colors.placeholder}
          selectionColor={theme.colors.brand}
          cursorColor={theme.colors.brand}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, style]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`
            }
            onPress={() => setRevealed((value) => !value)}
            hitSlop={8}
            style={styles.eye}
          >
            <Ionicons
              name={revealed ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={theme.colors.muted}
              accessible={false}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { ...theme.text.label, color: theme.colors.text },
  required: { color: theme.colors.danger },
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.fieldBorder,
    backgroundColor: theme.colors.field,
  },
  focused: { borderColor: theme.colors.brand, backgroundColor: theme.colors.surface },
  errored: { borderColor: theme.colors.danger },
  disabled: { backgroundColor: theme.colors.neutralSoft, borderColor: theme.colors.border },
  input: {
    flex: 1,
    minHeight: 48,
    ...theme.text.body,
    color: theme.colors.text,
    paddingVertical: 10,
  },
  eye: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  hint: { ...theme.text.caption, color: theme.colors.muted },
  error: { ...theme.text.caption, color: theme.colors.danger },
});
