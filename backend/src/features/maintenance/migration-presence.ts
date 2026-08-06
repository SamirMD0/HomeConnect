import { BundledMigration } from './migration-runner';

/**
 * Evidence for "is this migration's schema already in the database?".
 *
 * Marking a migration as applied without running it is only safe when the objects
 * it creates are already there. The admin knows that because they ran the repair
 * by hand, but "the admin said so" is a weak gate for something that can hide a
 * genuinely missing table forever. So the objects a migration declares are
 * extracted from its SQL and checked directly.
 *
 * This is deliberately a *veto*, not an oracle. PRESENT and UNKNOWN both defer to
 * the admin; only MISSING blocks, because a named table or column that should
 * exist and does not is hard evidence the migration never ran.
 */

export type PresenceVerdict = 'PRESENT' | 'MISSING' | 'UNKNOWN';

export interface MigrationPresence {
  verdict: PresenceVerdict;
  /** Objects the migration creates, as `kind:identifier`. */
  expected: string[];
  /** Subset of `expected` that is not in the database. */
  missing: string[];
  reason: string;
}

export interface SchemaObjects {
  tables: Set<string>;
  columns: Set<string>;
  types: Set<string>;
  indexes: Set<string>;
  enumValues: Set<string>;
  extensions: Set<string>;
}

export interface PresenceClient {
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
}

/** Quoted or bare. Postgres folds unquoted identifiers to lower case, so `unquote` does too. */
const IDENT = String.raw`("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const SCHEMA = String.raw`(?:(?:"public"|public)\.)?`;

function unquote(raw: string): string {
  return raw.startsWith('"') ? raw.slice(1, -1) : raw.toLowerCase();
}

const CREATE_TABLE = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${SCHEMA}${IDENT}`, 'gi');
const ADD_COLUMN = new RegExp(
  String.raw`ALTER\s+TABLE\s+(?:ONLY\s+)?${SCHEMA}${IDENT}\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`,
  'gi'
);
const CREATE_TYPE = new RegExp(String.raw`CREATE\s+TYPE\s+${SCHEMA}${IDENT}`, 'gi');
const CREATE_INDEX = new RegExp(
  String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?${SCHEMA}${IDENT}`,
  'gi'
);
const ADD_ENUM_VALUE = new RegExp(
  String.raw`ALTER\s+TYPE\s+${SCHEMA}${IDENT}\s+ADD\s+VALUE\s+(?:IF\s+NOT\s+EXISTS\s+)?'([^']+)'`,
  'gi'
);
const CREATE_EXTENSION = new RegExp(String.raw`CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?${IDENT}`, 'gi');

/** Anything that removes or renames makes "already present" meaningless. */
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|TYPE|INDEX|CONSTRAINT)|RENAME\s+(TO|COLUMN))\b/i;

function matchAll(sql: string, pattern: RegExp, build: (match: RegExpExecArray) => string): string[] {
  const found: string[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(sql);
  while (match) {
    found.push(build(match));
    match = pattern.exec(sql);
  }
  return found;
}

/**
 * Extracts the objects a migration creates. Pure, so the parsing can be tested
 * against real migration files without a database.
 */
export function expectedObjects(sql: string): string[] {
  const stripped = sql.replace(/--[^\n]*/g, '');
  return [
    ...matchAll(stripped, CREATE_TABLE, (m) => `table:${unquote(m[1])}`),
    ...matchAll(stripped, ADD_COLUMN, (m) => `column:${unquote(m[1])}.${unquote(m[2])}`),
    ...matchAll(stripped, CREATE_TYPE, (m) => `type:${unquote(m[1])}`),
    ...matchAll(stripped, CREATE_INDEX, (m) => `index:${unquote(m[1])}`),
    ...matchAll(stripped, ADD_ENUM_VALUE, (m) => `enum:${unquote(m[1])}.${m[2]}`),
    ...matchAll(stripped, CREATE_EXTENSION, (m) => `extension:${unquote(m[1])}`),
  ].filter((value, index, all) => all.indexOf(value) === index);
}

export function classifyPresence(migration: BundledMigration, schema: SchemaObjects): MigrationPresence {
  if (DESTRUCTIVE.test(migration.sql.replace(/--[^\n]*/g, ''))) {
    return {
      verdict: 'UNKNOWN',
      expected: [],
      missing: [],
      reason: 'This update drops or renames something, so its result cannot be detected. Review it before resolving.',
    };
  }

  const expected = expectedObjects(migration.sql);
  if (expected.length === 0) {
    return {
      verdict: 'UNKNOWN',
      expected,
      missing: [],
      reason: 'No table, column, type or index could be detected in this update, so it cannot be checked automatically.',
    };
  }

  const missing = expected.filter((object) => !hasObject(object, schema));
  if (missing.length > 0) {
    return {
      verdict: 'MISSING',
      expected,
      missing,
      reason: `The database is missing ${missing.length} of ${expected.length} items this update creates.`,
    };
  }

  return {
    verdict: 'PRESENT',
    expected,
    missing: [],
    reason: `All ${expected.length} items this update creates are already in the database.`,
  };
}

function hasObject(object: string, schema: SchemaObjects): boolean {
  const [kind, ...rest] = object.split(':');
  const identifier = rest.join(':');
  if (kind === 'table') return schema.tables.has(identifier);
  if (kind === 'column') return schema.columns.has(identifier);
  if (kind === 'type') return schema.types.has(identifier);
  if (kind === 'index') return schema.indexes.has(identifier);
  if (kind === 'enum') return schema.enumValues.has(identifier);
  if (kind === 'extension') return schema.extensions.has(identifier);
  return false;
}

/** One round trip for the whole public schema, rather than a query per object. */
export async function readSchemaObjects(client: PresenceClient): Promise<SchemaObjects> {
  const [columns, types, indexes, enumValues, extensions] = await Promise.all([
    client.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
    ),
    client.$queryRawUnsafe<Array<{ typname: string }>>(
      `SELECT t.typname FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'`
    ),
    client.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`
    ),
    client.$queryRawUnsafe<Array<{ typname: string; enumlabel: string }>>(
      `SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid`
    ),
    client.$queryRawUnsafe<Array<{ extname: string }>>(`SELECT extname FROM pg_extension`),
  ]);

  return {
    tables: new Set(columns.map((row) => row.table_name)),
    columns: new Set(columns.map((row) => `${row.table_name}.${row.column_name}`)),
    types: new Set(types.map((row) => row.typname)),
    indexes: new Set(indexes.map((row) => row.indexname)),
    enumValues: new Set(enumValues.map((row) => `${row.typname}.${row.enumlabel}`)),
    extensions: new Set(extensions.map((row) => row.extname)),
  };
}
