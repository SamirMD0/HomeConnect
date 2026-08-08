import os from 'os';
import { describe, expect, it } from 'vitest';
import { mobileScannerUrls, privateIpv4Candidates } from './lan-address';

const iface = (address: string, extras: Partial<os.NetworkInterfaceInfo> = {}): os.NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/24`,
  ...extras,
} as os.NetworkInterfaceInfo);

describe('privateIpv4Candidates', () => {
  it('keeps private addresses and drops loopback', () => {
    const result = privateIpv4Candidates({
      'Wi-Fi': [iface('192.168.1.25')],
      'Loopback': [iface('127.0.0.1', { internal: true })],
    });
    expect(result).toEqual(['192.168.1.25']);
  });

  it('drops public addresses', () => {
    expect(privateIpv4Candidates({ WAN: [iface('203.0.113.10')] })).toEqual([]);
  });

  it('drops IPv6', () => {
    const result = privateIpv4Candidates({
      'Wi-Fi': [iface('fe80::1', { family: 'IPv6' } as Partial<os.NetworkInterfaceInfo>)],
    });
    expect(result).toEqual([]);
  });

  /**
   * A business PC usually has more than one plausible-looking private address.
   * Ranking puts the shop router's range first, but every candidate is returned
   * so a wrong guess is not silently baked into the URL.
   */
  it('ranks the shop router range first but keeps every candidate', () => {
    const result = privateIpv4Candidates({
      'vEthernet (WSL)': [iface('172.20.16.1')],
      'Hyper-V': [iface('10.0.75.1')],
      'Wi-Fi': [iface('192.168.1.25')],
    });
    expect(result).toEqual(['192.168.1.25', '10.0.75.1', '172.20.16.1']);
  });

  it('accepts the numeric family some Node builds report', () => {
    const result = privateIpv4Candidates({
      'Wi-Fi': [iface('192.168.1.30', { family: 4 } as unknown as Partial<os.NetworkInterfaceInfo>)],
    });
    expect(result).toEqual(['192.168.1.30']);
  });

  it('excludes 172 addresses outside the private block', () => {
    const result = privateIpv4Candidates({ a: [iface('172.15.0.1')], b: [iface('172.32.0.1')], c: [iface('172.16.0.1')] });
    expect(result).toEqual(['172.16.0.1']);
  });

  it('de-duplicates an address reported on two adapters', () => {
    expect(privateIpv4Candidates({ a: [iface('192.168.1.25')], b: [iface('192.168.1.25')] })).toEqual(['192.168.1.25']);
  });

  it('survives an adapter with no entries', () => {
    expect(privateIpv4Candidates({ empty: undefined })).toEqual([]);
  });
});

describe('mobileScannerUrls', () => {
  it('builds one reachable URL per candidate', () => {
    expect(mobileScannerUrls(['192.168.1.25', '10.0.0.5'], 3011)).toEqual([
      'http://192.168.1.25:3011/mobile-scanner',
      'http://10.0.0.5:3011/mobile-scanner',
    ]);
  });
});
