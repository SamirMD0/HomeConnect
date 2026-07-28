import type { Session } from 'electron';
import { BACKEND_ORIGIN, FRONTEND_ORIGIN } from './runtime-config';

export type CspMode = 'development' | 'production';

/**
 * Vite may be reached on either loopback spelling during development, and its
 * HMR channel is a websocket on the same port.
 */
const DEV_FRONTEND_ORIGINS = ['http://localhost:3002', FRONTEND_ORIGIN];
const DEV_WEBSOCKET_ORIGINS = ['ws://127.0.0.1:3002', 'ws://localhost:3002'];

const CSP_HEADER = 'Content-Security-Policy';

export function resolveCspMode(nodeEnv = process.env.NODE_ENV): CspMode {
  return nodeEnv === 'development' ? 'development' : 'production';
}

/**
 * Builds the renderer policy.
 *
 * Production is strict: no 'unsafe-eval' and no inline scripts. The built bundle
 * was checked and contains neither `eval(` nor `new Function(`, so nothing needs
 * relaxing there.
 *
 * Development additionally allows *inline* script, because @vitejs/plugin-react
 * injects its react-refresh preamble as an inline script tag. It deliberately
 * does not allow 'unsafe-eval': the only dependency that reaches for the Function
 * constructor is Zod's `allowsEval` probe, which is wrapped in try/catch and
 * falls back to its non-JIT path when the constructor is blocked.
 *
 * Electron detects an insecure policy by attempting eval in the renderer, so
 * keeping eval blocked in both modes also clears its startup warning.
 */
export function buildContentSecurityPolicy(mode: CspMode): string {
  const isDev = mode === 'development';

  const scriptSrc = isDev
    ? ["'self'", ...DEV_FRONTEND_ORIGINS, "'unsafe-inline'"]
    : ["'self'"];

  const connectSrc = isDev
    ? ["'self'", BACKEND_ORIGIN, ...DEV_FRONTEND_ORIGINS, ...DEV_WEBSOCKET_ORIGINS]
    : ["'self'", BACKEND_ORIGIN];

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', scriptSrc],
    // 'unsafe-inline' is required for style *attributes*, not stylesheets:
    // framer-motion animates through element.style and the bills meter sets its
    // width inline. It carries far less risk than inline script and does not
    // trigger Electron's insecure-CSP warning.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', connectSrc],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];

  return directives.map(([directive, values]) => `${directive} ${values.join(' ')}`).join('; ');
}

/**
 * Applies the policy to every http(s) response the renderer receives. Needed
 * because the dev server is Vite's, not ours, so a response header is the only
 * place a policy can be attached for both modes.
 *
 * file:// pages (the startup monitor) are not covered by webRequest and carry
 * their own <meta http-equiv="Content-Security-Policy"> instead.
 */
export function applyContentSecurityPolicy(session: Session, mode: CspMode): void {
  const policy = buildContentSecurityPolicy(mode);

  session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string | string[]> = { ...details.responseHeaders };

    // Remove any upstream policy so exactly one policy is in force. Two policies
    // intersect, which makes a mismatch very hard to debug.
    for (const header of Object.keys(responseHeaders)) {
      const name = header.toLowerCase();
      if (name === 'content-security-policy' || name === 'content-security-policy-report-only') {
        delete responseHeaders[header];
      }
    }

    responseHeaders[CSP_HEADER] = [policy];
    callback({ responseHeaders });
  });
}
