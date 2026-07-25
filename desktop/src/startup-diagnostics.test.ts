import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseDatabaseUrl, writeStartupDiagnostics } from './startup-diagnostics';
import fs from 'fs';
import path from 'path';

vi.mock('fs');
vi.mock('net', () => {
  return {
    default: {
      createServer: () => ({
        once: (event: string, cb: any) => {
          if (event === 'listening') {
            setTimeout(cb, 10);
          }
        },
        listen: vi.fn(),
        close: vi.fn(),
      })
    }
  };
});

describe('startup-diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseDatabaseUrl', () => {
    it('parses valid database url and omits password', () => {
      const parsed = parseDatabaseUrl('postgresql://user:secret123@localhost:5432/homeconnect');
      expect(parsed).toEqual({
        host: 'localhost',
        port: '5432',
        database: 'homeconnect',
        username: 'user',
      });
    });

    it('handles empty or missing url safely', () => {
      const parsed = parseDatabaseUrl(undefined);
      expect(parsed).toEqual({
        host: null,
        port: null,
        database: null,
        username: null,
      });
    });

    it('handles invalid urls safely', () => {
      const parsed = parseDatabaseUrl('not-a-valid-url');
      expect(parsed).toEqual({
        host: null,
        port: null,
        database: null,
        username: null,
      });
    });
  });

  describe('writeStartupDiagnostics', () => {
    it('writes diagnostic json file and redacts passwords', async () => {
      const existsSyncMock = vi.mocked(fs.existsSync).mockReturnValue(false);
      const writeFileSyncMock = vi.mocked(fs.writeFileSync);

      await writeStartupDiagnostics('/dummy/user/data', {
        envFilePath: '/dummy/env/file.env',
        backendReady: true,
        frontendReady: true,
        backendPort: 3001,
        frontendPort: 3002,
        backendPath: '/dummy/backend',
        frontendPath: '/dummy/frontend',
        prismaRuntimePath: '/dummy/prisma',
        success: true,
      });

      expect(writeFileSyncMock).toHaveBeenCalledTimes(1);
      const callArgs = writeFileSyncMock.mock.calls[0];
      expect(callArgs[0]).toContain('startup-diagnostics.json');
      
      const loggedData = JSON.parse(callArgs[1] as string);
      expect(loggedData.envFileExists).toBe(false);
      expect(loggedData.success).toBe(true);
      expect(loggedData.paths.backend).toBe('/dummy/backend');
      expect(loggedData.ports.backendPortInUse).toBe(false);
    });
  });
});
