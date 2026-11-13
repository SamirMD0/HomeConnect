/** Plain-language text for the over-the-air update row (kept pure for tests). */
export function describeInstalledUpdate(state: {
  version: string;
  enabled: boolean;
  channel: string | null;
  updateId: string | null;
  isEmbeddedLaunch: boolean;
}): string {
  if (!state.enabled) return `Version ${state.version} · updates are off in this build`;
  const channel = state.channel ? ` · ${state.channel}` : '';
  const source =
    state.isEmbeddedLaunch || !state.updateId
      ? 'built-in version'
      : `update ${state.updateId.slice(0, 8)}`;
  return `${source}${channel} · tap to check for an update`;
}

export function updateCheckMessage(result: 'none' | 'ready' | 'error', detail?: string): string {
  if (result === 'none') return 'You have the latest version.';
  if (result === 'ready') return 'A new version was downloaded. Restart the app to use it. Saved drafts and pending bills are kept.';
  return `Could not check for an update. Updates need an internet connection.${detail ? ` (${detail})` : ''}`;
}

/** What the floating update banner should say, if anything. */
export function updateBannerState(state: {
  enabled: boolean;
  isDownloading: boolean;
  isUpdatePending: boolean;
  progress?: number;
}): { kind: 'downloading' | 'ready'; message: string } | null {
  if (!state.enabled) return null;
  if (state.isUpdatePending) return { kind: 'ready', message: 'Update ready' };
  if (state.isDownloading) {
    const percent = typeof state.progress === 'number' && state.progress > 0 ? ` ${Math.round(state.progress * 100)}%` : '';
    return { kind: 'downloading', message: `Downloading update…${percent}` };
  }
  return null;
}
