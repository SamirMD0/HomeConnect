import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HcApiError } from '../api/hc-client';
import type { CompatibilityState } from '../api/system-api';
import type { ConnectionSettings } from '../types/scanner.types';
import { clearConnectionLog, connectionLog } from './connection-log';
import { candidateHosts, findPc, type FindPcDeps } from './find-pc';

vi.mock('../api/system-api', () => ({ checkClientCompatibility: vi.fn() }));

const ok: CompatibilityState = { blocked: false, warning: null };
const offline = () => new HcApiError('Cannot reach the shop PC.', 'NETWORK');

/** Probes answer by host; waits resolve at once but are recorded. */
function deps(answers: Record<string, ('ok' | 'down' | 'starting' | 'old')[]>) {
  const calls: string[] = [];
  const waits: number[] = [];
  const probe = vi.fn(async ({ host }: ConnectionSettings) => {
    calls.push(host);
    const next = answers[host]?.shift() ?? 'down';
    if (next === 'ok') return ok;
    if (next === 'old') throw new HcApiError('Update HomeConnect.', 'SERVER', 500);
    if (next === 'starting')
      throw new HcApiError('Starting', 'SERVER', 502, 'DESKTOP_UNAVAILABLE');
    throw offline();
  });
  const value: FindPcDeps = {
    probe,
    wait: async (ms) => {
      waits.push(ms);
    },
    now: () => 0,
  };
  return { value, calls, waits };
}

const saved = { host: '192.168.0.178', port: 3011, alternates: ['172.17.208.1'] };

describe('findPc', () => {
  beforeEach(() => clearConnectionLog());

  it('keeps the saved address when it answers', async () => {
    const { value } = deps({ '192.168.0.178': ['ok'], '172.17.208.1': ['ok'] });
    await expect(findPc(saved, value)).resolves.toEqual({ settings: saved, compat: ok });
  });

  it('moves to another address of the same PC when the saved one is dead', async () => {
    const { value } = deps({ '192.168.0.178': ['down'], '172.17.208.1': ['ok'] });
    await expect(findPc(saved, value)).resolves.toEqual({
      settings: { host: '172.17.208.1', port: 3011, alternates: ['192.168.0.178'] },
      compat: ok,
    });
  });

  it('tries again when nothing answers the first time (Wi-Fi waking up)', async () => {
    const { value, waits } = deps({ '192.168.0.178': ['down', 'down', 'ok'], '172.17.208.1': [] });
    await expect(findPc(saved, value)).resolves.toMatchObject({ settings: { host: '192.168.0.178' } });
    expect(waits.filter((ms) => ms >= 1000)).toEqual([1500, 3000]);
  });

  it('waits while the PC app is still starting', async () => {
    const { value } = deps({ '192.168.0.178': ['starting', 'ok'] });
    await expect(findPc({ host: '192.168.0.178', port: 3011 }, value)).resolves.toMatchObject({
      compat: ok,
    });
  });

  it('gives up after three rounds and names every address it tried', async () => {
    const { value, calls } = deps({});
    await expect(findPc(saved, value)).rejects.toThrow(
      'tried 192.168.0.178:3011, 172.17.208.1:3011'
    );
    expect(calls).toHaveLength(6);
    expect(connectionLog()).toHaveLength(6);
    expect(connectionLog()[0]).toMatchObject({ action: 'find PC', outcome: 'network' });
  });

  it('stops at once and reports the answer when a PC replies with an error', async () => {
    const { value, calls } = deps({ '192.168.0.178': ['old'], '172.17.208.1': ['down'] });
    await expect(findPc(saved, value)).rejects.toThrow('Update HomeConnect.');
    expect(calls).toHaveLength(2);
  });
});

describe('candidateHosts', () => {
  it('puts the saved address first and drops repeats', () => {
    expect(candidateHosts({ host: 'a', port: 1, alternates: ['b', 'a', 'b'] })).toEqual(['a', 'b']);
  });
});
