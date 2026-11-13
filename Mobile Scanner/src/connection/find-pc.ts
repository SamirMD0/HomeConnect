import { HcApiError } from '../api/hc-client';
import { checkClientCompatibility, type CompatibilityState } from '../api/system-api';
import type { ConnectionSettings } from '../types/scanner.types';
import { logConnection } from './connection-log';

/**
 * Finds the shop PC among every address it is known by.
 *
 * All addresses are tried at once and the first PC that answers wins; the
 * others become alternates. The saved address gets a short head start, so a
 * PC reachable on two adapters does not flip between them. When every address
 * fails with a network error the search is repeated twice, because the first
 * request after the phone's Wi-Fi wakes up often fails on its own.
 */

export interface FoundPc {
  settings: ConnectionSettings;
  compat: CompatibilityState;
}

export interface FindPcDeps {
  probe(settings: ConnectionSettings): Promise<CompatibilityState>;
  wait(ms: number): Promise<void>;
  now(): number;
}

export const RETRY_DELAYS_MS = [0, 1500, 3000];
export const HEAD_START_MS = 700;

const defaultDeps: FindPcDeps = {
  probe: checkClientCompatibility,
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

export function candidateHosts(settings: ConnectionSettings): string[] {
  return [settings.host, ...(settings.alternates ?? [])].filter(
    (host, index, all) => all.indexOf(host) === index
  );
}

/** Worth trying again: nothing answered, or the PC answered that it is still starting. */
function retryable(error: unknown): boolean {
  return (
    error instanceof HcApiError && (error.kind === 'NETWORK' || error.code === 'DESKTOP_UNAVAILABLE')
  );
}

export async function findPc(
  settings: ConnectionSettings,
  deps: FindPcDeps = defaultDeps
): Promise<FoundPc> {
  const hosts = candidateHosts(settings);
  let errors: unknown[] = [];
  for (const delay of RETRY_DELAYS_MS) {
    if (delay) await deps.wait(delay);
    const round = await firstAnswer(hosts, settings.port, deps);
    if (round.found) return round.found;
    errors = round.errors;
    if (!errors.every(retryable)) break;
  }
  throw explain(errors, hosts, settings.port);
}

async function firstAnswer(
  hosts: string[],
  port: number,
  deps: FindPcDeps
): Promise<{ found: FoundPc | null; errors: unknown[] }> {
  return new Promise((resolve) => {
    const errors: unknown[] = [];
    let settled = false;
    let pending = hosts.length;
    hosts.forEach((host, index) => {
      void (async () => {
        if (index > 0) await deps.wait(HEAD_START_MS);
        if (settled) {
          pending -= 1;
          return;
        }
        const started = deps.now();
        try {
          const compat = await deps.probe({ host, port });
          logConnection({ host, action: 'find PC', outcome: 'ok', ms: deps.now() - started, detail: null });
          if (!settled) {
            settled = true;
            resolve({
              found: {
                settings: { host, port, alternates: hosts.filter((other) => other !== host) },
                compat,
              },
              errors: [],
            });
          }
        } catch (error) {
          errors.push(error);
          logConnection({
            host,
            action: 'find PC',
            outcome: outcomeOf(error),
            ms: deps.now() - started,
            detail: error instanceof Error ? error.message : null,
          });
        } finally {
          pending -= 1;
          if (pending === 0 && !settled) {
            settled = true;
            resolve({ found: null, errors });
          }
        }
      })();
    });
  });
}

function outcomeOf(error: unknown): 'network' | 'timeout' | 'server' | 'rejected' {
  if (!(error instanceof HcApiError)) return 'server';
  if (error.kind === 'NETWORK') return /timed out/i.test(error.message) ? 'timeout' : 'network';
  if (error.status !== null && error.status < 500) return 'rejected';
  return 'server';
}

/** The most useful error: a PC that answered beats one that did not. */
function explain(errors: unknown[], hosts: string[], port: number): Error {
  const answered = errors.find((error) => !(error instanceof HcApiError && error.kind === 'NETWORK'));
  if (answered instanceof Error) return answered;
  const tried = hosts.map((host) => `${host}:${port}`).join(', ');
  return new HcApiError(
    `Cannot reach the shop PC (tried ${tried}). Check that the phone is on the shop Wi-Fi and Home Connect is open on the PC.`,
    'NETWORK'
  );
}
