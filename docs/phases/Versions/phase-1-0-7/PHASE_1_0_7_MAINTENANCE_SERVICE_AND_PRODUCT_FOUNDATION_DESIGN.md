# HomeConnect v1.0.7 Maintenance Service And Product Foundation Design

## Scope

v1.0.7 adds product identity and maintenance/service job tracking. It does not add inventory, stock, POS, suppliers as entities, attachments, or automatic financial debt creation.

## Product Foundation

`Product` stores required name/model, optional barcode/brand/price/absolute discount/notes, active state, creator/updater, and timestamps. Barcode is unique when present. Products are archived instead of deleted.

## Service Job

Every job references an existing non-deleted customer. Product intake uses exactly one mode: a linked active Product or manual product text. Jobs carry request type, issue/part details, routing, warranty, informational prices, business dates, lifecycle status, cancellation data, and actor metadata.

Job numbers use `SV-YYYY-NNNN`. Terminal jobs must be reopened rather than directly moved to an active status. Business dates must remain chronological, and future dates are rejected except scheduled home visits and warranty expiry.

## Security And Audit

Routine creation and forward workflow changes are available to authenticated staff. Sensitive details, backward/terminal transitions, cancellation, reopening, and product archive/restore require ADMIN role, the caller's account password, and a reason. Passwords are redacted and never stored in service audit rows.

`ServiceAudit` is append-only and stores actor snapshots, reason, changed before/after fields, request ID, IP address, and timestamp. Password verification, mutation, and audit execute in one database transaction.

## Frontend

The Service workspace provides a responsive list, URL-backed filters, linked/manual product intake, details/timeline view, status and correction dialogs, customer-profile history, dashboard summary cards, and a 50mm x 30mm CODE128 label print view.
