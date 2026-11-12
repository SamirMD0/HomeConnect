import { Redirect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../session/SessionProvider';
import { ReceiptCaptureScreen } from '../screens/ReceiptCaptureScreen';
import { PendingBillsScreen } from '../screens/PendingBillsScreen';
import { SupplierPurchaseScreen } from '../screens/SupplierPurchaseScreen';
import { SupplierPaymentScreen } from '../screens/SupplierPaymentScreen';
import { can, type Permission } from '../permissions/can';
import { theme } from '../theme';
export type SupplierFeature = 'bill' | 'pending-bills' | 'invoice' | 'payment';
const permissions: Record<SupplierFeature, Permission> = {
  bill: 'supplierBills.capture',
  'pending-bills': 'suppliers.read',
  invoice: 'supplierInvoices.write',
  payment: 'supplierPayments.write',
};
export interface InvoiceFromBill {
  billId: string;
  billBranchId: string;
  supplierId: string;
}
export function FeatureScreen({ feature, fromBill }: { feature: SupplierFeature; fromBill?: InvoiceFromBill }) {
  const session = useSession();
  const router = useRouter();
  if (!session.connection || !session.token || !can(permissions[feature], session.user))
    return <Redirect href="/(tabs)/suppliers" />;
  const props = {
    connection: session.connection,
    token: session.token,
    onDone: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/suppliers')),
    onSessionInvalid: () => session.invalidateToken(session.token!),
  };
  if (feature === 'invoice')
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <SupplierPurchaseScreen {...props} fromBill={fromBill} />
      </SafeAreaView>
    );
  const Screen = {
    bill: ReceiptCaptureScreen,
    'pending-bills': PendingBillsScreen,
    invoice: SupplierPurchaseScreen,
    payment: SupplierPaymentScreen,
  }[feature];
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Screen {...props} />
    </SafeAreaView>
  );
}
