import fs from 'fs/promises';
import http, { Server } from 'http';
import path from 'path';
import { buildContentSecurityPolicy } from './content-security-policy';
import { ELECTRON_HOST, FRONTEND_PORT } from './runtime-config';

// This server only ever serves the built bundle, so the strict policy applies.
// Electron replaces this header with its own identical policy; the header still
// matters if the packaged frontend is opened outside the desktop shell.
const PRODUCTION_CSP = buildContentSecurityPolicy('production');

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/** `port` is injectable so tests can bind an ephemeral port with 0. */
export function startStaticFrontendServer(
  frontendDistPath: string,
  port: number = FRONTEND_PORT
): Promise<Server> {
  const root = path.resolve(frontendDistPath);
  const server = http.createServer(async (req, res) => {
    try {
      const requestPath = decodeURIComponent(new URL(req.url || '/', `http://${ELECTRON_HOST}`).pathname);
      const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
      const candidatePath = path.resolve(root, relativePath);
      const safePath = isInside(root, candidatePath) ? candidatePath : path.join(root, 'index.html');
      const filePath = await resolveExistingFile(safePath, root);
      const extension = path.extname(filePath);
      const body = await fs.readFile(filePath);

      res.writeHead(200, {
        'Content-Type': mimeTypes[extension] || 'application/octet-stream',
        'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
        'Content-Security-Policy': PRODUCTION_CSP,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Frontend failed to load');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, ELECTRON_HOST, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function isInside(root: string, candidatePath: string) {
  const relative = path.relative(root, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveExistingFile(candidatePath: string, root: string) {
  try {
    const stats = await fs.stat(candidatePath);
    return stats.isFile() ? candidatePath : path.join(root, 'index.html');
  } catch {
    return path.join(root, 'index.html');
  }
}
