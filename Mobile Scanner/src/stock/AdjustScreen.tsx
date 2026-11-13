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
import {
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
    [banner, setBanner] = useState<Banner>(null);

  const before = inventory.data?.product.stockQuantity;
  const guarded = guardedMovementTypes.includes(type);
  const parsed = /^\d+$/.test(quantity.trim()) ? Number(quantity) : null;
  const after = before !== undefined && parsed !== null ? movementAfter(type, before, parsed) : null;

  const save = async () => {
    if (before === undefined) return;
    setSaving(true);
    setBanner(null);
    try {
      const payload = buildMovementPayload({ type, quantity, expectedBefore: before, reason, note, password });
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
            <Field label="Now on the PC" value={before} />
            {after !== null && <Field label="After this change" value={after} />}
          </Card>
        )}
        {banner ? <StatusBanner tone={banner.tone} message={banner.message} /> : null}
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
                hint="Required by the PC to remove or correct stock. It is not saved."
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
            <AppButton
              label="Save change"
              loading={saving}
              disabled={before === undefined || !quantity || !reason.trim() || (guarded && !password)}
              onPress={() => void save()}
            />
          </>
        )}
        <AppButton label="Done" variant="secondary" onPress={() => router.back()} />
      </FormPage>
    </>
  );
}
