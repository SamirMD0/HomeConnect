import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../src/components/EmptyState';
import { useSession } from '../src/session/SessionProvider';
export default function UpdateRequired() {
  const session = useSession();
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        title="Update the app"
        message="This PC requires a newer HomeConnect mobile app. Install the latest internal APK from your administrator, then try again."
        action={{ label: 'Check again', onPress: session.retry }}
      />
    </SafeAreaView>
  );
}
