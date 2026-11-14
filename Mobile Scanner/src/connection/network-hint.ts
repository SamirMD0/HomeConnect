/**
 * Explains a failed PC search from the phone's own network, when that is the
 * likely cause: no Wi-Fi at all, or Wi-Fi on a different network than the PC
 * (a guest network, an extender, another router). Returns null when the phone
 * looks fine, so the generic message stays.
 */
export interface PhoneNetwork {
  /** NetInfo type: 'wifi', 'cellular', 'ethernet', 'none', 'unknown', ... */
  type: string;
  /** The phone's own IPv4 address on Wi-Fi, when Android reports it. */
  ipAddress?: string | null;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** The part of an address that identifies its network, shown as "192.168.0.x". */
export function networkOf(ip: string): string | null {
  const match = IPV4.exec(ip.trim());
  if (!match) return null;
  const [, a, b, c] = match;
  // Home and shop routers use /24; 10.x and 172.16–31.x networks are often wider.
  if (a === '10') return `10.${b}.x.x`;
  if (a === '172' && Number(b) >= 16 && Number(b) <= 31) return `172.${b}.x.x`;
  return `${a}.${b}.${c}.x`;
}

export function networkHint(phone: PhoneNetwork | null, pcHosts: string[]): string | null {
  if (!phone) return null;
  if (phone.type === 'cellular' || phone.type === 'none')
    return 'Your phone is not on Wi-Fi. Connect it to the shop Wi-Fi, the same one as the PC, then try again.';
  if (phone.type !== 'wifi' || !phone.ipAddress) return null;
  const mine = networkOf(phone.ipAddress);
  const pcNetworks = pcHosts.map(networkOf).filter((value): value is string => Boolean(value));
  if (!mine || !pcNetworks.length || pcNetworks.includes(mine)) return null;
  return `Your phone is on another Wi-Fi (${mine}). The shop PC is on ${pcNetworks[0]}. Connect the phone to the same Wi-Fi as the PC, then try again.`;
}
