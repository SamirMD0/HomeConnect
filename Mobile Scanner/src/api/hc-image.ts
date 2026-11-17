import { cloudMode } from '../offline/cloud-mode';
import { authedHeaders, HcApiError, prepareApiSession, refreshApiSession, type AuthedClient } from './hc-client';

/**
 * Loads an image the PC serves behind sign-in (product photos, bill pages)
 * and returns a data URI for <Image>. The token goes in the header, never in
 * the URL. A 401 refreshes the session once and retries.
 */
export async function fetchAuthedImage(client: AuthedClient, path: string, branchId?: string): Promise<string> {
  if (cloudMode()) throw new Error('Photo available on the shop Wi-Fi');
  let token = await prepareApiSession(client.baseUrl);
  if (!token) throw new HcApiError('Please sign in again.', 'UNAUTHORIZED', 401);
  const url = `${client.baseUrl}/api/v1${path}`;
  const send = async () => {
    try {
      return await fetch(url, {
        headers: {
          ...authedHeaders({ ...client, token: token! }),
          ...(branchId ? { 'X-Branch-Scope': branchId } : {}),
        },
      });
    } catch {
      throw new HcApiError('Cannot reach the shop PC. Check Wi-Fi and retry.', 'NETWORK');
    }
  };
  let response = await send();
  if (response.status === 401) {
    token = await refreshApiSession();
    if (token) response = await send();
  }
  if (!response.ok)
    throw new HcApiError(
      'Could not load the image.',
      response.status === 401 ? 'UNAUTHORIZED' : 'SERVER',
      response.status
    );
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}
