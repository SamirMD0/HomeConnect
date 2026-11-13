import { useMemo } from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { FeatureScreen } from '../../../src/navigation/FeatureScreen';
export default function Feature() {
  const params = useLocalSearchParams<{ billId?: string; billBranchId?: string; supplierId?: string }>();
  const { billId, billBranchId, supplierId } = params;
  // Stable identity: the invoice screen reloads suppliers when this changes.
  const fromBill = useMemo(
    () => (billId && billBranchId && supplierId ? { billId, billBranchId, supplierId } : undefined),
    [billId, billBranchId, supplierId]
  );
  return (
    <>
      <Stack.Screen options={{ title: fromBill ? 'Purchase from bill' : 'Supplier invoice' }} />
      <FeatureScreen feature="invoice" fromBill={fromBill} />
    </>
  );
}
