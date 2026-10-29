import * as SecureStore from 'expo-secure-store';
import { setSelectedBranch } from './branch-selection';

const KEY = 'homeconnect.scanner.selected-branch.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export const loadSelectedBranch = () => SecureStore.getItemAsync(KEY, options);
export async function saveSelectedBranch(id: string) {
  await SecureStore.setItemAsync(KEY, id, options);
  setSelectedBranch(id);
}
export async function clearSelectedBranch() {
  setSelectedBranch(null);
  await SecureStore.deleteItemAsync(KEY, options);
}
