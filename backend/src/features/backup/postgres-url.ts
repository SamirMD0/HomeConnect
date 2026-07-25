import { BackupValidationError } from './backup.errors';

export interface PostgresConnectionInfo {
  host: string;
  port: string;
  username: string;
  password: string;
  database: string;
}

export function parsePostgresConnectionString(input = process.env.DATABASE_URL): PostgresConnectionInfo {
  if (!input) {
    throw new BackupValidationError('DATABASE_URL is required for backup operations');
  }

  const url = new URL(input);
  if (!url.protocol.startsWith('postgres')) {
    throw new BackupValidationError('DATABASE_URL must be a PostgreSQL connection string');
  }

  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new BackupValidationError('Database name is missing from DATABASE_URL');
  }

  return {
    host: url.hostname || 'localhost',
    port: url.port || '5432',
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}
