/**
 * Splits a repair or migration file into individual SQL statements.
 *
 * This is the riskiest primitive in the maintenance feature: everything that
 * executes SQL depends on it cutting in the right places. A naive `split(';')`
 * would tear apart `DO $$ … END $$;` blocks — which is what the house repair
 * files are almost entirely made of — and would also cut inside string literals
 * and comments.
 *
 * The walker therefore understands every PostgreSQL construct in which a
 * semicolon is *not* a statement terminator:
 *   - `-- line comments`
 *   - `/* block comments *\/`, which nest in PostgreSQL
 *   - `'string literals'` with `''` escapes, and `E'…'` with backslash escapes
 *   - `"quoted identifiers"` with `""` escapes
 *   - `$$ … $$` and `$tag$ … $tag$` dollar-quoted bodies
 */

type SegmentKind = 'CODE' | 'LINE_COMMENT' | 'BLOCK_COMMENT' | 'STRING' | 'IDENTIFIER' | 'DOLLAR';

interface Segment {
  kind: SegmentKind;
  start: number;
  /** Exclusive. */
  end: number;
}

/**
 * Walks the text once and labels every region. Both the splitter and the safety
 * scanner read from this, so they can never disagree about what is code and
 * what is a comment or a literal.
 */
export function segmentSql(sql: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;
  let codeStart = 0;

  const closeCode = (at: number) => {
    if (at > codeStart) segments.push({ kind: 'CODE', start: codeStart, end: at });
  };

  while (index < sql.length) {
    const rest = sql.slice(index);

    if (rest.startsWith('--')) {
      closeCode(index);
      const newline = sql.indexOf('\n', index);
      const end = newline === -1 ? sql.length : newline;
      segments.push({ kind: 'LINE_COMMENT', start: index, end });
      index = end;
      codeStart = index;
      continue;
    }

    if (rest.startsWith('/*')) {
      closeCode(index);
      const end = blockCommentEnd(sql, index);
      segments.push({ kind: 'BLOCK_COMMENT', start: index, end });
      index = end;
      codeStart = index;
      continue;
    }

    const dollarTag = dollarTagAt(sql, index);
    if (dollarTag !== null) {
      closeCode(index);
      const bodyStart = index + dollarTag.length;
      const closing = sql.indexOf(dollarTag, bodyStart);
      // An unterminated body runs to EOF rather than throwing: the caller's
      // checksum and the database will both reject a truncated file anyway.
      const end = closing === -1 ? sql.length : closing + dollarTag.length;
      segments.push({ kind: 'DOLLAR', start: index, end });
      index = end;
      codeStart = index;
      continue;
    }

    if (rest[0] === "'" || rest[0] === '"') {
      closeCode(index);
      const quote = rest[0];
      // E'…' enables backslash escapes; the preceding E was consumed as code.
      const escapes = quote === "'" && /[Ee]$/.test(sql.slice(Math.max(0, index - 1), index));
      const end = quotedEnd(sql, index, quote, escapes);
      segments.push({ kind: quote === "'" ? 'STRING' : 'IDENTIFIER', start: index, end });
      index = end;
      codeStart = index;
      continue;
    }

    index += 1;
  }

  closeCode(sql.length);
  return segments;
}

/** Splits into executable statements, dropping empties and comment-only trailers. */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;

  for (const segment of segmentSql(sql)) {
    if (segment.kind !== 'CODE') continue;
    for (let index = segment.start; index < segment.end; index += 1) {
      if (sql[index] !== ';') continue;
      pushStatement(statements, sql.slice(start, index));
      start = index + 1;
    }
  }

  pushStatement(statements, sql.slice(start));
  return statements;
}

/**
 * Blanks comments and literal bodies so the safety scanner can look at SQL
 * keywords without being fooled by `'WORKSHOP_DROP_OFF'` or by a header comment
 * that reads "no DROP, TRUNCATE, DELETE" — both of which occur in real repair
 * files today. Quoted identifiers are kept, since table names are worth seeing.
 */
export function stripSqlNoise(sql: string): string {
  let output = '';

  for (const segment of segmentSql(sql)) {
    const text = sql.slice(segment.start, segment.end);
    switch (segment.kind) {
      case 'CODE':
      case 'IDENTIFIER':
        output += text;
        break;
      case 'STRING':
        output += "''";
        break;
      case 'DOLLAR':
        // Keep the body: repair logic lives inside DO $$ … $$ blocks and must
        // still be scanned. Only the delimiters are dropped.
        output += ` ${stripSqlNoise(dollarBody(text))} `;
        break;
      default:
        // Comments collapse to whitespace so tokens on either side stay apart.
        output += text.replace(/[^\n]/g, ' ');
        break;
    }
  }

  return output;
}

/**
 * Returns the inside of a `DO $$ … $$` block, so the safety scanner can look at
 * the statements within it. Repair logic lives almost entirely inside these
 * blocks, and destructive SQL hidden in one must not slip past.
 */
export function doBlockBody(statement: string): string | null {
  if (!/^\s*DO\b/i.test(stripSqlNoise(statement))) return null;
  for (const segment of segmentSql(statement)) {
    if (segment.kind === 'DOLLAR') return dollarBody(statement.slice(segment.start, segment.end));
  }
  return null;
}

function pushStatement(statements: string[], raw: string): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  // A trailing chunk of pure comment is not a statement.
  if (!stripSqlNoise(trimmed).trim()) return;
  statements.push(trimmed);
}

/** PostgreSQL block comments nest, so this counts depth rather than stopping at the first closing marker. */
function blockCommentEnd(sql: string, from: number): number {
  let depth = 0;
  let index = from;
  while (index < sql.length) {
    if (sql.startsWith('/*', index)) { depth += 1; index += 2; continue; }
    if (sql.startsWith('*/', index)) {
      depth -= 1;
      index += 2;
      if (depth === 0) return index;
      continue;
    }
    index += 1;
  }
  return sql.length;
}

function quotedEnd(sql: string, from: number, quote: string, backslashEscapes: boolean): number {
  let index = from + 1;
  while (index < sql.length) {
    const char = sql[index];
    if (backslashEscapes && char === '\\') { index += 2; continue; }
    if (char === quote) {
      if (sql[index + 1] === quote) { index += 2; continue; }  // doubled = literal quote
      return index + 1;
    }
    index += 1;
  }
  return sql.length;
}

/** Returns `$$` or `$tag$` when one opens at `index`, else null. `$1` is a parameter, not a tag. */
function dollarTagAt(sql: string, index: number): string | null {
  if (sql[index] !== '$') return null;
  const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index));
  return match ? match[0] : null;
}

function dollarBody(text: string): string {
  const tag = dollarTagAt(text, 0);
  if (!tag) return text;
  const body = text.slice(tag.length);
  return body.endsWith(tag) ? body.slice(0, -tag.length) : body;
}
