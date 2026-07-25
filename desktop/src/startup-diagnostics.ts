import fs from 'fs';
import path from 'path';
import net from 'net';
import dotenv from 'dotenv';

export interface StartupDiagnostics {
  timestamp: string;
  envFilePath: string;
  envFileExists: boolean;
  dbParsed: {
    host: string | null;
    port: string | null;
    database: string | null;
    username: string | null;
  };
  backendReady: boolean;
  frontendReady: boolean;
  ports: {
    backendPortInUse: boolean;
    frontendPortInUse: boolean;
  };
  paths: {
    backend: string;
    frontend: string;
    prismaRuntime: string;
  };
  success: boolean;
  error?: string;
}

export const checkPortInUse = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
};

export const parseDatabaseUrl = (url?: string) => {
  if (!url) {
    return { host: null, port: null, database: null, username: null };
  }
  
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : null,
      username: parsed.username || null,
    };
  } catch {
    return { host: null, port: null, database: null, username: null };
  }
};

export const writeStartupDiagnostics = async (
  userDataPath: string,
  options: {
    envFilePath: string;
    backendReady: boolean;
    frontendReady: boolean;
    backendPort: number;
    frontendPort: number;
    backendPath: string;
    frontendPath: string;
    prismaRuntimePath: string;
    success: boolean;
    error?: string;
  }
) => {
  const logDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const envFileExists = fs.existsSync(options.envFilePath);
  let dbUrl = '';
  
  if (envFileExists) {
    const parsedEnv = dotenv.parse(fs.readFileSync(options.envFilePath, 'utf8'));
    dbUrl = parsedEnv.DATABASE_URL || '';
  } else if (process.env.DATABASE_URL) {
    dbUrl = process.env.DATABASE_URL;
  }

  const [backendPortInUse, frontendPortInUse] = await Promise.all([
    checkPortInUse(options.backendPort),
    checkPortInUse(options.frontendPort),
  ]);

  const diagnostics: StartupDiagnostics = {
    timestamp: new Date().toISOString(),
    envFilePath: options.envFilePath,
    envFileExists,
    dbParsed: parseDatabaseUrl(dbUrl),
    backendReady: options.backendReady,
    frontendReady: options.frontendReady,
    ports: {
      backendPortInUse,
      frontendPortInUse,
    },
    paths: {
      backend: options.backendPath,
      frontend: options.frontendPath,
      prismaRuntime: options.prismaRuntimePath,
    },
    success: options.success,
    ...(options.error ? { error: options.error } : {}),
  };

  const diagnosticsPath = path.join(logDir, 'startup-diagnostics.json');
  fs.writeFileSync(diagnosticsPath, JSON.stringify(diagnostics, null, 2), 'utf8');
  
  return diagnostics;
};
