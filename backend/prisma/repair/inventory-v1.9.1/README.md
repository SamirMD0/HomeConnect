# Inventory v1.9.1 — Supplier receiving report-only SQL

**These are report-only helper scripts, not applied repair history.**

Everything else in `backend/prisma/repair/` that appears in `manifest.json` is a repair that was
actually run against a business PC. **The two files here are deliberately NOT in that manifest**,
and can never qualify: they only read. This matches the `inventory-v1.8.0/` and
`inventory-v1.9.0/` folders.

## The files

| File | Purpose | Writes data? | Needs the v1.9.1 tables? |
|---|---|---|---|
| `01_supplier_receiving_preflight_report.sql` | Is this database safe to carry v1.9.1, and is any receiving data already present consistent? | **No** — `SELECT` / `WITH` only. | Sections A and B: no. Section C: yes. |
| `02_supplier_receiving_reconciliation_report.sql` | Do documents, lines, `PURCHASE_RECEIPT` movements and product stock agree? | **No** — `SELECT` / `WITH` only. | Yes. |

Neither file contains `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, or `CREATE`.
There is no backfill, no data repair, and no migration execution. They are safe to run as often
as you like.

## Where to run them

**On a restored backup or a scratch database. Never as a rehearsal against the live business
database.** Restore a backup, prove the restore works, and run these against that copy.

Reading is harmless, so running them against production to investigate a live problem is not
dangerous — but a release rehearsal must happen on a copy, because the point is to find out what
the upgrade will do before it does it.

## Which script runs when

```
                                    BEFORE v1.9.1 migration     AFTER v1.9.1 migration
  01 sections A + B                          yes                        yes
  01 section C                               no  (no tables)            yes
  02 reconciliation                          no  (no tables)            yes
