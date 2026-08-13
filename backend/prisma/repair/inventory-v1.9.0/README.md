# Inventory v1.9.0 report-only helpers

These PostgreSQL scripts inspect document-linked sales stock movements. They never repair,
insert, update, or delete data and are not registered in `manifest.json`.

Run `01_document_link_preflight_report.sql` before enabling the workflow to understand which
existing order lines are eligible. Run `02_fulfillment_reconciliation_check.sql` after testing
deduction and restoration. Every result set should be reviewed; any row returned by a section
labelled `FAULT` requires investigation before release.

Business dates use `Asia/Beirut`, matching HomeConnect's default business timezone.
