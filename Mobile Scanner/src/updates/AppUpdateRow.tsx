import { useState } from 'react';
import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import appConfig from '../../app.json';
import { ListRow } from '../components/ListRow';
import { describeInstalledUpdate, updateCheckMessage } from './update-status';

/**
 * Shows the installed version and checks for an over-the-air update. Updates
 * come from Expo's servers over the internet; with no internet the app keeps
 * running the version it has. A new native build is still needed whenever a
 * native package changes (see docs/mobile/README.md).
 */
export function AppUpdateRow() {
  const [checking, setChecking] = useState(false);
  const installed = describeInstalledUpdate({
    version: appConfig.expo.version,
    enabled: Updates.isEnabled,
    channel: Updates.channel,
    updateId: Updates.updateId,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  });

  const check = async () => {
    if (!Updates.isEnabled || checking) return;
    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Home Connect', updateCheckMessage('none'));
        return;
      }
      await Updates.fetchUpdateAsync();
      Alert.alert('Update ready', updateCheckMessage('ready'), [
        { text: 'Later', style: 'cancel' },
        { text: 'Restart now', onPress: () => void Updates.reloadAsync() },
      ]);
    } catch (error) {
      Alert.alert('Home Connect', updateCheckMessage('error', error instanceof Error ? error.message : undefined));
    } finally {
      setChecking(false);
    }
  };

  return (
    <ListRow
      title={`Home Connect ${appConfig.expo.version}`}
      subtitle={checking ? 'Checking for an update…' : installed}
      onPress={Updates.isEnabled ? () => void check() : undefined}
    />
  );
}
