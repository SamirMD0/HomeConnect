import http from 'node:http';
import type { RequestHandler } from 'express';

// This JWT surface is separate from the global x-scanner-session product scans.
// Match exact methods and paths; never expose arbitrary desktop API routes.
const allowed = [
  ['POST', /^\/api\/v1\/auth\/login$/],
  ['GET', /^\/api\/v1\/auth\/me$/],
  ['GET', /^\/api\/v1\/branches\/accessible$/],
  ['GET', /^\/api\/v1\/products(?:\/scan)?$/],
  ['GET', /^\/api\/v1\/suppliers$/],
  ['GET', /^\/api\/v1\/suppliers\/[a-f0-9-]+\/purchases$/i],
  ['POST', /^\/api\/v1\/suppliers\/[a-f0-9-]+\/(?:purchases|transactions)$/i],
  ['GET', /^\/api\/v1\/supplier-purchases\/receipt-check$/],
  ['POST', /^\/api\/v1\/supplier-purchases\/[a-f0-9-]+\/receipts$/i],
  ['GET', /^\/api\/v1\/supplier-ledger$/],
] as const;

export function createMobileApiGateway(port = Number(process.env.PORT || 3001)): RequestHandler {
  return (req, res, next) => {
    if (!allowed.some(([method, path]) => method === req.method && path.test(req.path))) return next();
    // The desktop validates the JWT and branch access. A scanner pairing token
    // cannot authorize this surface. Leave unauthenticated GETs unmounted.
    if (req.path !== '/api/v1/auth/login' && !req.headers.authorization?.startsWith('Bearer ')) return next();
    const headers: http.OutgoingHttpHeaders = {};
    for (const name of ['authorization', 'accept', 'content-type', 'content-length', 'x-branch-scope']) {
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    }
    const upstream = http.request({ hostname: '127.0.0.1', port, method: req.method, path: req.originalUrl, headers }, (response) => {
      res.status(response.statusCode ?? 502);
      for (const name of ['content-type', 'content-length', 'retry-after']) {
        if (response.headers[name] !== undefined) res.setHeader(name, response.headers[name]!);
      }
      // Never forward login cookies to the phone; it uses the returned JWT.
      response.pipe(res);
      response.on('error', () => res.destroy());
    });
    upstream.setTimeout(30_000, () => upstream.destroy(new Error('Desktop API timeout')));
    upstream.on('error', () => {
      if (res.headersSent) return res.destroy();
      res.status(502).json({ success: false, error: { code: 'DESKTOP_UNAVAILABLE', message: 'Desktop API is unavailable' } });
    });
    req.on('aborted', () => upstream.destroy());
    // Run before JSON parsing: raw receipt bytes and JSON are forwarded intact.
    req.pipe(upstream);
  };
}
