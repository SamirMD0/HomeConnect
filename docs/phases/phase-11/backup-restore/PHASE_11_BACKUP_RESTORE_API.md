# Phase 11 Backup And Restore API

Date: 2026-07-25

All endpoints require authentication and `ADMIN`.

Base path:

```http
/api/v1/admin/backups
```

## Status

```http
GET /api/v1/admin/backups/status
```

Returns:

- system maintenance status
- running operation
- backup settings
- last successful backup
- next scheduled backup

## Settings

```http
GET /api/v1/admin/backups/settings
PUT /api/v1/admin/backups/settings
```

Update body:

```json
{
  "backupDirectory": "C:\\Users\\User\\Documents\\HomeConnect Backups",
  "automaticBackupsEnabled": true,
  "automaticBackupTime": "02:00",
  "automaticRetentionCount": 30,
  "pgDumpPath": null,
  "pgRestorePath": null,
  "psqlPath": null
}
```

Allowed retention values:

- `7`
- `14`
- `30`
- `60`
- `90`

The backend validates the backup directory and rejects unsafe paths.

## List Backups

```http
GET /api/v1/admin/backups
```

Query:

| Name | Default | Notes |
| --- | --- | --- |
| `type` | optional | `MANUAL`, `AUTO`, `PRE_RESTORE` |
| `status` | optional | `IN_PROGRESS`, `COMPLETED`, `FAILED`, `DELETED`, `RESTORED` |
| `page` | `1` | Positive integer |
| `limit` | `25` | Max `100` |
| `sortOrder` | `DESC` | `ASC`, `DESC` |

Records do not expose absolute paths.

## Create Manual Backup

```http
POST /api/v1/admin/backups
```

Body:

```json
{
  "type": "MANUAL"
}
```

Returns only after `pg_dump` succeeds and `pg_restore --list` verifies the archive.

Response data:

```json
{
  "id": "...",
  "filename": "homeconnect-2026-07-25-143012-manual.backup",
  "sizeBytes": 123456,
  "createdAt": "2026-07-25T11:30:12.000Z",
  "type": "MANUAL",
  "status": "COMPLETED",
  "databaseName": "homeconnect",
  "applicationVersion": "1.0.0",
  "postgresVersion": null,
  "checksum": "...",
  "verified": true,
  "createdBy": "...",
  "durationMs": 1200,
  "errorMessage": null
}
```

## Validate Restore

```http
POST /api/v1/admin/backups/:backupId/validate-restore
```

Returns:

```json
{
  "backup": {},
  "checksumMatches": true,
  "archiveReadable": true,
  "compatible": true,
  "warnings": []
}
```

Validation checks:

- backup exists in configured folder
- archive is readable by `pg_restore --list`
- checksum matches stored metadata when present
- application version is compatible

## Restore Backup

```http
POST /api/v1/admin/backups/:backupId/restore
```

Body:

```json
{
  "confirmation": "RESTORE"
}
```

Restore is rejected unless confirmation is exactly `RESTORE`.

Backend flow:

1. validates selected backup
2. creates verified `PRE_RESTORE` safety backup
3. blocks writes
4. runs `pg_restore`
5. verifies core tables
6. records result

## Error Codes

Possible API errors:

- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `400 VALIDATION_ERROR`
- `404 NOT_FOUND`
- `409 BACKUP_CONFLICT`
- `422 BACKUP_INVALID`
- `500 BACKUP_COMMAND_FAILED`
- `503 MAINTENANCE_MODE`

Errors do not include database passwords.
