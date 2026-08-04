import { describe, expect, it } from 'vitest';
import { splitSqlStatements, stripSqlNoise } from './sql-statement-splitter';

describe('sql statement splitter', () => {
  it('splits plain statements on semicolons', () => {
    expect(splitSqlStatements('SELECT 1; SELECT 2;')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('tolerates a missing trailing semicolon', () => {
    expect(splitSqlStatements('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('keeps a DO $$ … $$ block whole despite the semicolons inside it', () => {
    const sql = `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kind') THEN
          CREATE TYPE "kind" AS ENUM ('A', 'B');
        END IF;
      END $$;
      SELECT 1;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TYPE');
    expect(statements[0]).toContain('END $$');
    expect(statements[1]).toBe('SELECT 1');
  });

  it('handles tagged dollar quotes and nested dollar quoting', () => {
    const sql = `DO $outer$ BEGIN EXECUTE $inner$ SELECT ';' $inner$; END $outer$;`;
    expect(splitSqlStatements(sql)).toHaveLength(1);
  });

  // Statements keep any comment attached to them. Comments are harmless to
  // execute and preserving them keeps error messages traceable to the file, so
  // the splitter does not try to strip them.
  it('ignores semicolons in line and block comments', () => {
    const sql = `
      -- a comment with ; inside
      SELECT 1;
      /* another ; comment */
      SELECT 2;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('SELECT 1');
    expect(statements[1]).toContain('SELECT 2');
  });

  it('handles nested block comments, which PostgreSQL allows', () => {
    const sql = `/* outer /* inner ; */ still comment ; */ SELECT 1;`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('SELECT 1');
  });

  it('ignores semicolons inside string literals and quoted identifiers', () => {
    expect(splitSqlStatements(`INSERT INTO t VALUES ('a;b'); SELECT 1;`)).toHaveLength(2);
    expect(splitSqlStatements(`SELECT "we;ird" FROM t; SELECT 1;`)).toHaveLength(2);
  });

  it('understands doubled-quote escapes', () => {
    expect(splitSqlStatements(`SELECT 'it''s; fine'; SELECT 1;`)).toEqual([`SELECT 'it''s; fine'`, 'SELECT 1']);
  });

  it('understands backslash escapes in E-strings', () => {
    expect(splitSqlStatements(`SELECT E'a\\'; b'; SELECT 1;`)).toHaveLength(2);
  });

  it('drops empty statements and comment-only trailers', () => {
    expect(splitSqlStatements('SELECT 1;;\n-- trailing comment\n')).toEqual(['SELECT 1']);
    expect(splitSqlStatements('   \n\n  ')).toEqual([]);
    expect(splitSqlStatements('-- only a comment')).toEqual([]);
  });

  it('does not mistake a positional parameter for a dollar quote', () => {
    expect(splitSqlStatements('SELECT $1; SELECT $2;')).toEqual(['SELECT $1', 'SELECT $2']);
  });
});

describe('sql noise stripping', () => {
  it('blanks string bodies so keywords inside them are invisible', () => {
    expect(stripSqlNoise(`SELECT 'WORKSHOP_DROP_OFF'`)).not.toContain('DROP');
  });

  it('blanks comments but preserves line structure', () => {
    const stripped = stripSqlNoise('-- No DROP, TRUNCATE, DELETE\nSELECT 1;');
    expect(stripped).not.toContain('DROP');
    expect(stripped).toContain('SELECT 1');
  });

  it('keeps quoted identifiers, which name real tables', () => {
    expect(stripSqlNoise('ALTER TABLE "products" ADD COLUMN "sku" TEXT')).toContain('"products"');
  });

  it('still scans the inside of a DO block', () => {
    expect(stripSqlNoise('DO $$ BEGIN DROP TABLE x; END $$;')).toContain('DROP TABLE');
  });
});
