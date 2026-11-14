import { forwardRef } from 'react';
import type { TextInput } from 'react-native';
import { TextField, type TextFieldProps } from '../ui/TextField';

/** Kept for existing screens; renders the design-system TextField. */
export const AppInput = forwardRef<TextInput, TextFieldProps>(function AppInput(props, ref) {
  return <TextField ref={ref} {...props} />;
});
