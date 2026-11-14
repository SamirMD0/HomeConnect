import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface Column<T> {
  key: string;
  label: string;
  /** Width in dp. Money columns align right and use tabular figures. */
  width: number;
  align?: 'left' | 'right';
  render: (row: T) => string;
}

/**
 * Zebra table for statements and reports. Scrolls sideways when the columns
 * are wider than the phone; the first column stays readable as the row name.
 * `alert` rows (overdue, errors) get the soft red ground.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  alert,
  onRowPress,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  alert?: (row: T) => boolean;
  onRowPress?: (row: T) => void;
  /** Table name for screen readers. */
  caption: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={caption}>
      <View>
        <View style={styles.head} accessibilityRole="header">
          {columns.map((column) => (
            <Text
              key={column.key}
              style={[styles.headText, { width: column.width }, column.align === 'right' && styles.right]}
              numberOfLines={2}
            >
              {column.label}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => {
          const flagged = alert?.(row) ?? false;
          return (
            <Pressable
              key={rowKey(row)}
              accessibilityRole={onRowPress ? 'button' : undefined}
              accessibilityLabel={columns.map((column) => `${column.label} ${column.render(row)}`).join(', ')}
              disabled={!onRowPress}
              onPress={() => onRowPress?.(row)}
              style={({ pressed }) => [
                styles.row,
                index % 2 === 1 && styles.zebra,
                flagged && styles.flagged,
                pressed && styles.pressed,
              ]}
            >
              {columns.map((column) => (
                <Text
                  key={column.key}
                  style={[
                    styles.cell,
                    { width: column.width },
                    column.align === 'right' && styles.right,
                    flagged && styles.flaggedText,
                  ]}
                  numberOfLines={2}
                >
                  {column.render(row)}
                </Text>
              ))}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: theme.colors.border },
  headText: { ...theme.text.caption, fontWeight: '700', color: theme.colors.muted, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  zebra: { backgroundColor: theme.colors.surfaceMuted },
  flagged: { backgroundColor: theme.colors.dangerSoft },
  flaggedText: { color: theme.colors.danger },
  pressed: { backgroundColor: theme.colors.brandSoft },
  cell: { ...theme.text.label, fontWeight: '400', color: theme.colors.text, paddingHorizontal: 8, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
});
