import { Text, type TextProps } from 'react-native';
import { formatMoney } from '@shared/money-format';
import { theme } from '../theme';
export function MoneyText({
  value,
  currency = 'USD',
  direction,
  style,
  ...props
}: TextProps & { value: string; currency?: 'USD' | 'LBP'; direction?: 'in' | 'out' }) {
  return (
    <Text
      {...props}
      style={[
        {
          fontVariant: ['tabular-nums'],
          fontWeight: '700',
          color: direction === 'in' ? theme.colors.success : theme.colors.text,
        },
        style,
      ]}
    >
      {formatMoney(value, currency)}
    </Text>
  );
}
