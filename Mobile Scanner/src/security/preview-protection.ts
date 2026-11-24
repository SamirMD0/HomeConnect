import { Platform } from 'react-native';
let tail: Promise<unknown> = Promise.resolve(),
  nextId = 0;
const leases = new Set<string>();
function serial<T>(work: () => Promise<T>) {
  const next = tail.then(work);
  tail = next.catch(() => {});
  return next;
}
/** Unique leases keep an old pairing's cleanup from releasing a new pairing's protection. */
export function protectCloudPreview() {
  return serial(async () => {
    const capture = await import('expo-screen-capture'),
      key = `cloud-data-${++nextId}`;
    // Screenshots stay allowed on purpose (owner's decision, 2026-11-24): the
    // phone screens are reviewed from screenshots. Only the iOS app switcher
    // preview is hidden below.
    try {
      if (Platform.OS === 'ios' && leases.size === 0)
        await capture.enableAppSwitcherProtectionAsync();
    } catch (error) {
      await capture.allowScreenCaptureAsync(key);
      throw error;
    }
    leases.add(key);
    let released = false;
    return () =>
      serial(async () => {
        if (released) return;
        released = true;
        leases.delete(key);
        await capture.allowScreenCaptureAsync(key);
        if (Platform.OS === 'ios' && leases.size === 0)
          await capture.disableAppSwitcherProtectionAsync();
      });
  });
}
