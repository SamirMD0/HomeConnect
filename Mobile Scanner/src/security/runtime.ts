import type { PinController } from './pin-controller';
import { PIN_KEY, secretStorage } from './storage';
import { parsePin } from './pin-controller';
let current: PinController | null = null;
export function setSecurityController(value: PinController | null) {
  current = value;
}
export const stopLocalSecurity = async () => {
  await current?.stop();
};
export async function securityStatus(owner: string) {
  const record = parsePin(await secretStorage.get(PIN_KEY), owner);
  return { pinSet: Boolean(record), lastUnlockAt: record?.lastUnlockAt ?? null };
}
