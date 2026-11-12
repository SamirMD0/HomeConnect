import http from 'node:http';
import type { RequestHandler } from 'express';

/** Desktop-only operations, including the real administration mounts in app.ts.
 * Prefix boundaries prevent /systematic from matching /system. The public GET
 * client-compat handshake is the sole exception under /system.
 */
export const MOBILE_DENIED_PREFIXES = [
  '/api/v1/backup',
  '/api/v1/backups',
  '/api/v1/system',
  '/api/v1/maintenance',
  '/api/v1/setup',
  '/api/v1/updates',
  '/api/v1/diagnostics',
  '/api/v1/preflight',
  '/api/v1/scanner',
  '/api/v1/admin/backups',
  '/api/v1/admin/maintenance',
  '/api/v1/admin/diagnostics',
  '/api/v1/admin/preflight',
  '/api/v1/auth/setup',
] as const;

function canonicalPath(raw: string): string | null {
  let path = raw.split('?')[0];
  try {
    for (let pass = 0; pass < 3; pass++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    return null;
  }
  if (
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  )
    return null;
  return path.replace(/\/+/g, '/').replace(/\/$/, '').toLowerCase();
}
const legacyScanner = new Set([
  'POST /api/v1/scanner/pair',
  'POST /api/v1/scanner/events',
  'GET /api/v1/scanner/session',
]);

// RFC 6265 cookie-octet: a header can supply exactly one cookie value, never
// another cookie or a control character. Desktop refresh tokens are JWTs.
function cookieValue(value: unknown): value is string {
  return typeof value === 'string' && /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/.test(value);
}

function refreshCookie(cookies: string[] | undefined): string | null {
  for (const cookie of cookies ?? []) {
    const match = /^refreshToken=([^;]*)/.exec(cookie);
    if (match && cookieValue(match[1])) return match[1];
  }
  return null;
}

export function createMobileApiGateway(port = Number(process.env.PORT || 3001)): RequestHandler {
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const path = canonicalPath(req.originalUrl);
    const hasToken = /^Bearer\s+\S+/i.test(req.headers.authorization ?? '');
    const compat = req.method === 'GET' && path === '/api/v1/system/client-compat';
    const login = req.method === 'POST' && path === '/api/v1/auth/login';
    const refresh = req.method === 'POST' && path === '/api/v1/auth/refresh';
    const logout = req.method === 'POST' && path === '/api/v1/auth/logout';
    // Paired browser scanning remains a separate legacy surface, never a way
    // to authenticate JWT desktop administration routes.
    if (!hasToken && path && legacyScanner.has(`${req.method} ${path}`)) return next();
    if (
      !path ||
      !path.startsWith('/api/v1/') ||
      (!compat &&
        MOBILE_DENIED_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/')))
    ) {
      res.status(403).json({
        success: false,
        error: {
          code: 'NOT_AVAILABLE_ON_MOBILE',
          message: 'This operation is available only on the shop PC.',
        },
      });
      return;
    }
    if (!hasToken && !compat && !login) return next();
    if (login || refresh) res.setHeader('Cache-Control', 'no-store');
    const headers: http.OutgoingHttpHeaders = {};
    for (const name of [
      'authorization',
      'accept',
      'content-type',
      'content-length',
      'x-branch-scope',
      'x-receipt-id',
      'x-request-id',
      'if-none-match',
    ]) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    // Only these auth operations translate the phone's secure-store token.
    // Phone-sent Cookie and X-Refresh-Token never enter the general whitelist.
    const token = req.headers['x-refresh-token'];
    if ((refresh || logout) && cookieValue(token)) headers.cookie = `refreshToken=${token}`;
    const upstream = http.request(
      { hostname: '127.0.0.1', port, method: req.method, path: req.originalUrl, headers },
      (response) => {
        res.status(response.statusCode ?? 502);
        for (const name of [
          'content-type',
          'content-length',
          'retry-after',
          'cache-control',
          'etag',
          'x-request-id',
        ]) {
          if (response.headers[name] !== undefined) res.setHeader(name, response.headers[name]!);
        }
        // Keep the desktop's cookie contract private to loopback. The native
        // client receives only the named refresh token on login/refresh.
        if (login || refresh) {
          res.setHeader('Cache-Control', 'no-store');
          const token = refreshCookie(response.headers['set-cookie']);
          if (token) res.setHeader('X-Refresh-Token', token);
        }
        response.pipe(res);
        response.on('error', () => res.destroy());
      }
    );
    upstream.setTimeout(60_000, () => upstream.destroy(new Error('Desktop API timeout')));
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.status(502).json({
        success: false,
        error: { code: 'DESKTOP_UNAVAILABLE', message: 'Desktop API is unavailable' },
      });
    });
    req.on('aborted', () => upstream.destroy());
    // Run before JSON parsing: raw receipt bytes and JSON are forwarded intact.
    req.pipe(upstream);
  };
}
