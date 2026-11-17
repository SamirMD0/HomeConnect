import { describe, it, expect, vi } from 'vitest';
const remove = vi.hoisted(() => vi.fn());
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file://cache/',
  deleteAsync: remove,
}));
import { clearCloudCaptureCache, removeCapturedSource } from './capture-cache';
describe('temporary capture files', () => {
  it('cleans only app-private capture caches, preserving gallery originals', async () => {
    await clearCloudCaptureCache();
    expect(remove.mock.calls.map((call) => call[0])).toEqual([
      'file://cache/Camera/',
      'file://cache/ImagePicker/',
      'file://cache/ImageManipulator/',
    ]);
    remove.mockClear();
    await removeCapturedSource('content://gallery/original');
    await removeCapturedSource('file://documents/original.jpg');
    expect(remove).not.toHaveBeenCalled();
    await removeCapturedSource('file://cache/ImageManipulator/prepared.jpg');
    expect(remove).toHaveBeenCalledWith('file://cache/ImageManipulator/prepared.jpg', {
      idempotent: true,
    });
  });
});
