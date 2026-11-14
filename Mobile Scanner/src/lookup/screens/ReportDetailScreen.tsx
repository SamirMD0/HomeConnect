import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Text, View } from 'react-native';
import { FileDown } from 'lucide-react-native';
import { reportColumns, summaryFor } from '@shared/report-columns';
import { Button } from '../../components/ui/button';
import { Card as UiCard, CardContent } from '../../components/ui/card';
import { Select } from '../../components/ui/select';
import { Text as UiText } from '../../components/ui/text';
import { ToggleGroup } from '../../components/ui/toggle-group';
import { HeroCard } from '../../ui/Stats';
import { ReportTable } from '../../reports/ReportTable';
import { exportReportPdf } from '../../reports/report-pdf';
import { REPORT_CATALOG } from '@shared/report-catalog';
import { formatBusinessDate, formatDateTime } from '@shared/money-format';
import type { Currency } from '@shared/lookup-contracts';
import { getReport, type ReportFilters } from '../../api/reports-api';
import { useLookup } from '../useLookup';
import { Card, Field, PagedRows, ReadScreen, ReadState, readStyles } from '../ReadUI';
import { RangeFilter } from '../FilterControls';
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
type Period = ReportFilters['period'];
const PERIODS: { value: Period; label: string }[] = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'today', label: 'Today' },
  { value: 'custom', label: 'Dates' },
];

/** The last 12 months as dropdown options, newest first. */
function recentMonths(today = new Date()) {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  });
}

/** Slice name for the shared column definitions. */
function sliceOf(definition: (typeof REPORT_CATALOG)[number]) {
  if (definition.kind === 'legacy-debts') return 'monthly-debts';
  if (definition.kind === 'legacy-activity') return 'monthly-activity';
  return 'slice' in definition ? String(definition.slice) : '';
}

/**
 * One report: period, the PC's headline figures, then the PC's columns in a
 * table that scrolls sideways. Export makes a PDF of exactly what is shown.
 * The two older monthly reports load every page, so the table and the PDF
 * are complete.
 */
export function ReportDetailScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    { client, key, session } = useLookup();
  const definition = REPORT_CATALOG.find((report) => report.id === id);
  const months = recentMonths();
  const [range, setRange] = useState(monthRange),
    [period, setPeriod] = useState<Period>('thisMonth'),
    [month, setMonth] = useState(months[0]!.value),
    [exporting, setExporting] = useState(false);
  const filters = { period, ...range, month };
  const legacy = Boolean(definition?.kind.startsWith('legacy'));
  const report = useQuery({
    queryKey: key('report', { id, ...filters }),
    queryFn: async () => {
      const first = await getReport(client, definition!, filters, 1);
      if (!legacy || !first.pagination || first.pagination.totalPages <= 1) return first;
      // Older monthly reports are paged on the PC; gather every page (max 40).
      const items = [...((first.items ?? first.rows ?? []) as Record<string, unknown>[])];
      for (let page = 2; page <= Math.min(first.pagination.totalPages, 40); page++) {
        const next = await getReport(client, definition!, filters, page);
        items.push(...((next.items ?? next.rows ?? []) as Record<string, unknown>[]));
      }
      return { ...first, items, rows: undefined };
    },
    enabled: Boolean(definition) && session.can('reports.read'),
  });
  if (!session.can('reports.read')) return <Redirect href="/(tabs)/more" />;
  if (!definition) return <Redirect href="/(tabs)/more/reports" />;

  const slice = sliceOf(definition);
  const columns = reportColumns(slice);
  const data = report.data;
  const rows = (data?.rows ?? data?.items) as Record<string, unknown>[] | undefined;
  const figures = summaryFor(slice, data?.summary as Record<string, unknown> | undefined);
  const hero = figures.find((figure) => figure.money);
  const rest = figures.filter((figure) => figure !== hero);
  const periodLabel = legacy
    ? (months.find((item) => item.value === month)?.label ?? month)
    : period === 'custom'
      ? `${formatBusinessDate(range.from)} – ${formatBusinessDate(range.to)}`
      : (PERIODS.find((item) => item.value === period)?.label ?? '');
  const tabular = columns.length > 0 && Array.isArray(rows);

  const exportPdf = async () => {
    if (!rows) return;
    setExporting(true);
    try {
      await exportReportPdf({
        title: definition.title,
        period: periodLabel,
        branch: session.branch.selected?.name ?? '',
        summary: figures,
        columns,
        rows,
        generatedAt: new Date(),
      });
    } catch (error) {
      Alert.alert('Could not export', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: definition.title }} />
      <ReadScreen refreshing={report.isRefetching} onRefresh={() => void report.refetch()}>
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <UiText accessibilityRole="header" className="font-sans-extrabold text-2xl">
              {definition.title}
            </UiText>
            <UiText className="text-sm text-slate-600">{periodLabel}</UiText>
          </View>
          {tabular ? (
            <Button variant="outline" size="sm" loading={exporting} disabled={!rows?.length} onPress={() => void exportPdf()}>
              <FileDown size={18} color="#1B2124" />
              <UiText>PDF</UiText>
            </Button>
          ) : null}
        </View>

        {legacy ? (
          <Select label="Month" value={month} options={months} onChange={setMonth} />
        ) : (
          <>
            <ToggleGroup label="Period" value={period} options={PERIODS} onChange={setPeriod} />
            {period === 'custom' && <RangeFilter value={range} onChange={setRange} />}
          </>
        )}

        <ReadState query={report} />
        {data && hero ? (
          <HeroCard label={hero.label} value={hero.text} caption={rows ? `${rows.length} rows` : undefined} />
        ) : null}
        {data && rest.length ? (
          <View className="flex-row flex-wrap gap-2">
            {rest.map((figure) => (
              <UiCard key={figure.label} className="min-w-[46%] flex-1">
                <CardContent className="gap-0.5 p-3">
                  <UiText className="text-xs text-muted-foreground" numberOfLines={2}>
                    {figure.label}
                  </UiText>
                  <UiText
                    style={{ fontVariant: ['tabular-nums'] }}
                    className="font-sans-bold text-lg"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {figure.text}
                  </UiText>
                </CardContent>
              </UiCard>
            ))}
          </View>
        ) : null}

        {data && tabular ? (
          rows!.length ? (
            <ReportTable columns={columns} rows={rows!} />
          ) : (
            <UiCard>
              <CardContent className="items-center p-6">
                <UiText className="text-muted-foreground">Nothing in this period.</UiText>
              </CardContent>
            </UiCard>
          )
        ) : null}

        {/* Review and analysis reports have no table: their figures, formatted. */}
        {data && !tabular ? (
          data.summary ? (
            <Card title="Summary">
              <RecordFields data={data.summary as Record<string, unknown>} reportId={id} />
            </Card>
          ) : (
            <RecordFields data={data} reportId={id} />
          )
        ) : null}
      </ReadScreen>
    </>
  );
}
