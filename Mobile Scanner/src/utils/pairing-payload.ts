import { ConnectionSettings } from '../types/scanner.types';
import { parseConnection } from './scanner-url';

/**
 * The Scanner Hub prints a QR code that encodes the shop PC's LAN address. The
 * phone scans it instead of asking the operator to type an IPv4 and port, which
 * is the single step they can neither find nor remember.
 *
 * Two shapes are accepted so the scanner is robust to the operator aiming at a
 * generic URL printed anywhere in the shop:
 *   hc://pair?h=<ip>&p=<port>   (the canonical Scanner Hub payload)
 *   http://<ip>:<port>          (the plain backend URL, same effect)
 *
 * Anything else (including https://, hostnames, scanner codes) returns null so
 * the UI can tell the operator the QR is not a Scanner Hub pairing code.
 */

const HC_SCHEME = 'hc://pair?';

export function buildPairingPayload(settings: ConnectionSettings): string {
  const host = encodeURIComponent(settings.host);
  const port = encodeURIComponent(String(settings.port));
  return `${HC_SCHEME}h=${host}&p=${port}`;
}

export function parsePairingPayload(input: string): ConnectionSettings | null {
  const text = typeof input === 'string' ? input.trim() : '';
  if (!text) return null;

  if (text.toLowerCase().startsWith(HC_SCHEME)) {
    const params = parseQuery(text.slice(HC_SCHEME.length));
    const host = params.get('h') ?? '';
    const port = params.get('p') ?? '';
    const parsed = parseConnection(host, port);
    return parsed.ok ? parsed.value : null;
  }

  const httpMatch = /^http:\/\/([^:/?#\s]+):(\d{1,5})(?:[/?#].*)?$/i.exec(text);
  if (httpMatch) {
    const parsed = parseConnection(httpMatch[1] ?? '', httpMatch[2] ?? '');
    return parsed.ok ? parsed.value : null;
  }

  return null;
}

function parseQuery(query: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    try {
      map.set(decodeURIComponent(rawKey ?? ''), decodeURIComponent(rawValue));
    } catch {
      // A malformed segment is treated as absent, not as an error.
    }
  }
  return map;
}
