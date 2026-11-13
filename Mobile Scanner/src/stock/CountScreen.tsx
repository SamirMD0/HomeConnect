import { useState } from 'react';
import { Stack } from 'expo-router';
import { Text } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { HcApiError } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { EmptyState } from '../components/EmptyState';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { Card, readStyles } from '../lookup/ReadUI';
import { queryKeys } from '../query/keys';
import { FormPage } from '../sales/FormUI';
import { ProductPicker } from '../sales/ProductPicker';
import { theme } from '../theme';
import { ScanPanel } from './ScanPanel';
import { QuantityStepper } from './QuantityStepper';
import { currentStock, postMovement, productForCode } from './stock-api';
import { useStockDraft, type CountStore } from './stock-drafts';
import {
  addCountScan,
  countDifference,
  countPayload,
  countSummary,
  englishMessage,
  isStaleStockMessage,
  linesToSubmit,
  markLine,
  rebaseCountLine,
  removeCountLine,
  resolveStale,
  setCounted,
  type CountForm,
  type CountLine,
} from './stock-logic';

type Banner = { tone: 'info' | 'success' | 'warning' | 'danger'; message: string } | null;

const statusText: Record<CountLine['status'], string> = {
  pending: 'Not submitted',
  done: 'Saved on the PC',
  matched: 'Matches the PC',
  conflict: 'Stock changed on the PC',
  error: 'Rejected',
};

/** Stock count: scan, review differences, and post STOCK_COUNT corrections (admin only). */
export function CountScreen() {
  const { client, scope, session } = useLookup();
  const queryClient = useQueryClient();
  const draft = useStockDraft<CountStore>(scope, 'count');
  const [banner, setBanner] = useState<Banner>(null),
    [password, setPassword] = useState(''),
    [submitting, setSubmitting] = useState(false),
    [searching, setSearching] = useState(false);

  if (session.user?.role !== 'ADMIN')
    return (
      <>
        <Stack.Screen options={{ title: 'Stock count' }} />
        <EmptyState
          title="Administrators only"
          message="A stock count corrects stock totals, which only an administrator can do on the PC. Use Receive goods or Adjust stock to add stock."
        />
      </>
    );

  const store = draft.store,
    form = store?.current.form ?? null;

  const update = async (change: (current: CountForm) => CountForm) => {
    const latest = store?.current.form;
    if (!store || !latest) return;
    await store.edit(change(latest));
  };

  const addProduct = async (product: Parameters<typeof addCountScan>[1]) => {
    try {
      await update((current) => addCountScan(current, product));
      setBanner({ tone: 'success', message: `Counted ${product.name}.` });
    } catch (error) {
      setBanner({ tone: 'danger', message: error instanceof Error ? error.message : 'Could not add it.' });
    }
  };

  const onCode = async (code: string) => {
    try {
      await addProduct(await productForCode(client, code));
    } catch (error) {
      setBanner({
        tone: 'danger',
        message: englishMessage(error instanceof Error ? error.message : 'Lookup failed.'),
      });
    }
  };

  const submit = async () => {
    if (!store || !form) return;
    setSubmitting(true);
    setBanner(null);
    let saved = 0;
    try {
      for (const line of linesToSubmit(form)) {
        const latest = store.current.form!;
        const current = latest.lines.find((row) => row.productId === line.productId);
        if (!current) continue;
        try {
          const result = await postMovement(client, line.productId, countPayload(latest, current, password));
          await update((f) =>
            markLine(f, line.productId, { status: result.changed ? 'done' : 'matched', message: null })
          );
          saved += 1;
        } catch (error) {
          if (!(error instanceof HcApiError)) throw error;
          if (error.code === 'ACCOUNT_PASSWORD') {
            setBanner({ tone: 'danger', message: englishMessage(error.message) });
            return;
          }
          if (error.status === 400 && isStaleStockMessage(error.message)) {
            const now = await currentStock(client, line.productId);
            const resolved = resolveStale(current, now);
            await update((f) =>
              markLine(f, line.productId, { status: resolved.status, message: resolved.message })
            );
            if (resolved.status === 'done') saved += 1;
            continue;
          }
          if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401) {
            await update((f) =>
              markLine(f, line.productId, { status: 'error', message: englishMessage(error.message) })
            );
            continue;
          }
          // Offline, timeout or server error: stop. A retry is safe because each
          // line carries the stock it was counted against.
          setBanner({
            tone: 'warning',
            message: `${englishMessage(error.message)} ${saved} line(s) were saved. Submit again to continue; nothing is applied twice.`,
          });
          return;
        }
      }
      const summary = countSummary(store.current.form!);
      setBanner(
        summary.conflicts || store.current.form!.lines.some((l) => l.status === 'error')
          ? { tone: 'warning', message: 'Some lines need attention. Review them below.' }
          : { tone: 'success', message: 'Count saved on the PC.' }
      );
      setPassword('');
    } catch (error) {
      setBanner({ tone: 'danger', message: error instanceof Error ? error.message : 'Submit failed.' });
    } finally {
      setSubmitting(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    }
  };

  if (!form)
    return (
      <>
        <Stack.Screen options={{ title: 'Stock count' }} />
        {draft.error ? <StatusBanner tone="danger" message={draft.error} /> : null}
      </>
    );

  const summary = countSummary(form),
    toSend = linesToSubmit(form).length,
    finished = summary.total > 0 && toSend === 0 && summary.conflicts === 0;

  if (searching)
    return (
      <>
        <Stack.Screen options={{ title: 'Add to count' }} />
        <AppButton label="Back to count" variant="secondary" onPress={() => setSearching(false)} />
        <ProductPicker
          onSelect={(product) => {
            setSearching(false);
            void addProduct(product);
          }}
        />
      </>
    );

  return (
    <>
      <Stack.Screen options={{ title: 'Stock count' }} />
      <FormPage title="Stock count">
        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}
        <ScanPanel onCode={onCode} disabled={submitting} />
        <AppButton label="Search products" variant="secondary" onPress={() => setSearching(true)} />

        <Card title={`Counted products (${summary.total})`}>
          <Text style={readStyles.subtitle}>
            {summary.changed} to correct · {summary.matching} match · {summary.submitted} submitted
          </Text>
        </Card>

        {form.lines.map((line) => (
          <CountRow
            key={line.productId}
            line={line}
            locked={submitting || line.status === 'done' || line.status === 'matched'}
            onCount={(value) =>
              void update((f) => setCounted(f, line.productId, value)).catch((e: Error) =>
                setBanner({ tone: 'danger', message: e.message })
              )
            }
            onRemove={() => void update((f) => removeCountLine(f, line.productId))}
            onRebase={async () => {
              const now = await currentStock(client, line.productId);
              await update((f) => rebaseCountLine(f, line.productId, now));
            }}
          />
        ))}

        {finished ? (
          <AppButton label="Start a new count" onPress={() => void draft.restart()} />
        ) : (
          <>
            <AppInput
              label="Reason"
              value={form.reason}
              maxLength={1000}
              onChangeText={(reason) => void update((f) => ({ ...f, reason }))}
            />
            <AppInput
              label="Note (optional)"
              value={form.note}
              maxLength={2000}
              onChangeText={(note) => void update((f) => ({ ...f, note }))}
            />
            <AppInput
              label="Your account password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <AppButton
              label={toSend ? `Submit ${toSend} correction${toSend === 1 ? '' : 's'}` : 'Nothing to submit'}
              loading={submitting}
              disabled={!toSend || !password || !form.reason.trim()}
              onPress={() => void submit()}
            />
            {summary.total > 0 && summary.submitted === 0 && (
              <AppButton
                label="Discard count"
                variant="secondary"
                disabled={submitting}
                onPress={() => void draft.restart()}
              />
            )}
          </>
        )}
      </FormPage>
    </>
  );
}

