# Rollout checklist

Follow this sequence from a drafted GitHub Release to the business PC running the new version. Do not skip steps.

## When to run

Run for every release drafted by CI after a `v<version>` tag push. A draft is not offered to Home Connect's update checker until it is published.

## 1. Confirm the draft

- Open [Home Connect releases](https://github.com/SamirMD0/HomeConnect/releases) and confirm the new release is marked **Draft**.
- Confirm these three assets are attached: `HomeConnect-Setup-<version>.exe`, `HomeConnect-Setup-<version>.exe.blockmap`, and `latest.yml`.
- If an asset is missing, do not publish. Inspect the workflow logs; re-run a transient failure or prepare a new patch tag for a persistent failure.

## 2. Download to the test PC

- On the test PC, not the business PC, download the installer and `latest.yml` from the draft into the same folder.
- Confirm the `path:` entry in `latest.yml` names the downloaded installer.
- In PowerShell, from that folder, set `$version` to the drafted version and run the following. `latest.yml` stores SHA-512 in Base64; `Get-FileHash` prints hexadecimal, so convert before comparing:

  ```powershell
  $version = '2.0.3' # Replace with the drafted version.
  $installer = ".\HomeConnect-Setup-$version.exe"
  $expected = (Select-String -Path .\latest.yml -Pattern '^sha512:\s*(\S+)' | Select-Object -First 1).Matches.Groups[1].Value
  $expectedHex = ([Convert]::FromBase64String($expected) | ForEach-Object { $_.ToString('x2') }) -join ''
  $actualHex = (Get-FileHash -Algorithm SHA512 $installer).Hash
  $actualHex -ieq $expectedHex
  ```

- Continue only if the last command prints `True`. If it prints `False`, delete that download and download the installer once more. If it still prints `False`, do not publish; open an incident for suspected corruption or tampering.

## 3. Run the upgrade smoke test

- Follow [the upgrade smoke test](upgrade-smoke-test.md) end to end on the test PC and record its result.
- Do not use the business database. If the result is not GREEN, stop, do not publish, and file an incident with the failing step and available diagnostics.
- If GREEN, return here for the release-note and publish steps.

## 4. Fill the release notes

- Copy `docs/releases/<version>.md` into the draft's body on GitHub.
- Include non-empty **Fixes**, **New**, **Breaking**, **Migration notes**, and **Operator checklist** sections.
- Clear **This is a pre-release** if applicable.

## 5. Publish

- Click **Publish release** on GitHub.
- Confirm the **Draft** badge is gone and the release is marked **Latest**.
- Confirm the published `latest.yml` still names the correct version and has the same SHA-512 checked in step 2.
- If either check fails, do not install on the business PC. Escalate the release as an incident.

## 6. Detect the update on the business PC

- Home Connect checks after launch and every six hours. To check immediately, open Settings > Updates > **Check now**.
- Wait for the check to finish; confirm the sidebar chip offers `Update available: <version>`.
- If the new version is not offered, do not install a different file. Record the status shown and investigate before continuing.

## 7. Install on the business PC

- Choose a low-traffic window, never during a sale. Confirm the most recent backup completed and keep the previous installer available.
- Click the update chip and choose **Install & Restart**, or use Settings > Updates > **Install**.
- Watch Home Connect close, install, and relaunch. If migrations run, note the `Applied N migration(s)` message and backup path in the startup monitor.
- If **Home Connect could not update** appears, stop and follow the [migration-failure runbook](../incident-runbooks/migration-failure.md). Do not resume sales until recovery is complete.

## 8. Verify the business PC

- Confirm the About screen shows the new version.
- Use the next legitimate sale to verify the end-to-end sale and receipt path; do not create a fictitious sale in live records.
- Record the installation timestamp and result in the release's smoke-test notes.
- If verification fails, stop using the new version for sales and contact the developer with the observed failure. Do not improvise a rollback.

## 9. Retain recovery material

- Keep the pre-migration backup in `BACKUP_DIR`. Its name resembles `pre-update-<prev>-to-<new>-<ISO-timestamp>.backup`.
- Keep it until a newer release has been in service for at least one week. Only then may an older pre-update backup be deleted manually.
- The developer-machine copy under `release/<version>/` may be retained as an offline installer fallback.

## Never

- Never publish without a GREEN [upgrade smoke test](upgrade-smoke-test.md).
- Never install on the business PC before the draft has completed its test-PC upgrade.
- Never delete the pre-migration backup before a newer release has been in service for at least one week.
- Never edit or replace a published release's `latest.yml`. If a release is wrong, cut a new patch release.
