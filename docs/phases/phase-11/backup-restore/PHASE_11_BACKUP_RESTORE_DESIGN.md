# Phase 11 Backup And Restore Design

Date: 2026-07-25

## Scope

Phase 11 adds local PostgreSQL backup and restore controls for the single-PC desktop deployment.

Implemented scope:

- manual backup
- backup settings
- automatic backup scheduler
- startup catch-up policy
- retention for automatic backups
- backup listing
- archive verification
- restore validation
- pre-restore safety backup
- restore execution path
- maintenance write blocking during restore
- Electron folder selection IPC
- Settings UI

No cloud backup or sync is included.

## Backup Format

Backups use PostgreSQL custom format:

```text
pg_dump --format=custom
```

Backup files use:

```text
.backup
```

The implementation does not copy PostgreSQL internal data-directory files.

## Storage Strategy

Default backup folder:

```text
%USERPROFILE%\Documents\HomeConnect Backups
```

Settings are stored outside the database under the user application data folder. Backup metadata is stored as a sidecar file in the configured backup folder:

```text
.homeconnect-backups.json
```

This avoids a database backup-history table because database-stored history can disappear after restoring an older backup.

## Folder Safety

The backend validates backup folders and backup paths.

Rejected locations include:

- project repository
- `node_modules`
- temporary directories
- relative paths
- paths escaping the configured backup folder

The renderer does not receive general filesystem access. Electron exposes only:

- `selectBackupDirectory`
- `openBackupDirectory`

## PostgreSQL Tool Discovery

Tool discovery order:

1. configured path in backup settings
2. environment override such as `PG_DUMP_PATH`
3. PATH entries
4. common Windows PostgreSQL install folders such as `C:\Program Files\PostgreSQL\<version>\bin`

Required tools:

- `pg_dump`
- `pg_restore`

If tools cannot be found, backup/restore fails safely with a clear API error. There is no unsafe fallback.

## Command Safety

Commands use `spawn` with argument arrays and `shell: false`.

The database password is passed through `PGPASSWORD` in the child environment and is not included in command arguments.

The service captures:

- exit code
- stderr summary
- duration
- file existence
- file size
- checksum
- archive readability via `pg_restore --list`

Incomplete backup files are removed after failures.

## Naming

Backup names are deterministic and sortable:

```text
homeconnect-YYYY-MM-DD-HHMMSS-manual.backup
homeconnect-YYYY-MM-DD-HHMMSS-auto.backup
homeconnect-YYYY-MM-DD-HHMMSS-pre-restore.backup
```

Timestamp formatting uses the configured business timezone, defaulting to `Asia/Beirut`.

## Verification

After backup:

- file must exist
- file size must be greater than zero
- extension must be `.backup`
- SHA-256 checksum is generated
- `pg_restore --list` must succeed

Before restore:

- archive is revalidated
- checksum is compared if metadata exists
- application version must match

Initial compatibility policy is conservative: only restore backups created by the same application version.

## Restore Flow

Restore uses a deliberate backend flow:

1. validate selected archive
2. enter restore maintenance mode
3. create verified `PRE_RESTORE` safety backup
4. disconnect Prisma
5. run `pg_restore --clean --if-exists --no-owner --no-privileges`
6. reconnect Prisma
7. verify core tables can be queried
8. record restored status
9. exit maintenance mode

The restore UI requires typed confirmation:

```text
RESTORE
```

## Maintenance Mode

During restore, financial and customer writes are blocked by backend middleware with `503 MAINTENANCE_MODE`.

Backup API routes remain available so the restore request itself can complete.

Status values:

- `NORMAL`
- `BACKUP_IN_PROGRESS`
- `RESTORE_IN_PROGRESS`
- `RESTART_REQUIRED`
- `FAILED`

## Automatic Backups

Settings:

- enabled
- daily time
- retention count
- backup folder

Default:

- enabled
- `02:00`
- retain 30 automatic backups

Startup catch-up:

- if automatic backups are enabled and the last automatic backup is more than 24 hours old, a catch-up backup is scheduled after startup
- repeated catch-up runs during the same process are avoided

## Retention

Retention applies only to `AUTO` backups.

Manual and pre-restore backups are not deleted by automatic retention.

The service deletes oldest eligible automatic backups after the configured keep count and records deleted metadata.

## Security

All backup APIs require `ADMIN`.

The UI hides controls from non-admin users, but backend authorization is authoritative.

The API does not return absolute internal backup paths.

Logs do not include database passwords or connection strings.

## Test Strategy

Automated tests cover:

- path containment and traversal rejection
- repository-folder rejection
- filename generation
- command argument safety
- password not present in visible args
- `pg_restore --list` validation args
- operation lock behavior
- startup catch-up decision
- admin-only API access
- typed restore confirmation
- frontend API wrappers
- frontend admin/non-admin Settings behavior

Real `pg_dump` / `pg_restore` integration must be run only against isolated temporary databases and temporary folders.
