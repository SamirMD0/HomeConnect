import { afterEach, describe, expect, it, vi } from 'vitest';
import { manipulateAsync } from 'expo-image-manipulator';
import { getInfoAsync } from 'expo-file-system/legacy';
import { prepareReceiptPhoto } from './receipt-photo';
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));
vi.mock('expo-file-system/legacy', () => ({ getInfoAsync: vi.fn() }));
afterEach(() => vi.resetAllMocks());
describe('bill photo preparation for camera and gallery', () => {
  it.each([
    [4000, 3000, { width: 2000 }],
    [3000, 4000, { height: 2000 }],
  ])(
    'resizes %s x %s to a maximum long edge of 2000px and encodes JPEG at 0.7',
    async (width, height, resize) => {
      vi.mocked(manipulateAsync).mockResolvedValue({
        uri: 'file://compressed.jpg',
        width: 2000,
        height: 1500,
      });
      vi.mocked(getInfoAsync).mockResolvedValue({ exists: true, size: 1_000_000 } as never);
      expect(
        await prepareReceiptPhoto({
          uri: 'file://original',
          width: Number(width),
          height: Number(height),
        })
      ).toBe('file://compressed.jpg');
      expect(manipulateAsync).toHaveBeenCalledWith('file://original', [{ resize }], {
        compress: 0.7,
        format: 'jpeg',
      });
    }
  );
  it('encodes a small image without enlarging it', async () => {
    vi.mocked(manipulateAsync).mockResolvedValue({
      uri: 'file://compressed.jpg',
      width: 600,
      height: 800,
    });
    vi.mocked(getInfoAsync).mockResolvedValue({ exists: true, size: 1000 } as never);
    await prepareReceiptPhoto({ uri: 'file://gallery.png', width: 600, height: 800 });
    expect(manipulateAsync).toHaveBeenCalledWith('file://gallery.png', [], {
      compress: 0.7,
      format: 'jpeg',
    });
  });
});
