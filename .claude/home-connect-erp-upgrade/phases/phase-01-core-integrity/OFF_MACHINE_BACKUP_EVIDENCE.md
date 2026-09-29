# Off-Machine Backup Evidence

Date: 2026-09-04

## Status

**NOT YET PERFORMED — BLOCKED ON OWNER**

No claim is made that a current backup exists on separate physical media.

## Evidence required from the owner

1. Create a fresh manual backup from Settings → Backup and Restore.
2. Record the source file name, completion timestamp, size, and SHA-256 checksum.
3. Copy the file to media that is physically separate from the business PC (external drive, another machine/network share, or approved cloud storage).
4. Recompute SHA-256 at the destination and confirm it equals the source checksum.
5. Run `pg_restore --list` against the destination copy and retain the successful output.
6. Record the destination class and custodian without publishing credentials or sensitive paths.

| Evidence | Value |
|---|---|
| Backup file and timestamp | NOT YET PERFORMED — BLOCKED ON OWNER |
| Source size and SHA-256 | NOT YET PERFORMED — BLOCKED ON OWNER |
| Off-machine destination class | NOT YET PERFORMED — BLOCKED ON OWNER |
| Destination SHA-256 match | NOT YET PERFORMED — BLOCKED ON OWNER |
| Destination archive readable | NOT YET PERFORMED — BLOCKED ON OWNER |
| Owner/operator confirmation | NOT YET PERFORMED — BLOCKED ON OWNER |

Related risk: `R-15` in `RISK_REGISTER.md`.

