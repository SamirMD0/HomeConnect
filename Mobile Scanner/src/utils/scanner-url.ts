import { ConnectionSettings } from '../types/scanner.types';

export const DEFAULT_SCANNER_PORT = 3011;

const IPV4_PARTS = 4;

export type ConnectionValidation =
  | { ok: true; value: ConnectionSettings }
  | { ok: false; message: string };

export function parseConnection(hostInput: string, portInput: string): ConnectionValidation {
  const host = hostInput.trim();
  const parts = host.split('.');
  const validHost = parts.length === IPV4_PARTS && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });

  if (!validHost) {
    return { ok: false, message: 'Enter the PC IPv4 address, for example 192.168.1.20.' };
  }

  if (!/^\d+$/.test(portInput.trim())) {
    return { ok: false, message: 'Port must be a number.' };
  }

  const port = Number(portInput.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return { ok: false, message: 'Port must be between 1 and 65535.' };
  }

  return { ok: true, value: { host, port } };
}

export function scannerBaseUrl(settings: ConnectionSettings): string {
  return `http://${settings.host}:${settings.port}`;
}
