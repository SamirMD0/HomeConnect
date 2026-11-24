/**
 * "Update ready" notification for a closed app (Phase 4, decided 2026-11-23).
 * The phone checks for an over-the-air update in the background (Android
 * decides when: about every 15 minutes to a few hours), downloads it, and
 * shows its own notification. No push service, no Firebase, nothing on the
 * relay. Kept free of Expo imports so it can be tested.
 */
export const UPDATE_TASK = 'home-connect-update-check';
export const UPDATE_CHANNEL = 'app-updates';
/** Minutes between background checks; Android treats it as a minimum. */
export const CHECK_EVERY_MINUTES = 15;

export const UPDATE_NOTICE = {
  title: 'Home Connect update ready',
  body: 'Open the app to start using the new version.',
  data: { kind: 'app-update' },
} as const;

export interface UpdateAlertDeps {
  check(): Promise<{ isAvailable: boolean; id?: string }>;
  fetch(): Promise<{ id?: string }>;
  /** True while the app is on screen: the in-app banner asks to restart instead. */
  onScreen(): boolean;
  lastNotified(): Promise<string | null>;
  rememberNotified(id: string): Promise<void>;
  notify(): Promise<void>;
}

export type UpdateAlertResult = 'none' | 'shown' | 'already-told' | 'on-screen';

/** One background run: find, download, and tell once per update. */
export async function checkAndNotify(deps: UpdateAlertDeps): Promise<UpdateAlertResult> {
  const found = await deps.check();
  if (!found.isAvailable) return 'none';
  const fetched = await deps.fetch();
  if (deps.onScreen()) return 'on-screen';
  const id = fetched.id ?? found.id ?? 'unknown';
  if ((await deps.lastNotified()) === id) return 'already-told';
  await deps.notify();
  await deps.rememberNotified(id);
  return 'shown';
}

export type PermissionState = { granted: boolean; canAskAgain: boolean };

/** Ask at most once, after explaining why; never nag after "Not now" or a refusal. */
export function shouldOfferAlerts(permission: PermissionState, alreadyOffered: boolean) {
  return !permission.granted && permission.canAskAgain && !alreadyOffered;
}
