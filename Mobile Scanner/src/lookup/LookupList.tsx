import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { theme } from '../theme';
import type { ReadPage } from '@shared/lookup-contracts';

export interface ListQuery<T> {
  data?: { pages: ReadPage<T>[] };
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  isFetchNextPageError?: boolean;
  refetch(): Promise<unknown>;
  fetchNextPage(): Promise<unknown>;
}
export function LookupList<T>({
  title,
  subtitle,
  header,
  query,
  renderItem,
  itemKey,
  empty = 'Try another search or filter.',
  testID,
}: {
  title: string;
  subtitle?: string;
  header?: ReactNode;
  query: ListQuery<T>;
  renderItem: (item: T) => ReactNode;
  itemKey: (item: T) => string;
  empty?: string;
  testID?: string;
}) {
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <FlatList
      testID={testID}
      data={items}
      keyExtractor={itemKey}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      renderItem={({ item }) => <View>{renderItem(item)}</View>}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          {header}
          {query.isError && items.length > 0 && (
            <ErrorState
              message={query.error?.message ?? 'Could not load more.'}
              onRetry={() =>
                void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())
              }
            />
          )}
        </View>
      }
      ListEmptyComponent={
        query.isPending ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.brand} />
            <Text style={styles.subtitle}>Loading…</Text>
          </View>
        ) : query.isError ? (
          <ErrorState
            message={query.error?.message ?? 'Could not load this list.'}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EmptyState title="Nothing to show" message={empty} />
        )
      }
      refreshing={query.isFetching && !query.isPending && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
      ListFooterComponent={
        query.hasNextPage ? (
          <View style={styles.footer}>
            <AppButton
              label="Load more"
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          </View>
        ) : null
      }
    />
  );
}
const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: theme.spacing.lg, paddingBottom: 112, gap: 8 },
  header: { gap: 12, paddingBottom: 12 },
  title: { ...theme.text.headline, color: theme.colors.text },
  subtitle: { ...theme.text.label, fontWeight: '400', color: theme.colors.muted },
  loading: { padding: 32, alignItems: 'center', gap: 12 },
  footer: { paddingVertical: 16 },
});
