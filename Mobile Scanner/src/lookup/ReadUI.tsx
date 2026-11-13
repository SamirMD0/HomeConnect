import { useState, type PropsWithChildren, type ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme } from '../theme';
import { MoneyText } from '../components/MoneyText';
import { AppButton } from '../components/AppButton';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import type { Currency } from '@shared/lookup-contracts';
import { LOOKUP_PAGE_SIZE } from './pagination';
export const readStyles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', color: theme.colors.text },
  subtitle: { color: theme.colors.muted, fontSize: 14, lineHeight: 21 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  label: { color: theme.colors.muted, fontSize: 14, flex: 1 },
  value: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  section: { color: theme.colors.text, fontSize: 20, fontWeight: '700' },
});
export function ReadScreen({
  children,
  refreshing = false,
  onRefresh,
}: PropsWithChildren<{ refreshing?: boolean; onRefresh: () => void }>) {
  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingBottom: 112,
        gap: 16,
        flexGrow: 1,
        backgroundColor: theme.colors.background,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.colors.brand}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Card({ title, children }: PropsWithChildren<{ title?: string }>) {
  return (
    <View style={readStyles.card}>
      {title && (
        <Text accessibilityRole="header" style={readStyles.section}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}
export function Field({
  label,
  value,
  money = false,
  currency = 'USD',
  incoming = false,
}: {
  label: string;
  value: unknown;
  money?: boolean;
  currency?: Currency;
  incoming?: boolean;
}) {
  return (
    <View style={readStyles.row}>
      <Text style={readStyles.label}>{label}</Text>
      {money ? (
        <MoneyText
          value={typeof value === 'string' ? value : ''}
          currency={currency}
          direction={incoming ? 'in' : 'out'}
          style={{ flexShrink: 1, textAlign: 'right' }}
        />
      ) : (
        <Text selectable style={readStyles.value}>
          {value === null || value === undefined || value === '' ? '—' : String(value)}
        </Text>
      )}
    </View>
  );
}
export function ReadState({
  query,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; refetch(): Promise<unknown> };
}) {
  return query.isPending ? (
    <View style={{ padding: 32 }}>
      <ActivityIndicator color={theme.colors.brand} />
    </View>
  ) : query.isError ? (
    <ErrorState
      message={query.error?.message ?? 'Could not load this page.'}
      onRetry={() => void query.refetch()}
    />
  ) : null;
}
export function PagedRows<T>({
  title,
  rows,
  render,
  rowKey,
}: {
  title: string;
  rows: T[];
  render: (row: T) => ReactNode;
  rowKey: (row: T) => string;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / LOOKUP_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  return (
    <View style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={readStyles.section}>
        {title}
      </Text>
      {rows.length ? (
        rows
          .slice((current - 1) * LOOKUP_PAGE_SIZE, current * LOOKUP_PAGE_SIZE)
          .map((row) => <View key={rowKey(row)}>{render(row)}</View>)
      ) : (
        <EmptyState title="No records" message="Nothing in this period." />
      )}
      {totalPages > 1 && (
        <View style={{ gap: 8 }}>
          <Text style={readStyles.subtitle}>
            Page {current} of {totalPages}
          </Text>
          <AppButton
            label="Previous page"
            variant="secondary"
            disabled={current === 1}
            onPress={() => setPage(current - 1)}
          />
          <AppButton
            label="Next page"
            variant="secondary"
            disabled={current === totalPages}
            onPress={() => setPage(current + 1)}
          />
        </View>
      )}
    </View>
  );
}
