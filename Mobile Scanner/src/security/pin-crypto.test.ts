import { pbkdf2 as nodePbkdf2 } from 'node:crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ calls: 0 }));
// Node's PBKDF2 stands in for the native module in the APK.
vi.mock('react-native-quick-crypto', () => ({
  pbkdf2: (...args: Parameters<typeof nodePbkdf2>) => {
    native.calls++;
    return nodePbkdf2(...args);
  },
}));
import { derivePin, nativePbkdf2, resetNativePbkdf2 } from './pin-crypto';

const salt = '0123456789abcdef0123456789abcdef';
const javascriptHash = async (pin: string, iterations: number) =>
  bytesToHex(await pbkdf2Async(sha256, Uint8Array.from(pin, (c) => c.charCodeAt(0)), hexToBytes(salt), { c: iterations, dkLen: 32 }));

describe('PIN hashing', () => {
  beforeEach(() => {
    native.calls = 0;
    resetNativePbkdf2();
  });
  it('uses native PBKDF2 and gives exactly the JavaScript hash, so existing PINs keep working', async () => {
    const hash = await derivePin('482915', salt, 1000);
    expect(native.calls).toBe(1);
    expect(hash).toBe(await javascriptHash('482915', 1000));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('falls back to JavaScript on an app build without the native module', async () => {
    await expect(nativePbkdf2(() => Promise.reject(new Error('NitroModules are not installed')))).resolves.toBeNull();
    // The cached "no native module" answer now drives derivePin.
    expect(await derivePin('1234', salt, 1000)).toBe(await javascriptHash('1234', 1000));
    expect(native.calls).toBe(0);
  });
});
