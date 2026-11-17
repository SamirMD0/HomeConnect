import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { useSession } from '../session/SessionProvider';
import { CLOUD_WRITE_NOTE } from './cloud-policy';
export { CLOUD_WRITE_NOTE } from './cloud-policy';
export function CloudWriteGuard({ children }: PropsWithChildren) {
  const { mode } = useSession();
  if (mode !== 'cloud') return children;
  return <View className="m-4 gap-4 rounded-xl bg-white p-6"><Text>{CLOUD_WRITE_NOTE}</Text><Button disabled><Text>Unavailable over cloud</Text></Button></View>;
}
export function CloudWifiGuard({ children }: PropsWithChildren) {
  const { mode } = useSession();
  return mode === 'cloud' ? <View className="m-4 rounded-xl bg-white p-6"><Text>Available on the shop Wi-Fi.</Text></View> : children;
}
