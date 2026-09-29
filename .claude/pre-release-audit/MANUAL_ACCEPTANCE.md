# Manual acceptance card — 2026-09-28

Use a disposable Windows profile/VM and a disposable restored database first. Record operator, date, installer SHA-256, installed version/path, DB name, screenshots, printer/scanner models, expected and actual results. Do not install the candidate over the live business app or mark a step PASS from an automated simulation. Historical extended checklists are preserved in `evidence/historical-release-docs/`.

## MANUAL ACCEPTANCE REQUIRED — install and real reboot

| Step | Expected result / evidence |
|---|---|
| 1. Record old-install state; close app | Note existing version, install path, user-data/config path and DB backup. No HomeConnect process or listeners on 3001/3002 before install. Do not uninstall a live business installation. |
| 2. Install candidate unsigned installer | Installer hash equals `FINAL_RELEASE_REVIEW.md`; version and installed assets are correct. Windows publisher warning is expected for this **ACCEPTED LIMITATION**, not bypassed by self-signing. |
| 3. First launch and login | One app window, one backend; login works; `/api/v1/health` says database connected; no breakpoint or error dialog. Record time and logs. |
| 4. Inspect migration state | Maintenance panel reports no pending, failed or unexpected checksum mismatch; review thermal-reconciliation notes. No automatic live-data migration for this checklist. |
| 5. Close and inspect | App and its owned backend terminate; ports 3001/3002 are free; unrelated processes untouched. |
| 6. Reboot Windows, launch and log in again | No manual repair required. Same database/account/settings and user-data/config path survive; one app/backend instance and connected DB health. Record startup time. |
| 7. Run read-only check | After launch, run `powershell -ExecutionPolicy Bypass -File scripts/release-post-reboot-check.ps1 -InstalledExe '<installed HomeConnect.exe>' -UserDataDirectory '<Electron user-data directory>'`; all checks PASS. Then inspect Maintenance migration state manually. The script does not access secrets or apply migrations. |

**Status: READY FOR MANUAL REBOOT ACCEPTANCE after final gates; no reboot PASS yet.**

## MANUAL ACCEPTANCE REQUIRED — physical devices

Before printing, record a disposable product’s public price, stored SKU and barcode, and a known allowed staff-secret preset/encoding. Use plain text for scan comparison so app search normalization cannot hide a mismatch.

| Action | Exact expected result |
|---|---|
| Print ordinary barcode label | Paper is legible and unclipped; printed human-readable barcode equals the product barcode source. Scanner decodes the exact same full value. |
| Scan label into HomeConnect | Exactly the intended product opens; no alternate SKU/product match. |
| Print pricing card, including target thermal card | Correct product/category/shop template, public price, brand logo or text fallback, QLED/feature icons, SKU, validity and paper dimensions; no duplicate “TCL TCL”, scaling, clipping or lost quiet zone. |
| Print with staff-secret preset | Displayed SKU gains only the presentation staff-code suffix; stored SKU and public price remain unchanged. Scan barcode into plain text: decoded value equals printed human-readable barcode and contains **no** secret-price suffix. |
| Print invoice and receipt, then reprint | Line items, VAT, currency, paid/debt totals and identifiers match saved transaction; reprint creates no new posting. Check Arabic/English if used. |
| Disconnect/cancel printer and retry | App remains usable, reports a print problem rather than claiming paper success, and succeeds after reconnection. |

**Status: physical printer/scanner/receipt/invoice acceptance pending.**

## MANUAL ACCEPTANCE REQUIRED — off-machine backup

1. In the app, create a fresh backup using its existing export/destination-selection workflow. Record filename, size and SHA-256 (`Get-FileHash -Algorithm SHA256`).
2. Copy it to USB, external disk, another machine, or an approved remote location **independent of the business PC**. Recompute SHA-256 there; it must match exactly. Disconnect or otherwise prove the independent location remains accessible without the original disk.
3. Restore **from that independent copy** into a disposable database/environment only. Run app integrity/maintenance checks; compare table counts and key balances/stock against the source manifest. Never overwrite the live database for this test.

**Status: isolated current-schema restore previously passed; off-machine custody/restore pending.**

## EXTERNAL INPUT REQUIRED / ACCEPTED LIMITATION

- No authentic prior-installed 120×80 thermal-template backup is available. A real older-version upgrade remains unproven. Obtain one for disposable rehearsal or explicitly accept the documented upgrade risk with a verified rollback before any prior-version production deployment.
- Unsigned Windows installer is owner-accepted. Do not mark it signed or modify signing configuration.
