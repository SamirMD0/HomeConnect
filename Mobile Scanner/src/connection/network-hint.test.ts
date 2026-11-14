import { describe, expect, it, vi } from 'vitest';
import { HcApiError } from '../api/hc-client';
import { networkHint, networkOf } from './network-hint';
import { findPc } from './find-pc';

vi.mock('../api/system-api', () => ({ checkClientCompatibility: vi.fn() }));

const pc = ['192.168.0.103'];

describe('networkHint', () => {
  it('names both networks when the phone is on another Wi-Fi', () => {
    expect(networkHint({ type: 'wifi', ipAddress: '10.0.0.24' }, pc)).toBe(
      'Your phone is on another Wi-Fi (10.0.x.x). The shop PC is on 192.168.0.x. Connect the phone to the same Wi-Fi as the PC, then try again.'
    );
    expect(networkHint({ type: 'wifi', ipAddress: '192.168.1.40' }, pc)).toMatch(/192\.168\.1\.x.*192\.168\.0\.x/);
  });

  it('says so when the phone is on mobile data or offline', () => {
    expect(networkHint({ type: 'cellular' }, pc)).toMatch(/not on Wi-Fi/);
    expect(networkHint({ type: 'none' }, pc)).toMatch(/not on Wi-Fi/);
  });

  it('stays quiet when the phone is on the PC network or the facts are unknown', () => {
    expect(networkHint({ type: 'wifi', ipAddress: '192.168.0.77' }, pc)).toBeNull();
    // Any of the PC's addresses counts (a PC on two networks).
    expect(networkHint({ type: 'wifi', ipAddress: '172.20.5.9' }, ['192.168.0.103', '172.20.224.1'])).toBeNull();
    expect(networkHint({ type: 'wifi', ipAddress: null }, pc)).toBeNull();
    expect(networkHint({ type: 'unknown' }, pc)).toBeNull();
    expect(networkHint({ type: 'wifi', ipAddress: '10.0.0.5' }, ['shop-pc.local'])).toBeNull();
    expect(networkHint(null, pc)).toBeNull();
  });

  it('treats 10.x and 172.16–31.x as wider networks', () => {
    expect(networkOf('10.1.2.3')).toBe('10.1.x.x');
    expect(networkOf('172.20.224.1')).toBe('172.20.x.x');
    expect(networkOf('192.168.0.103')).toBe('192.168.0.x');
    expect(networkOf('not-an-ip')).toBeNull();
  });
});

describe('findPc with the phone network', () => {
  const settings = { host: '192.168.0.103', port: 3011 };
  const base = {
    probe: vi.fn(async () => {
      throw new HcApiError('Cannot reach the shop PC.', 'NETWORK');
    }),
    wait: async () => undefined,
    now: () => 0,
  };

  it('replaces the generic failure with the network hint when nothing answers', async () => {
    const network = vi.fn(async () => ({ type: 'wifi', ipAddress: '10.0.0.24' }));
    await expect(findPc(settings, { ...base, network })).rejects.toThrow(/another Wi-Fi \(10\.0\.x\.x\)/);
    // Read once, only after every retry round failed.
    expect(network).toHaveBeenCalledTimes(1);
    expect(base.probe).toHaveBeenCalledTimes(3);
  });

  it('keeps the generic failure when the phone is on the right network', async () => {
    const network = async () => ({ type: 'wifi', ipAddress: '192.168.0.50' });
    await expect(findPc(settings, { ...base, network })).rejects.toThrow(/Cannot reach the shop PC \(tried 192\.168\.0\.103:3011\)/);
  });

  it('never reads the network when the PC answered with an error', async () => {
    const network = vi.fn(async () => ({ type: 'cellular' }));
    const probe = vi.fn(async () => {
      throw new HcApiError('Update HomeConnect.', 'SERVER', 500);
    });
    await expect(findPc(settings, { ...base, probe, network })).rejects.toThrow('Update HomeConnect.');
    expect(network).not.toHaveBeenCalled();
  });
});
