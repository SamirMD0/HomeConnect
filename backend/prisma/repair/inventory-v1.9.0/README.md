# Inventory v1.9.0 report-only helpers

These PostgreSQL scripts inspect document-linked sales stock movements. They never repair,
insert, update, or delete data and are not registered in `manifest.json`.

Run `01_document_link_preflight_report.sql` before enabling the workflow to understand which
existing order lines are eligible. Run `02_fulfillment_reconciliation_check.sql` after testing
deduction and restoration. Every result set should be reviewed; any row returned by a section
labelled `FAULT` requires investigation before release.

Business dates use `Asia/Beirut`, matching HomeConnect's default business timezone.

## Report-only correction, CP-1918C (2026-08-14)

`01_document_link_preflight_report.sql` converted `stock_movements."createdAt"` to a business date
with the one-step `("createdAt" AT TIME ZONE 'Asia/Beirut')::date`. That column is `timestamp
without time zone` holding UTC, so the one-step form round-trips back to the stored UTC value and
yields the UTC date. Both occurrences now use the two-step form the application itself uses:

```sql
("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Beirut')::date
```

The old form disagreed with the application for opening counts recorded after 21:00 UTC. Verified
on a scratch database: with an opening count at 22:30 UTC and an order dated that same UTC day,
the old form reported `ordersPredatingOpeningCount = 0` while the application already treated the
order as predating its opening count and refused to deduct it.

This changed report output only. No application code, migration, schema, or stored data was
touched, and the file remains `SELECT`-only. If you kept output from an earlier run of this
report, re-run it — a previous clean reading is not proof against the corrected query.
