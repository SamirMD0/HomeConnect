import { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { cn } from '../../lib/utils';
import { Text } from './text';

export type InputProps = TextInputProps & {
  className?: string;
  label?: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  icon?: LucideIcon;
};

/**
 * shadcn Input with an optional label above, leading icon, password eye and
 * an error under it. White field, slate border, blue ring on focus (PC style).
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, label, required, error, hint, icon: Icon, secureTextEntry, editable = true, onFocus, onBlur, ...props },
  ref
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="font-sans-semibold text-sm text-slate-700">
          {label}
          {required ? <Text className="text-danger"> *</Text> : null}
        </Text>
      ) : null}
      <View
        className={cn(
          'h-12 flex-row items-center gap-2.5 rounded-lg border bg-card px-3',
          focused ? 'border-ring' : 'border-input',
          error && 'border-danger',
          !editable && 'bg-slate-50 opacity-70',
          className
        )}
      >
        {Icon ? <Icon size={18} color="#66777F" /> : null}
        <TextInput
          ref={ref}
          editable={editable}
          secureTextEntry={Boolean(secureTextEntry) && !revealed}
          accessibilityLabel={label ? `${label}${required ? ', required' : ''}` : props.placeholder}
          placeholderTextColor="#8FA3AD"
          selectionColor="#1A6FC9"
          cursorColor="#1A6FC9"
          className="h-full flex-1 font-sans text-base text-foreground"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setRevealed((value) => !value)}
          >
            {revealed ? <EyeOff size={20} color="#66777F" /> : <Eye size={20} color="#66777F" />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-danger">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-sm text-muted-foreground">{hint}</Text>
      ) : null}
    </View>
  );
});
