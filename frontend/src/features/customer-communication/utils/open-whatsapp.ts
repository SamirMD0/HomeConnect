/**
 * Renderer side of the WhatsApp deep link.
 *
 * In the packaged app `window.open` is denied by `setWindowOpenHandler`, so the
 * only working path is the allowlisted `comm:openWhatsApp` IPC channel. In a
 * plain dev browser `electronAPI` is absent and `window.open` works, so we fall
 * back to it.
 *
 * Either way this only *opens* WhatsApp with the text prefilled. Nothing is sent.
 */
export async function openWhatsAppLink(url: string): Promise<{ opened: boolean; error?: string }> {
  const bridge = window.electronAPI?.openWhatsApp;

  if (bridge) return bridge(url);

  const opened = window.open(url, '_blank', 'noopener');
  return opened
    ? { opened: true }
    : { opened: false, error: 'WhatsApp could not be opened. Copy the message instead.' };
}
