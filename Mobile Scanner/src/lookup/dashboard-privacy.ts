export const DASHBOARD_HIDE_KEY = 'homeconnect.dashboard.hideNumbers';
export const hiddenDashboardValue = '••••';
/** Unlike desktop's visual blur, omit the original value from accessible text too. */
export function dashboardDisplayValue(hidden: boolean, formatted: string): string {
  return hidden ? hiddenDashboardValue : formatted;
}
export async function readDashboardPrivacy(storage: {
  getItemAsync(key: string): Promise<string | null>;
}) {
  try {
    return (await storage.getItemAsync(DASHBOARD_HIDE_KEY)) === '1';
  } catch {
    return true;
  }
}
