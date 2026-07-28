import fs from 'fs';
import path from 'path';
import { BackupSettings, BackupToolPaths } from './backup.types';

const drives = ['C', 'D', 'E', 'F'];
const windowsProgramFiles = [
  process.env.ProgramFiles,
  process.env['ProgramFiles(x86)'],
  ...drives.map((d) => `${d}:\\Program Files`),
  ...drives.map((d) => `${d}:\\Program Files (x86)`),
].filter((value, index, self): value is string => Boolean(value) && self.indexOf(value) === index);

export class PostgresToolDiscovery {
  static discover(settings: BackupSettings): BackupToolPaths {
    return {
      pgDumpPath: this.findTool('pg_dump', settings.pgDumpPath),
      pgRestorePath: this.findTool('pg_restore', settings.pgRestorePath),
      psqlPath: this.findTool('psql', settings.psqlPath),
    };
  }

  static findTool(toolName: 'pg_dump' | 'pg_restore' | 'psql', configuredPath?: string | null) {
    const executableName = process.platform === 'win32' ? `${toolName}.exe` : toolName;
    const candidates = [
      configuredPath,
      process.env[`${toolName.toUpperCase()}_PATH`],
      ...this.pathCandidates(executableName),
      ...this.windowsCandidates(executableName),
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  private static pathCandidates(executableName: string) {
    return (process.env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean)
      .map((entry) => path.join(entry, executableName));
  }

  private static windowsCandidates(executableName: string) {
    const candidates: string[] = [];
    for (const programFiles of windowsProgramFiles) {
      const postgresRoot = path.join(programFiles, 'PostgreSQL');
      if (!fs.existsSync(postgresRoot)) continue;
      for (const version of fs.readdirSync(postgresRoot)) {
        candidates.push(path.join(postgresRoot, version, 'bin', executableName));
      }
    }
    return candidates.sort().reverse();
  }
}
