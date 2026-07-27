import { ChildProcess, SpawnOptions, spawn } from 'child_process';
import path from 'path';
import { BACKEND_PORT, ELECTRON_HOST, FRONTEND_ORIGIN } from './runtime-config';

export function startCompiledBackend(backendEntryPath: string, userDataPath?: string, resourcesPath?: string, onOutput?: (log: string) => void) {
  const config = buildBackendSpawnConfig(backendEntryPath, userDataPath, resourcesPath);
  const child = spawn(config.command, config.args, config.options);

  pipeChildOutput(child, onOutput);
  return child;
}

export function buildBackendSpawnConfig(
  backendEntryPath: string,
  userDataPath?: string,
  resourcesPath?: string
) {
  return {
    command: process.execPath,
    args: [backendEntryPath],
    options: {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      env: buildBackendEnvironment(userDataPath, resourcesPath),
      windowsHide: true,
    } satisfies SpawnOptions,
  };
}

export function buildBackendEnvironment(userDataPath?: string, resourcesPath?: string): NodeJS.ProcessEnv {
  const safeUserDataPath = userDataPath || process.env.HOME_CONNECT_USER_DATA;
  const packagedNodePaths = resourcesPath
    ? [
        path.join(resourcesPath, 'app.asar', 'node_modules'),
        path.join(resourcesPath, 'app.asar.unpacked', 'node_modules'),
      ].join(path.delimiter)
    : undefined;
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    HOST: ELECTRON_HOST,
    PORT: String(BACKEND_PORT),
    NODE_ENV: 'production',
    FRONTEND_URL: FRONTEND_ORIGIN,
    CORS_ORIGINS: `http://localhost:3002,${FRONTEND_ORIGIN}`,
    COOKIE_SECURE: 'false',
    ...(packagedNodePaths ? { NODE_PATH: packagedNodePaths } : {}),
    ...(safeUserDataPath
      ? {
          BACKEND_ENV_FILE: process.env.BACKEND_ENV_FILE || path.join(safeUserDataPath, 'config', 'production.env'),
          HOME_CONNECT_USER_DATA: safeUserDataPath,
          HOME_CONNECT_CONFIG_DIR: path.join(safeUserDataPath, 'config'),
          LOG_DIR: path.join(safeUserDataPath, 'logs'),
        }
      : {}),
  };
}

export function pipeChildOutput(child: ChildProcess, onOutput?: (log: string) => void) {
  child.stdout?.on('data', (chunk) => {
    const redacted = redactLogChunk(String(chunk));
    process.stdout.write(`[backend] ${redacted}`);
    if (onOutput) onOutput(`[backend] ${redacted}`);
  });
  child.stderr?.on('data', (chunk) => {
    const redacted = redactLogChunk(String(chunk));
    process.stderr.write(`[backend] ${redacted}`);
    if (onOutput) onOutput(`[backend] ${redacted}`);
  });
}

export function redactLogChunk(input: string) {
  return input
    .replace(/(DATABASE_URL=)[^\s"]+/gi, '$1[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@)/gi, '$1[REDACTED]$2')
    .replace(/(JWT_SECRET=)[^\s"]+/gi, '$1[REDACTED]')
    .replace(/(PGPASSWORD=)[^\s"]+/gi, '$1[REDACTED]');
}
