export const ELECTRON_HOST = '127.0.0.1';
export const BACKEND_PORT = 3001;
export const FRONTEND_PORT = 3002;

export const BACKEND_ORIGIN = `http://${ELECTRON_HOST}:${BACKEND_PORT}`;
export const FRONTEND_ORIGIN = `http://${ELECTRON_HOST}:${FRONTEND_PORT}`;
export const BACKEND_HEALTH_URL = `${BACKEND_ORIGIN}/api/v1/health`;

export const READY_TIMEOUT_MS = 45_000;
