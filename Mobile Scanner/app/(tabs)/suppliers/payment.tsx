import { CloudWriteGuard } from '../../../src/offline/CloudWriteGuard';
import { Stack } from 'expo-router';
import { FeatureScreen } from '../../../src/navigation/FeatureScreen';
export default function Feature() {
  return (<CloudWriteGuard>
    <>
      <Stack.Screen options={{ title: 'Supplier payment' }} />
      <FeatureScreen feature="payment" />
    </>
  </CloudWriteGuard>);
}
