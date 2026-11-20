import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
export const PIN_ITERATIONS = 150000;
export const validPin = (pin: string) => /^\d{4,6}$/.test(pin);

type NativePbkdf2 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
  callback: (error: Error | null, key?: { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }) => void
) => void;
let native: Promise<NativePbkdf2 | null> | null = null;
/**
 * Native PBKDF2 (react-native-quick-crypto). In plain JavaScript on Android's
 * Hermes engine, 150,000 rounds took about a minute on a real phone; natively it
 * takes well under a second. Returns null on a binary without the native module
 * (an older APK running newer JavaScript), which then uses the JavaScript version.
 */
export function nativePbkdf2(load = () => import('react-native-quick-crypto')) {
  return (native ??= load()
    .then((crypto) => {
      const pbkdf2 = (crypto as { pbkdf2?: NativePbkdf2; default?: { pbkdf2?: NativePbkdf2 } }).pbkdf2
        ?? (crypto as { default?: { pbkdf2?: NativePbkdf2 } }).default?.pbkdf2;
      return typeof pbkdf2 === 'function' ? pbkdf2 : null;
    })
    .catch(() => null));
}
export const resetNativePbkdf2 = () => {
  native = null;
};

/** PBKDF2-HMAC-SHA256, 32 bytes, hex. The same result natively and in JavaScript. */
export async function derivePin(pin: string, salt: string, iterations = PIN_ITERATIONS) {
  const bytes = Uint8Array.from(pin, (value) => value.charCodeAt(0));
  const saltBytes = hexToBytes(salt);
  try {
    const fast = await nativePbkdf2();
    if (fast) {
      const key = await new Promise<Uint8Array>((resolve, reject) =>
        fast(bytes, saltBytes, iterations, 32, 'sha256', (error, derived) =>
          error || !derived
            ? reject(error ?? new Error('PIN hashing failed.'))
            : resolve(new Uint8Array(derived.buffer, derived.byteOffset, derived.byteLength))
        )
      );
      return bytesToHex(key);
    }
    return bytesToHex(
      await pbkdf2Async(sha256, bytes, saltBytes, { c: iterations, dkLen: 32, asyncTick: 8 })
    );
  } finally {
    bytes.fill(0);
  }
}
export function sameHash(left: string, right: string) {
  if (left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
