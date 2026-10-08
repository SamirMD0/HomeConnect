# Incident: Home Connect could not update

## Updates started from 2.0.6 or later

HomeConnect saves the working application and verifies its database backup before launching an update. If backup preparation fails, installation does not start and the current backend resumes. If the new version fails during migration or first startup, a separate recovery process restores the previous application and pre-update database and reopens HomeConnect. Do not start a second copy while recovery runs. The rejected version is skipped until a newer patch is available.

This recovery runs before the new version is opened for business use. It does not automatically restore old data after a successfully completed update has been used for sales. Recovery snapshots and private failure details are retained under `%APPDATA%\home-connect\update-rollback\` and `config\update-rollback.json`.

If recovery itself cannot complete (for example, a backup is damaged or the disk cannot be written), keep the snapshot and contact support; never run an older app against data that failed to restore. The attended procedure below remains available for older installations and recovery tool failures.

## Older updates, including 2.0.4 to 2.0.5

Use this runbook if startup shows **Home Connect could not update**. Stop using Home Connect for sales until recovery is verified. Keep the failure screen open until you have copied its backup path and diagnostics.

## Do not

- Do not retry the update or reinstall the new version.
- Do not close the failure screen before steps 1 and 2.
- Do not delete or move the backup file.
- Do not try to apply the failed database update manually.

## Do, in order

### 1. Copy the backup path

Write down the complete path shown after **We saved your data to**, for example:

```text
D:\Backups\HomeConnect\pre-update-2.0.2-to-2.0.3-2026-10-05T13-22-00Z.backup
```

Keep the note outside Home Connect. If no path is shown, write **No backup path shown**; do not guess a file to restore.

### 2. Copy the diagnostics

Click **Copy diagnostics**. Paste the result into a Notepad file outside the Home Connect installation folder or a private email draft to the developer. Keep the failure code, previous and new versions, timestamp, failed update name, and error text if present. Do not post diagnostics publicly.

### 3. Close Home Connect

Click **Close**. Open Task Manager with Ctrl+Shift+Esc. Confirm no Home Connect or associated `node.exe` process remains; end a remaining Home Connect process before continuing.

### 4. Uninstall the failed version

Open Windows **Add or remove programs**, select Home Connect, and choose **Uninstall**. Decline any option to remove user data. The PostgreSQL database, backups folder, and `%APPDATA%\HomeConnect\` configuration must be retained.

### 5. Reinstall the previous version

Get the last known-good `HomeConnect-Setup-<previous-version>.exe` from `release/<previous-version>/` on the developer machine or that version's GitHub Release. Install it to the same path. Keep the backup and diagnostics untouched.

### 6. Decide whether the database needs restoring

Read the failure code copied in step 2:

- `BACKUP_TOOL_NOT_FOUND`, `BACKUP_FAILED_COMMAND`, or `BACKUP_FAILED_EMPTY`: the database update did not start. **Skip step 7**; continue to step 8. A partial or too-small backup is not a restore source.
- `MIGRATION_FAILED`, `MIGRATION_TIMEOUT`, or `POST_MIGRATION_HEALTH_FAIL`: the database might have changed. **Complete step 7 before using the previous version for sales.**
- Missing or different code: stop and send the diagnostics to the developer. Do not guess whether a restore is needed.

### 7. Restore the pre-update backup

Only do this when step 6 directs you here. Restoring replaces the current database with its state immediately before the attempted update. Confirm no business transactions were entered after that backup; if any were, stop and tell the developer before restoring.

- Confirm the file at the path from step 1 exists. If the path is missing or no file exists, stop and contact the developer. Do not use an older backup without guidance.
- Try to open the reinstalled previous version. If it opens normally, sign in as an ADMIN user, open **Settings > Backup and Restore**, select **Restore from file**, and choose the pre-update backup. Complete the on-screen validation and confirmation. Restart Home Connect when prompted.
- If the previous version does not open, or its restore screen cannot be reached, **stop**. Ask the developer or technical support to restore that exact backup with PostgreSQL tools. Do not reset the database or keep relaunching the app. See [Backup and Restore Recovery Guide](../setup/BACKUP_RESTORE_RECOVERY_GUIDE.md), **If The App Cannot Open**.

### 8. Verify the previous version

Sign in. Confirm the About screen shows the previous version. Compare dashboard figures with the last known good figures, and spot-check several customer balances. Use the next legitimate sale to check that the sale and receipt path works; do not create a fictitious sale in live records. If any check fails, stop using Home Connect for sales and contact the developer.

### 9. Report the incident

Send the developer the diagnostics from step 2 and report when the update was attempted, both version numbers, the backup path, which recovery steps ran, and when normal operation resumed. Keep the backup until the developer confirms it is no longer needed. The developer will investigate and prepare a corrected patch release. Do not attempt the failed update again until instructed.

## Why this is necessary

An update can change how Home Connect stores information. Reinstalling an older app does not undo those changes. Home Connect takes a backup before the update so the previous app and its data can be brought back together. The update refuses to continue if that backup fails.

The developer-facing reasoning is in [Failure and rollback](../../.claude/github-auto-update-plan/FAILURE_AND_ROLLBACK.md); the steps above are sufficient for the operator.
