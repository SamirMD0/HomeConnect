import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getInventory, getProduct } from '../api/catalog-api';
import { HcApiError } from '../api/hc-client';
import { AppButton } from '../components/AppButton';
import { AppInput } from '../components/AppInput';
import { StatusBanner } from '../components/StatusBanner';
import { useLookup } from '../lookup/useLookup';
import { Card, Field, ReadState, readStyles } from '../lookup/ReadUI';
import { queryKeys } from '../query/keys';
import { FormPage } from '../sales/FormUI';
import { postMovement } from './stock-api';
import { enqueueCloudAction } from '../offline/outbox-runtime';
import { OutboxStatus } from '../offline/OutboxStatus';
import {
  buildCloudMovementPayload,
  buildMovementPayload,
  englishMessage,
  guardedMovementTypes,
  isStaleStockMessage,
  movementAfter,
  movementLabels,
  movementTypesFor,
  type MovementType,
} from './stock-logic';

type Banner = { tone: 'success' | 'warning' | 'danger'; message: string } | null;

/** One stock movement for one product, as on the desktop StockMovementDialog. */
export function AdjustScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>(),
    router = useRouter();
  const { client, key, scope, session } = useLookup();
  const queryClient = useQueryClient();
  const product = useQuery({
    queryKey: queryKeys.product(scope, id),
    queryFn: () => getProduct(client, id),
    enabled: Boolean(id),
  });
  const inventory = useQuery({
    queryKey: key('product-inventory', { id }),
    queryFn: () => getInventory(client, id),
    enabled: Boolean(id),
  });
  const types = movementTypesFor(session.user?.role);
  const [type, setType] = useState<MovementType>('MANUAL_ADD'),
    [quantity, setQuantity] = useState(''),
    [reason, setReason] = useState(''),
    [note, setNote] = useState(''),
    [password, setPassword] = useState(''),
    [saving, setSaving] = useState(false),
    [banner, setBanner] = useState<Banner>(null),
    [queued, setQueued] = useState<string | null>(null);
  const cloud = session.mode === 'cloud';

  const before = inventory.data?.product.stockQuantity;
  // Over the cloud an admin phone's PIN confirms guarded changes.
  const guarded = guardedMovementTypes.includes(type) && !cloud;
  const parsed = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null;
  const after = before !== undefined && parsed !== null ? movementAfter(type, before, parsed) : null;

  const save = async () => {
    if (!cloud && before === undefined) return;
    setSaving(true);
    setBanner(null);
    if (cloud) {
      try {
        const payload = buildCloudMovementPayload({ productId: id, type, quantity, reason, note });
        const action = await enqueueCloudAction({
          type: 'stock_movement.create',
          submissionKey: (await import('expo-crypto')).randomUUID(),
          payload,
          summary: `Stock · ${movementLabels[type]} ${payload.quantity} · ${product.data?.name ?? 'Product'}`,
        });
        setQueued(action.id);
        setQuantity('');
      } catch (error) {
        setBanner({ tone: 'danger', message: error instanceof Error ? error.message : 'Could not save.' });
      } finally {
        setSaving(false);
      }
      return;
    }
    try {
      const payload = buildMovementPayload({ type, quantity, expectedBefore: before!, reason, note, password });
      const result = await postMovement(client, id, payload);
      setPassword('');
      setQuantity('');
      setBanner({
        tone: 'success',
        message: result.changed
          ? `Saved. Shared stock is now ${result.product.stockQuantity}.`
          : englishMessage(result.message ?? 'The count already matches. Nothing changed.'),
      });
    } catch (error) {
      const message = englishMessage(error instanceof Error ? error.message : 'Could not save.');
      if (error instanceof HcApiError && isStaleStockMessage(error.message)) {
        // Also covers a retry after a lost response: nothing is applied twice.
        setBanner({
          tone: 'warning',
          message: `${message} The stock shown has been refreshed. Check the movements below before saving again.`,
        });
      } else setBanner({ tone: 'danger', message });
    } finally {
      setSaving(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.scope(scope) });
    }
  };

  const tracked = inventory.data?.product.trackStock;
  return (
    <>
      <Stack.Screen options={{ title: 'Adjust stock' }} />
      <FormPage title={product.data?.name ?? 'Adjust stock'}>
        <ReadState query={product} />
        <ReadState query={inventory} />
        {before !== undefined && (
          <Card title="Shared stock · all branches">
            <Field label={cloud ? "On the PC at last sync" : "Now on the PC"} value={before} />
            {after !== null && <Field label="After this change" value={after} />}
          </Card>
        )}
        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}
        {queued ? <OutboxStatus id={queued} /> : null}
        {tracked === false ? (
          <StatusBanner tone="warning" message="This product does not track stock." />
        ) : (
          <>
            <Text accessibilityRole="header" style={readStyles.section}>
              Change
            </Text>
            <View style={{ gap: 8 }}>
              {types.map((option) => (
                <AppButton
                  key={option}
                  label={`${type === option ? '● ' : ''}${movementLabels[option]}`}
                  variant={type === option ? 'primary' : 'secondary'}
                  onPress={() => setType(option)}
                />
              ))}
            </View>
            <AppInput
              label={type === 'STOCK_COUNT' ? 'Counted total' : 'Quantity'}
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="number-pad"
            />
            <AppInput label="Reason" value={reason} onChangeText={setReason} maxLength={1000} />
            <AppInput label="Note (optional)" value={note} onChangeText={setNote} maxLength={2000} />
            {guarded && (
              <AppInput
                label="Your account password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <AppButton
              label={queued ? 'Save another change' : 'Save change'}
              loading={saving}
              disabled={(!cloud && before === undefined) || !quantity || !reason.trim() || (guarded && !password)}
              onPress={() => void save()}
            />
          </>
        )}
        <AppButton label="Done" variant="secondary" onPress={() => router.back()} />
      </FormPage>
    </>
  );
}
