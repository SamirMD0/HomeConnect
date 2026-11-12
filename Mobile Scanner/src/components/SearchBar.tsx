import type { TextInputProps } from 'react-native';
import { AppInput } from './AppInput';
export function SearchBar(props: TextInputProps & { label?: string }) {
  return (
    <AppInput
      label="Search"
      placeholder="Search"
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
    />
  );
}