function CountRow({
  line,
  locked,
  onCount,
  onRemove,
  onRebase,
}: {
  line: CountLine;
  locked: boolean;
  onCount: (value: number) => void;
  onRemove: () => void;
  onRebase: () => Promise<void>;
}) {
  const difference = countDifference(line);
  const tone =
    line.status === 'conflict' || line.status === 'error'
      ? theme.colors.danger
      : difference === 0
        ? theme.colors.success
        : theme.colors.warning;
  return (
    <Card title={line.name}>
      <Text style={readStyles.subtitle}>{line.sku}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 15 }}>
        PC stock {line.expected} · Counted {line.counted} ·{' '}
        <Text style={{ color: tone, fontWeight: '700' }}>
          {difference > 0 ? `+${difference}` : difference}
        </Text>
      </Text>
      <Text style={{ color: tone, fontSize: 14, fontWeight: '600' }}>{statusText[line.status]}</Text>
      {line.message ? <Text style={{ color: theme.colors.danger }}>{line.message}</Text> : null}
      {!locked && (
        <QuantityStepper value={line.counted} min={0} label={`Counted quantity for ${line.name}`} onChange={onCount} />
      )}
      {line.status === 'conflict' && (
        <AppButton label="Use the PC's current stock as the start" variant="secondary" onPress={() => void onRebase()} />
      )}
      {!locked && line.status !== 'conflict' && (
        <AppButton label="Remove from count" variant="secondary" onPress={onRemove} />
      )}
    </Card>
  );
}
