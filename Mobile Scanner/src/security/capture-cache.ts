/** Native camera/decoder scratch files are temporary, never the durable outbox photo. */
export async function clearCloudCaptureCache() {
  const fs = await import('expo-file-system/legacy');
  if (!fs.cacheDirectory) return;
  for (const name of ['Camera', 'ImagePicker', 'ImageManipulator'])
    await fs.deleteAsync(`${fs.cacheDirectory}${name}/`, { idempotent: true });
}
export async function removeCapturedSource(uri: string) {
  const fs = await import('expo-file-system/legacy');
  // Only remove our own scratch copy, never a gallery original or content:// URI.
  if (fs.cacheDirectory && uri.startsWith(fs.cacheDirectory))
    await fs.deleteAsync(uri, { idempotent: true });
}
