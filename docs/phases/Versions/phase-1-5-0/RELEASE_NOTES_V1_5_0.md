# HomeConnect v1.5.0 Release Notes

## Maintenance and pricing reliability

Version 1.5.0 is a stability release. It fixes a server error in the pricing calculator and lets Maintenance recognise database updates that were applied by hand.

### Fixed

- **The pricing calculator returned a server error instead of a validation message.** Leaving the cost price blank, or entering a percentage that was not a number, produced HTTP 500 rather than the normal "check this field" message. Valid calculations were never affected, and no stored figure was ever wrong.
- The same fault was corrected in the pricing preset percentage fields and in the product cost and percentage fields, where malformed input could escape validation the same way.

### Added

- **Settings → Maintenance → "Already updated by hand? / تم التحديث يدوياً؟"** — records database updates that were applied with a release repair script, so the application stops treating them as outstanding.
- Each outstanding update is listed with evidence of whether its tables, columns, types, indexes, enum values, and extensions are already in the database: **In database**, **Not in database**, or **Cannot check**.
- An update the database is genuinely missing cannot be recorded, so the action cannot hide a real gap.
- Requires the administrator account password and a typed `RESOLVE` confirmation, and every entry is written to the repair history with the administrator's name.

### Why this matters

On a database that was repaired manually, Prisma migration history never learned about the work. "Apply pending updates" then failed on the first update trying to re-create a table that already existed, and because repairs run after updates, it never reached them — leaving the in-app maintenance flow unusable and every future fix a manual one. Recording the hand-applied updates clears that history so the normal flow works again.

### Compatibility

- No schema change and no migration ship with this release.
- No business data is modified. Recording an update writes only migration-history bookkeeping rows; none of the update's own SQL is executed.
- No backup is taken for the record action, because it runs no schema changes. It still takes the maintenance lock, so it cannot overlap a backup, restore, or repair.
- Existing pricing results are unchanged. Only invalid input behaves differently, returning a validation message instead of a server error.

### Database

No migration is required for v1.5.0. Databases already up to date need no action.

If this machine was repaired by hand in the past and Maintenance still lists outstanding updates, open Settings → Maintenance, review the evidence beside each entry, and record the ones marked **In database**. Entries marked **Cannot check** are for data-only or generated-column updates that cannot be detected automatically; record them only if you know the matching repair script was applied.

Never use `prisma migrate reset` on business data.
