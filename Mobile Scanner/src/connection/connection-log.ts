/**
 * The last connection attempts, kept in memory for the Connection details
 * screen. When the phone cannot reach the PC this shows which address was
 * tried, how long it took and why it failed, instead of a guess.
 *
 * Memory only: it is a diagnostic for the moment, cleared when the app closes,
 * and it never holds tokens or request bodies.
 */

export type ConnectionOutcome = 'ok' | 'network' | 'timeout' | 'server' | 'rejected';

export interface ConnectionLogEntry {
  id: number;
  at: number;
  host: string;
  /** What was being done: 'find PC', or the API path of a failed request. */
  action: string;
  outcome: ConnectionOutcome;
  ms: number;
  detail: string | null;
}

const LIMIT = 60;
let entries: ConnectionLogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

export function logConnection(entry: Omit<ConnectionLogEntry, 'id' | 'at'>, at = Date.now()) {
  entries = [{ ...entry, id: nextId++, at }, ...entries].slice(0, LIMIT);
  listeners.forEach((listener) => listener());
}

export function connectionLog(): readonly ConnectionLogEntry[] {
  return entries;
}

export function clearConnectionLog() {
  entries = [];
  listeners.forEach((listener) => listener());
}

export function subscribeConnectionLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Host and path of a URL, without the query (which can carry search text). */
export function describeUrl(url: string): { host: string; path: string } {
  const match = /^https?:\/\/([^/:?#]+)(?::\d+)?([^?#]*)/i.exec(url);
  return { host: match?.[1] ?? url, path: match?.[2] || '/' };
}
