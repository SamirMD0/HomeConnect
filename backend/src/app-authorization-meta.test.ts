import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const appSource = fs.readFileSync(path.resolve(__dirname, 'app.ts'), 'utf8');

describe('API authorization architecture', () => {
  it('mounts every private API router behind requireAuth', () => {
    const mounts = appSource.split(/\r?\n/)
      .filter((line) => line.includes("app.use('/api/v1/"));
    expect(mounts.length).toBeGreaterThan(20);

    const publicMounts = new Set(['/api/v1/auth']);
    for (const line of mounts) {
      const route = line.match(/app\.use\('([^']+)'/)?.[1];
      expect(route, line).toBeTruthy();
      if (publicMounts.has(route!)) {
        expect(line, `${route} is the deliberately public login/setup router`).not.toContain('requireAuth');
      } else {
        expect(line, `${route} must be protected at the application boundary`).toContain('requireAuth');
      }
    }
  });

  it('does not allow a direct mutation handler to bypass protected router mounts', () => {
    expect(appSource).not.toMatch(/app\.(?:post|put|patch|delete)\s*\(/);
  });
});
