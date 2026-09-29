export const ELECTRON_HOST = '127.0.0.1';
function configuredPort(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid ${name}`);
  return port;
}
// Allows isolated local release rehearsals; binding remains IPv4 loopback only.
export const BACKEND_PORT = configuredPort('HOME_CONNECT_BACKEND_PORT', 3001);
export const FRONTEND_PORT = configuredPort('HOME_CONNECT_FRONTEND_PORT', 3002);

export const BACKEND_ORIGIN = `http://${ELECTRON_HOST}:${BACKEND_PORT}`;
export const FRONTEND_ORIGIN = `http://${ELECTRON_HOST}:${FRONTEND_PORT}`;
export const BACKEND_HEALTH_URL = `${BACKEND_ORIGIN}/api/v1/health`;

export const READY_TIMEOUT_MS = 45_000;
