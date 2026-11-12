const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode exp only for scheduling; authentication and verification stay on the PC. */
export function accessTokenNeedsRefresh(token: string, now = Date.now()): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return false;
    let bits = 0,
      value = 0,
      json = '';
    for (const character of payload.replace(/-/g, '+').replace(/_/g, '/')) {
      value = (value << 6) | alphabet.indexOf(character);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        json += String.fromCharCode((value >> bits) & 255);
      }
    }
    const { exp } = JSON.parse(json) as { exp?: unknown };
    return typeof exp === 'number' && Number.isFinite(exp) && exp * 1000 - now < 5 * 60_000;
  } catch {
    return false;
  }
}
