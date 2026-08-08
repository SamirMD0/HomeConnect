import os from 'os';

/**
 * Private IPv4 addresses this PC can be reached on from the shop Wi-Fi.
 *
 * Every candidate is returned rather than a single "best" guess. A Windows
 * business PC routinely carries extra adapters — Hyper-V, WSL, VirtualBox, a
 * VPN — and each one contributes a private address that looks exactly as
 * plausible as the real one. Guessing wrong produces a URL that silently fails
 * on the phone, which is the hardest kind of problem to diagnose from behind a
 * counter. Showing the list lets the operator pick the one that works.
 */

const PRIVATE_IPV4 = [
  /^192\.168\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

export function privateIpv4Candidates(
  interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()
): string[] {
  const found: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      // Node reports the family as 'IPv4' on modern releases and 4 on some
      // older ones; accept both rather than depend on the runtime.
      const isIpv4 = entry.family === 'IPv4' || (entry.family as unknown as number) === 4;
      if (!isIpv4 || entry.internal) continue;
      if (!PRIVATE_IPV4.some((range) => range.test(entry.address))) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }

  // 192.168.* first: it is overwhelmingly the shop router's range, so the most
  // likely working URL appears at the top of the list.
  return found.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

function rank(address: string): number {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  return 2;
}

export function mobileScannerUrls(addresses: string[], port: number): string[] {
  return addresses.map((address) => `http://${address}:${port}/mobile-scanner`);
}
