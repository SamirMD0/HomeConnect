import { describe, expect, it } from 'vitest';
import appConfig from '../app.json';

/**
 * Guards the Android permissions the app depends on. `cameraPermission: false`
 * on expo-image-picker once stripped CAMERA from the manifest, so the phone
 * showed "No permissions requested" and QR pairing and scanning could not work.
 */
describe('app.json Android permissions', () => {
  const expo = appConfig.expo;
  const plugin = (name: string) =>
    expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === name) as [string, Record<string, unknown>] | undefined;

  it('requests the camera and never blocks it', () => {
    expect(expo.android.permissions).toContain('android.permission.CAMERA');
    expect(expo.android.blockedPermissions ?? []).not.toContain('android.permission.CAMERA');
    expect(plugin('expo-image-picker')?.[1].cameraPermission).not.toBe(false);
    expect(plugin('expo-camera')?.[1].cameraPermission).toEqual(expect.any(String));
  });

  it('keeps the microphone off', () => {
    expect(expo.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
    expect(plugin('expo-camera')?.[1].recordAudioAndroid).toBe(false);
  });
});
