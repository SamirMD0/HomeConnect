# Backup And Restore Recovery Guide

Date: 2026-07-25

## Where Backups Are Stored

Default folder:

```text
%USERPROFILE%\Documents\HomeConnect Backups
```

An admin can change the folder in:

```text
Settings -> Backup and Restore
```

Use a folder outside the application install folder. A USB drive or second drive can be selected from the desktop app.

Do not store backups inside:

- the project folder
- `node_modules`
- PostgreSQL data directories
- temporary folders

## Backup Files

Backup files look like:

```text
homeconnect-2026-07-25-143012-manual.backup
homeconnect-2026-07-25-020000-auto.backup
homeconnect-2026-07-25-151500-pre-restore.backup
```

Do not rename backup files unless instructed by technical support.

Do not delete:

- the newest successful manual backup
- the newest automatic backup
- any pre-restore backup created during recovery
- `.homeconnect-backups.json`

## Automatic Backups

Automatic backups run daily while the app is running.

Default:

- enabled
- 2:00 AM
- keep last 30 automatic backups

If the app was closed at the scheduled time, it checks on startup and creates a catch-up backup when the last automatic backup is more than 24 hours old.

## Create A Manual Backup

1. Open the desktop app.
2. Log in as admin.
3. Open Settings.
4. Go to Backup and Restore.
5. Confirm PostgreSQL tools are found.
6. Click Create backup now.
7. Wait for the completed status.
8. Confirm the file appears in the backup list.

## Restore A Backup

1. Open Settings.
2. Go to Backup and Restore.
3. Select a completed backup.
4. Click Restore.
5. Click Validate backup.
6. Confirm archive readable, checksum matches, and compatible version.
7. Read the warning.
8. Type:

```text
RESTORE
```

9. Confirm restore.
10. Wait for completion.
11. Reload or restart the app if requested.

The system creates a pre-restore safety backup before replacing data.

## If The App Cannot Open

1. Do not delete the backup folder.
2. Locate the newest known-good `.backup` file.
3. Locate PostgreSQL tools:

```text
C:\Program Files\PostgreSQL\<version>\bin
```

Important tools:

- `pg_restore.exe`
- `pg_dump.exe`
- `psql.exe`

4. Ask technical support to restore the `.backup` file using PostgreSQL tools.
5. Keep the original backup folder untouched until the restored app is verified.

## What Not To Do

Do not copy PostgreSQL internal data folders while PostgreSQL is running.

Do not run destructive database reset commands.

Do not restore a backup into the real business database for testing.

Do not delete pre-restore backups until the business confirms the restored data is correct.

Do not share files containing database passwords or `.env` contents.

## Testing Recovery Safely

Only test restore with:

- isolated test database
- temporary backup folder
- disposable data

Never run destructive restore tests against the real `homeconnect` business database.