```

Sections A and B of file `01` deliberately never mention the two new tables, so the useful half
of the preflight still runs on a pre-upgrade backup. Section A answers "do the tables exist yet",
using `to_regclass`, which returns null instead of raising when a table is absent.

If you run section C too early, PostgreSQL reports `relation "supplier_receivings" does not
exist`. **That is the expected outcome of running it too early, not a fault.** Sections A and B
have already printed their results by then. This is the same split v1.8.0 used when it moved its
`stock_movements` section out of the preflight and into the reconciliation check.

## Expected clean result

On a **freshly migrated backup**, before anyone has received anything:

- `01` section A — A1 through A5 all `OK`; A6 exactly one row with a non-null `finished_at`.
- `01` section B — every `BLOCKER` row shows `0`. `B1` should be `0`: no code path wrote
  `PURCHASE_RECEIPT` before v1.9.1. `B2` may be any number.
- `01` section C — `C01`, `C02`, `C03` all `0`, because the migration creates no history.
  Every other row `0`.
- `01` section C2 — zero rows from `C2a` and `C2b`.
- `02` section 1 — every row `0`.
- `02` sections 2 through 5 — zero rows.
- `02` section 6 — `0`.

On a **pre-upgrade backup**, `A1`, `A2` and `A6` reading `WARNING` is the correct answer, not a
problem. It means "not migrated yet", which is exactly what a pre-upgrade backup should say.

## Warnings versus blockers

**`WARNING` means look, decide, and write down the decision.** It does not stop the release.

- `B1` pre-existing `PURCHASE_RECEIPT` movements — only possible if something wrote them outside
  the application. They will show up as orphans in `02`.
- `B2` tracked products with no opening count — the onboarding work queue. Expected, and
  deliberately not a failure. If un-onboarded products were reported as faults on day one,
  everyone would learn to ignore this report.
- `C12` lines on products that no longer track stock — the historical movement stays valid;
  find out why tracking was turned off.
- `C15` / `C2c` duplicate supplier and reference pairs — **warning only, by design.** Suppliers
  reuse and omit invoice numbers, and a second delivery under one reference is legitimate. The
  database deliberately has no uniqueness rule on `referenceNumber`. Read each pair and confirm
  it is a real second delivery rather than the same delivery entered twice. Note that documents
  with **no supplier** are grouped together and are included, so double-entered cash purchases
  are caught here too.
- `R08` documents dated in the future — the service rejects future dates, so this usually means
  a wrong clock on the machine that wrote the row.

**`BLOCKER` means do not install v1.9.1 until it is understood.** Every blocker in these files
describes something the application makes impossible, so a non-zero count means a write reached
the database without going through the service layer. The two that matter most:

- `C13` / `C14` / `R09` — a receipt on a product with no opening count, or dated before it.
  Both mean stock is being counted twice. This is the exact fault the date guard exists to
  prevent.
- `R06` / `S3` — a `PURCHASE_RECEIPT` movement with no receiving line. Stock rose with no
  document explaining why.

## What to do if blockers appear

1. **Stop.** Do not install v1.9.1 on the business PC.
2. Re-run both files and keep the full output. The detail sections (`C2a`, `C2b`, `S3`, `S4`)
   name the exact rows.
3. Confirm you are reading a **restored copy**, not a half-finished migration rehearsal. A
   half-applied migration produces its own distinctive pattern: `A1` and `A2` disagreeing, or
   `A4`/`A5` short of 3 and 2.
4. Work out how the row was written. Every blocker here is unreachable through the application,
   so the answer is always outside it: direct SQL, a restore from a different schema version, or
   an interrupted migration.
5. Fix the cause on the copy, re-run until clean, then start the upgrade rehearsal again from a
   fresh restore.

Do not "fix" the data by editing rows in these files. They read, and they must stay that way. A
correction to real receiving data is a compensating stock movement made in the application, not
an `UPDATE`.

## What supplier receiving does not do

Worth stating plainly, because these reports sit in a folder next to financial repairs:

- **Receiving does not create supplier debt or payment.** A receiving document may name a
  supplier, but it writes nothing to `supplier_transactions` and changes no supplier balance.
  Receiving goods and owing money for them are two separate facts, recorded on two separate
  screens, by two separate deliberate acts. Section 6 of file `02` checks for exactly this
  coupling appearing by accident.
- **Supplier debt does not create stock.** `supplier_transactions` carries no product and no
  quantity, so it cannot.
- **Receiving documents are immutable in v1.9.1.** There is no edit and no delete endpoint. A
  mistake is corrected the way v1.8.0 prescribes: a compensating `DAMAGE_LOSS`, `MANUAL_REMOVE`,
  or `STOCK_COUNT` movement, each keeping its ADMIN and account-password guard.
- **Reversal is not included in v1.9.1.** Unlike a sales deduction, an incorrect receipt blocks
  nothing downstream, so refusing reversal creates no deadlock. If reversal is added later, the
  v1.9.0 fulfillment design is the template.
- No COGS, valuation, FIFO, weighted average, margin, or profit is computed anywhere. These
  reports never multiply a quantity by `costPrice`, and neither does the application.

## Business dates: why the conversion looks long-winded

`stock_movements."createdAt"` is `timestamp without time zone`, and Prisma stores **UTC** in it.
The application converts it to a business date with `Intl` in the `Asia/Beirut` zone. The
faithful SQL equivalent is therefore:

```sql
("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
```

The shorter `("createdAt" AT TIME ZONE 'Asia/Beirut')::date` is **not** equivalent. With the
session timezone set to `Asia/Beirut` it round-trips back to the stored UTC wall value, so it
yields the UTC date. The two disagree for anything recorded after 21:00 UTC, where the Beirut
date is already the following day:

| stored UTC value | short form | correct form |
|---|---|---|
| `2026-08-14 22:30` | `2026-08-14` | `2026-08-15` |
| `2026-08-14 11:30` | `2026-08-14` | `2026-08-14` |
| `2026-01-14 22:30` | `2026-01-14` | `2026-01-15` |

Using the short form would make these reports disagree with the application about exactly the
late-evening opening counts the date guard exists to protect — raising false blockers, or worse,
hiding real ones. Both files here use the long form.

`inventory-v1.9.0/01_document_link_preflight_report.sql` previously used the short form and
therefore reported the UTC date for opening counts. **That was corrected in CP-1918C**; both
occurrences now use the two-step form, and the file carries a header note explaining the change.

The correction mattered more than a one-day rounding sounds. The report was not merely imprecise,
it disagreed with the application in the unsafe direction: for an opening count recorded at 22:30
UTC and an order dated that same UTC day, the old form reported `ordersPredatingOpeningCount = 0`
while the application already refused to deduct that order as `PREDATES_OPENING_COUNT`. A clean
preflight followed by a blocked deduction is exactly the failure mode a preflight exists to
prevent.

## Note on IDE warnings

These are **PostgreSQL** scripts. An editor configured for T-SQL will flag valid Postgres syntax
as errors — `COUNT(*) FILTER (WHERE …)`, `array_agg(… ORDER BY …)`, `::regclass`, `to_regclass`,
`JOIN LATERAL`, and `FULL OUTER JOIN` are all correct here. Verify against PostgreSQL, not
against the editor's default dialect.

## Status

Written and validated during CP-1918B on 2026-08-14. Both files were executed end to end against
a disposable scratch database (`homeconnect_rehearsal`) with the v1.9.1 migration applied: every
statement ran, and every check returned `OK` on empty data.

The checks were then proved to actually fire, rather than merely to run, by seeding a healthy
receiving document alongside four deliberate faults — a backdated document, a duplicate
supplier/reference pair, an orphan `PURCHASE_RECEIPT` movement, and an inconsistent product
ledger. `C14`, `C15`, `R06`, `R09` and `R11` each reported the expected count, and the detail
sections named the offending rows. The seeded data was then removed from the scratch database.

No business-PC database was touched, and the configured `homeconnect` database was not written
to at any point.
