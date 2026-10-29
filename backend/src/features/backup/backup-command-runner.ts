import { spawn } from 'child_process';
import fs from 'fs/promises';
import { BackupCommandError } from './backup.errors';
import { PostgresConnectionInfo } from './postgres-url';

/** pg_dump never emits CREATE SCHEMA public (initdb creates it), so recreate it before replaying. */
export const RESET_PUBLIC_SCHEMA_SQL = 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;';

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

  /** Prints the backup's migration history (COPY text) to stdout; reads only the archive. */
  static pgRestoreMigrationHistoryArgs(backupPath: string) {
    return ['--data-only', '--table=_prisma_migrations', '--file=-', backupPath];
  }

  /**
   * Converts the archive to a plain SQL script. Restoring goes through psql
   * instead of `pg_restore --clean`: --clean only drops objects named in the
   * backup, so tables added by later updates kept their foreign keys and blocked
   * the drops, and pg_restore carried on past the errors, leaving a database
   * that was half one machine and half the other.
   */
  static pgRestoreToSqlArgs(backupPath: string, sqlFile: string) {
    return ['--no-owner', '--no-privileges', `--file=${sqlFile}`, backupPath];
  }

  /**
   * Empties the schema and replays the backup in ONE transaction that stops at
   * the first error, so a failed restore leaves the database exactly as it was.
   */
  static psqlAtomicRestoreArgs(connection: PostgresConnectionInfo, sqlFile: string) {
    return [
      '--no-psqlrc',
      '--quiet',
      '--single-transaction',
      '--set=ON_ERROR_STOP=1',
      `--host=${connection.host}`,
      `--port=${connection.port}`,
      `--username=${connection.username}`,
      `--dbname=${connection.database}`,
      `--command=${RESET_PUBLIC_SCHEMA_SQL}`,
      `--file=${sqlFile}`,
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
