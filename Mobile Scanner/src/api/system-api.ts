import type { ClientCompatibility } from '@shared/mobile-contracts';
import appConfig from '../../app.json';
import { backendBaseUrl, HcApiError, requestJson } from './hc-client';
import type { ConnectionSettings } from '../types/scanner.types';
import { compareVersions } from '../utils/version';
/**
 * The first desktop release that carries everything this app uses (bills inbox,
 * stock routes, the gateway deny-list, the refresh header). Older PCs still
 * work for the basics but show a warning.
 */
/** PC 2.3.0 added bill pages, payment links, replace and delete. */
export const REQUIRED_API_VERSION = '2.3.0';
export interface CompatibilityState {
  blocked: boolean;
  warning: string | null;
}
export async function checkClientCompatibility(
  connection: ConnectionSettings
): Promise<CompatibilityState> {
  let compat: ClientCompatibility;
  try {
    compat = await requestJson<ClientCompatibility>(
      `${backendBaseUrl(connection)}/api/v1/system/client-compat`
    );
  } catch (error) {
    if (error instanceof HcApiError && error.status === 404)
      return { blocked: false, warning: 'This PC needs an update to support all mobile features.' };
    throw error;
  }
  try {
    return {
      blocked: compareVersions(appConfig.expo.version, compat.minMobileVersion) < 0,
      warning:
        compareVersions(compat.apiVersion, REQUIRED_API_VERSION) < 0
          ? 'Update HomeConnect on the shop PC to use all mobile features.'
          : null,
    };
  } catch {
    throw new HcApiError(
      'The PC returned an invalid compatibility response. Update HomeConnect on the PC.',
      'SERVER'
    );
  }
}
