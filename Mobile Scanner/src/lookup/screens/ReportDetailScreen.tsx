import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { REPORT_CATALOG } from '@shared/report-catalog';
import { formatBusinessDate, formatDateTime } from '@shared/money-format';
import type { Currency } from '@shared/lookup-contracts';
import { getReport, type ReportFilters } from '../../api/reports-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { AppButton } from '../../components/AppButton';
import { AppInput } from '../../components/AppInput';
import { SelectFilter, RangeFilter } from '../FilterControls';
import { humanLabel, monthRange } from '../filters';
import {
  reportFieldCurrency,
  reportMoneyField,
  reportPercentageField,
  visibleReportField,
} from '../report-display';

function RecordFields({
  data,
  currency = 'USD',
  context = '',
  reportId = '',
}: {
  data: Record<string, unknown>;
  currency?: Currency;
  context?: string;
  reportId?: string;
}) {
  return (
    <View style={{ gap: 10 }}>
      {Object.entries(data)
        .filter(([key]) => visibleReportField(key))
        .map(([key, value]) => {
          if (Array.isArray(value))
            return (
              <PagedRows
                key={key}
                title={humanLabel(key)}
                rows={value}
                rowKey={(row) => JSON.stringify(row)}
                render={(row) =>
                  typeof row === 'object' && row ? (
                    <Card>
                      <RecordFields
                        data={row as Record<string, unknown>}
                        currency={currency}
                        reportId={reportId}
                      />
                    </Card>
                  ) : (
                    <Text style={readStyles.subtitle}>{String(row)}</Text>
                  )
                }
              />
            );
          if (value && typeof value === 'object')
            return (
              <Card key={key} title={humanLabel(key)}>
                <RecordFields
                  data={value as Record<string, unknown>}
                  currency={currency}
                  context={key}
                  reportId={reportId}
                />
              </Card>
            );
          const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
          const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value);
          return (
            <Field
              key={key}
              label={humanLabel(key)}
              value={
                date
                  ? formatBusinessDate(value)
                  : timestamp
                    ? formatDateTime(value)
                    : reportPercentageField(key) && value !== null && value !== undefined
                      ? `${value}%`
                      : typeof value === 'boolean'
                        ? value
                          ? 'Yes'
                          : 'No'
                        : value
              }
              money={
                reportMoneyField(key, value) ||
                (['current', 'previous', 'change'].includes(key) &&
                  reportMoneyField(context, value))
              }
              currency={reportFieldCurrency(reportId, key, currency)}
            />
          );
        })}
    </View>
  );
}
export function ReportDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, session } = useLookup();
  const definition = REPORT_CATALOG.find((report) => report.id === id);
  const [range, setRange] = useState(monthRange),
    [period, setPeriod] = useState<ReportFilters['period']>('thisMonth'),
    [month, setMonth] = useState(monthRange().to.slice(0, 7)),
    [page, setPage] = useState(1);
  const filters = { period, ...range, month };
  const report = useQuery({
    queryKey: key('report', { id, ...filters, page }),
    queryFn: () => getReport(client, definition!, filters, page),
    enabled:
      Boolean(definition) && session.can('reports.read') && /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
  });
  if (!session.can('reports.read')) return <Redirect href="/(tabs)/more" />;
  if (!definition) return <Redirect href="/(tabs)/more/reports" />;
  const legacy = definition.kind.startsWith('legacy');
  const data = report.data,
    rows = data?.rows ?? data?.items;
  return (
    <>
      <Stack.Screen options={{ title: definition.title }} />
      <ReadScreen refreshing={report.isRefetching} onRefresh={() => void report.refetch()}>
        <Text accessibilityRole="header" style={readStyles.title}>
          {definition.title}
        </Text>
        <Text style={readStyles.subtitle}>{definition.description}</Text>
        {legacy ? (
          <AppInput
            label="Month (YYYY-MM)"
            value={month}
            onChangeText={(value) => {
              setMonth(value);
              setPage(1);
            }}
            maxLength={7}
          />
        ) : (
          <>
            <SelectFilter
              label="Period"
              value={period}
              onChange={(value) => {
                setPeriod(value as typeof period);
                setPage(1);
              }}
              options={[
                { value: 'thisMonth', label: 'This month' },
                { value: 'lastMonth', label: 'Last month' },
                { value: 'thisWeek', label: 'This week' },
                { value: 'today', label: 'Today' },
                { value: 'custom', label: 'Custom dates' },
              ]}
            />
            {period === 'custom' && (
              <RangeFilter
                value={range}
                onChange={(value) => {
                  setRange(value);
                  setPage(1);
                }}
              />
            )}
          </>
        )}
        {'operational' in definition && definition.operational && (
          <Text style={readStyles.subtitle}>
            Current operational snapshot. The selected period does not change this backlog.
          </Text>
        )}
        <ReadState query={report} />
        {data && (
          <>
            {data.summary ? (
              <Card title="Summary">
                <RecordFields data={data.summary} />
              </Card>
            ) : (
              !rows && <RecordFields data={data} />
            )}
            {rows && (
              <PagedRows
                key={`${id}-${page}-${period}-${range.from}-${range.to}`}
                title="Records"
                rows={rows}
                rowKey={(row) => JSON.stringify(row)}
                render={(row) => (
                  <Card>
                    <RecordFields
                      data={row}
                      currency={row.currency === 'LBP' ? 'LBP' : 'USD'}
                      reportId={id}
                    />
                  </Card>
                )}
              />
            )}
            {legacy && data.pagination && (
              <View style={{ gap: 8 }}>
                <Text style={readStyles.subtitle}>
                  Page {data.pagination.page} of {data.pagination.totalPages}
                </Text>
                <AppButton
                  label="Previous page"
                  variant="secondary"
                  disabled={page <= 1}
                  onPress={() => setPage(page - 1)}
                />
                <AppButton
                  label="Next page"
                  variant="secondary"
                  disabled={page >= data.pagination.totalPages}
                  onPress={() => setPage(page + 1)}
                />
              </View>
            )}
          </>
        )}
      </ReadScreen>
    </>
  );
}
