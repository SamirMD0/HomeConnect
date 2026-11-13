import { Stack } from 'expo-router';
import { FeatureScreen } from '../../../src/navigation/FeatureScreen';
export default function Feature() {
  return (
    <>
      <Stack.Screen options={{ title: 'Supplier bill' }} />
      <FeatureScreen feature="bill" />
    </>
  );
}
