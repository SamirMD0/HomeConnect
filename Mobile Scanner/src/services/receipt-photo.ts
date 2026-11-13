import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Apply rotation/decoding for gallery images too, then always encode JPEG. */
export async function prepareReceiptPhoto(photo: {
  uri: string;
  width: number;
  height: number;
}): Promise<string> {
  const resize =
    Math.max(photo.width, photo.height) > 2000
      ? [{ resize: photo.width >= photo.height ? { width: 2000 } : { height: 2000 } }]
      : [];
  let result = await manipulateAsync(photo.uri, resize, { compress: 0.7, format: SaveFormat.JPEG });
  const info = await FileSystem.getInfoAsync(result.uri);
  // 2000px/0.7 normally meets the target; unusually detailed images get a
  // smaller second pass while preserving the same JPEG quality.
  if (info.exists && info.size > 1.5 * 1024 * 1024) {
    result = await manipulateAsync(
      result.uri,
      [{ resize: result.width >= result.height ? { width: 1600 } : { height: 1600 } }],
      { compress: 0.7, format: SaveFormat.JPEG }
    );
  }
  return result.uri;
}
