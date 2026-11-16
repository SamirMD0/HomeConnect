import * as SecureStore from 'expo-secure-store';
import { pairedUser, parseCloudPairing, type CloudPairing } from './cloud-pairing';
const key = 'homeconnect.cloud-pairing.v1';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
export async function loadCloudPairing() {
  const saved = await SecureStore.getItemAsync(key, options);
  if (!saved) return null;
  const pairing = parseCloudPairing(saved, true);
  if (!pairing) await SecureStore.deleteItemAsync(key, options);
  return pairing;
}
export const saveCloudPairing = (value: CloudPairing) => SecureStore.setItemAsync(key, JSON.stringify({ ...value, user: pairedUser(value) }), options);
export const clearCloudPairing = () => SecureStore.deleteItemAsync(key, options);
