# Business-PC repair SQL

Hand-written, idempotent recovery SQL used to bring a business PC's database
back in line with a release when a Prisma migration could not be applied there.

**Every file in this folder was actually run on a business PC.** None is
superseded or redundant — where two look like near-duplicates (for example the
`1.1.0` and `1.1.1` product-image repairs), both were genuinely applied, to
different machines or at different times. Do not prune them.

## Naming

```
<version>-<repair|upgrade>-<what-it-fixes>.sql
```

`<version>` is the release the file was **authored for**, not necessarily the
release a given PC was on when it ran. A PC upgrading across several versions
may still need an older file.

## Provenance

These were recovered from `release/<version>/` on 2026-08-04. That directory is
gitignored, so the copies here are the only durable record — the originals were
one disk failure from being lost. `release/` still holds the originals; this
folder is the authority.

Verified byte-identical to their sources at copy time (SHA-256).

## Rules

- Files are **idempotent** (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS`) and safe to
  re-run. That is what makes it acceptable to apply one without knowing for
  certain whether it already ran.
- Never edit a file that has shipped. Write a new one for the next version.
- No `DROP` / `TRUNCATE` / `DELETE` / `ALTER COLUMN … TYPE`.
- Run against a backed-up database, as a PostgreSQL superuser, with
  `ON_ERROR_STOP=1`. Each file's header states its own preconditions.

See `claude/plans/you-are-working-in-pure-horizon.md` for the planned in-app
runner that will eventually apply these automatically instead of by hand.
