import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/**
 * Pill filter row (Today · Yesterday · Week). The selected pill is filled
 * blue; the rest sit on a light-blue track. 2–4 options; more belong in a
 * picker.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Read by screen readers before the options. */
  label: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.pill, selected && styles.selected]}
          >
            <Text style={[styles.text, selected && styles.selectedText]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: theme.radius.pill, backgroundColor: theme.colors.field },
  pill: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: theme.radius.pill },
  selected: { backgroundColor: theme.colors.brand },
  text: { ...theme.text.label, color: theme.colors.brandStrong },
  selectedText: { color: theme.colors.onBrand, fontWeight: '700' },
});
