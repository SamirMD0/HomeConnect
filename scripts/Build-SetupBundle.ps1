<#
.SYNOPSIS
  Packages the installer and its setup scripts into one zip to send to a shop.

.DESCRIPTION
  Collects an already-built installer plus the bootstrap script, the connection
  tester and the checklist into HomeConnect-Setup-Bundle-<version>.zip.

  It does not build the installer. Run `npm run dist:win` first — keeping the
  two separate means re-packaging never silently ships a stale build.
#>

param(
  [string]$Version = "",
  [string]$OutputDirectory = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $Version) {
  $Version = (Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json).version
}
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $repoRoot "release\$Version" }

$installer = Join-Path $OutputDirectory "HomeConnect-Setup-$Version.exe"
if (-not (Test-Path -LiteralPath $installer)) {
  Write-Host "FAILED: installer not found at $installer" -ForegroundColor Red
  Write-Host "WHAT TO DO: run 'npm run dist:win' first, then re-run this script." -ForegroundColor Yellow
  exit 1
}

$staging = Join-Path $env:TEMP "homeconnect-bundle-$Version"
if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging -Force | Out-Null

Copy-Item -LiteralPath $installer -Destination $staging
foreach ($name in @("Setup-HomeConnect.ps1", "Test-HomeConnectDatabaseUrl.ps1")) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $staging
}

$checklist = Join-Path $repoRoot "docs\setup\NEW_BUSINESS_PC_SETUP.md"
if (Test-Path -LiteralPath $checklist) { Copy-Item -LiteralPath $checklist -Destination (Join-Path $staging "SETUP-CHECKLIST.md") }

@"
HomeConnect $Version - setup bundle
===================================

On the new PC, in this order:

  1. Install PostgreSQL 18 (x64) if it is not installed. Remember the password
     you set for the 'postgres' user and the port.

  2. Right-click Setup-HomeConnect.ps1 and choose "Run with PowerShell".
     It asks for the postgres password once, creates the database if needed,
     and writes the configuration. It never deletes anything.

  3. Run HomeConnect-Setup-$Version.exe and follow the installer.

  4. Start HomeConnect and create the first administrator account.

  5. Open Settings -> Maintenance and apply any pending database updates.

If a step fails, the script prints WHAT TO DO. Send that text for help.
Full instructions are in SETUP-CHECKLIST.md.
"@ | Set-Content -LiteralPath (Join-Path $staging "README-FIRST.txt") -Encoding UTF8

$zip = Join-Path $OutputDirectory "HomeConnect-Setup-Bundle-$Version.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "Bundle written to $zip" -ForegroundColor Green
Get-ChildItem -LiteralPath $zip | ForEach-Object { "  {0:N1} MB" -f ($_.Length / 1MB) }
