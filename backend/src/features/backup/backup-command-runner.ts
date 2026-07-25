import { spawn } from 'child_process';
import fs from 'fs/promises';
import { BackupCommandError } from './backup.errors';
import { PostgresConnectionInfo } from './postgres-url';

export interface CommandResult {
  exitCode: number;
  stderr: string;
  stdout: string;
  durationMs: number;
}

export class BackupCommandRunner {
  static runCommand(
    executable: string,
    args: string[],
    connection: Pick<PostgresConnectionInfo, 'password'>,
    timeoutMs = 5 * 60 * 1000
  ): Promise<CommandResult> {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        shell: false,
        env: {
          ...process.env,
          PGPASSWORD: connection.password,
        },
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill();
        reject(new BackupCommandError('PostgreSQL command timed out'));
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(new BackupCommandError('PostgreSQL command failed to start', { message: error.message }));
      });
      child.on('close', (exitCode) => {
        clearTimeout(timeout);
        resolve({
          exitCode: exitCode ?? 1,
          stderr,
          stdout,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  }

  static pgDumpArgs(connection: PostgresConnectionInfo, destination: string) {
    return [
      '--format=custom',
      `--file=${destination}`,
      `--host=${connection.host}`,
      `--port=${connection.port}`,
      `--username=${connection.username}`,
      `--dbname=${connection.database}`,
      '--no-owner',
      '--no-privileges',
    ];
  }

  static pgRestoreListArgs(backupPath: string) {
    return ['--list', backupPath];
  }

  static pgRestoreArgs(connection: PostgresConnectionInfo, backupPath: string) {
    return [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      `--host=${connection.host}`,
      `--port=${connection.port}`,
      `--username=${connection.username}`,
      `--dbname=${connection.database}`,
      backupPath,
    ];
  }

  static async removeIncompleteFile(backupPath: string) {
    try {
      await fs.unlink(backupPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }
}
