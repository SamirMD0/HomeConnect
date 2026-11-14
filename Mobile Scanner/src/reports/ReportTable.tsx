import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  cellFor,
  columnWidth,
  reportRowKey,
  type CellTone,
  type ReportColumnSpec,
} from '@shared/report-columns';
import { Button } from '../components/ui/button';
import { Text } from '../components/ui/text';
import { cn } from '../lib/utils';

const toneClass: Record<CellTone, string> = {
  good: 'text-emerald-700',
  bad: 'text-red-700',
  warn: 'text-amber-800',
  info: 'text-brand-700',
};
const PAGE = 50;

/**
 * shadcn-style data table: the PC's columns, a sticky-looking header row,
 * zebra rows, and sideways scrolling when the columns are wider than the
 * phone. Long reports show 50 rows at a time.
 */
export function ReportTable({ columns, rows }: { columns: ReportColumnSpec[]; rows: Record<string, unknown>[] }) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  const totalWidth = columns.reduce((sum, column) => sum + columnWidth(column), 0);
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <ScrollView horizontal showsHorizontalScrollIndicator persistentScrollbar>
        <View style={{ width: Math.max(totalWidth, 320) }}>
          <View className="flex-row border-b border-border bg-slate-50" accessibilityRole="header">
            {columns.map((column) => (
              <View key={column.label} style={{ width: columnWidth(column) }} className="px-3 py-2.5">
                <Text
                  numberOfLines={2}
                  className={cn('font-sans-semibold text-xs text-slate-600', column.numeric && 'text-right')}
                >
                  {column.label}
                </Text>
              </View>
            ))}
          </View>
          {visible.map((row, index) => (
            <View
              key={reportRowKey(row, index)}
              accessible
              accessibilityLabel={columns.map((column) => `${column.label} ${cellFor(column, row).text}`).join(', ')}
              className={cn('min-h-11 flex-row items-center border-b border-slate-100', index % 2 === 1 && 'bg-slate-50/70')}
            >
              {columns.map((column) => {
                const cell = cellFor(column, row);
                return (
                  <View key={column.label} style={{ width: columnWidth(column) }} className="px-3 py-2">
                    <Text
                      numberOfLines={3}
                      style={column.numeric ? { fontVariant: ['tabular-nums'] } : undefined}
                      className={cn(
                        'text-sm text-slate-800',
                        column.numeric && 'text-right font-sans-semibold',
                        cell.tone && toneClass[cell.tone],
                        cell.tone && !column.numeric && 'font-sans-semibold'
                      )}
                    >
                      {cell.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {rows.length > shown ? (
        <View className="flex-row items-center justify-between gap-2 p-3">
          <Text className="text-sm text-muted-foreground">
            {shown} of {rows.length}
          </Text>
          <Button variant="secondary" size="sm" onPress={() => setShown((value) => value + PAGE)}>
            <Text>Show more</Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}
