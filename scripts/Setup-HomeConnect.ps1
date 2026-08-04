<#
.SYNOPSIS
  Prepares a Windows PC to run HomeConnect.

.DESCRIPTION
  Idempotent bootstrap. Safe to run more than once: it creates what is missing
  and leaves everything else alone.

  It never drops a database, never deletes data, and never bakes a secret into
  the script. The postgres password is asked for once, used to build the
  connection string, and written only to production.env.

.NOTES
  Run from the setup bundle, in PowerShell, on the machine being set up.
#>

param(
  [string]$DatabaseName = "homeconnect",
  [string]$PostgresHost = "localhost",
  [int]$Port = 5433,
  [string]$PostgresUser = "postgres",
  [string]$PsqlPath = "",
  [switch]$SkipDatabaseCreate
)

$ErrorActionPreference = "Stop"

function Write-Step { param([string]$Message) Write-Host "`n== $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "   OK   $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "   WARN $Message" -ForegroundColor Yellow }

function Stop-WithMessage {
  param([string]$Message, [string]$Fix)
  Write-Host "`nFAILED: $Message" -ForegroundColor Red
  if ($Fix) { Write-Host "WHAT TO DO: $Fix" -ForegroundColor Yellow }
  exit 1
}

# --------------------------------------------------------------------------
# 1. PostgreSQL service
# --------------------------------------------------------------------------
Write-Step "Checking PostgreSQL service"

$service = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $service) {
  Stop-WithMessage "No PostgreSQL service was found on this PC." `
    "Install PostgreSQL 18 (x64), then run this script again."
}
if ($service.Status -ne "Running") {
  Write-Warn "$($service.Name) is $($service.Status). Attempting to start it."
  try { Start-Service -Name $service.Name -ErrorAction Stop } catch {
    Stop-WithMessage "Could not start $($service.Name)." `
      "Open Services (services.msc), start $($service.Name), then run this script again."
  }
}
Write-Ok "$($service.Name) is running"

# --------------------------------------------------------------------------
# 2. psql
# --------------------------------------------------------------------------
Write-Step "Locating psql"

function Find-Psql {
  if ($PsqlPath -and (Test-Path -LiteralPath $PsqlPath)) { return $PsqlPath }

  $command = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  # PostgreSQL is not always on C:, so every fixed drive is checked.
  foreach ($drive in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null })) {
    $candidate = Join-Path $drive.Root "Program Files\PostgreSQL"
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $found = Get-ChildItem -LiteralPath $candidate -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

$psql = Find-Psql
if (-not $psql) {
  Stop-WithMessage "psql.exe could not be found." `
    "Re-run with -PsqlPath 'D:\Program Files\PostgreSQL\18\bin\psql.exe' (adjust for your install)."
}
Write-Ok "psql at $psql"

# --------------------------------------------------------------------------
# 3. Password (asked once, never echoed)
# --------------------------------------------------------------------------
Write-Step "PostgreSQL password"

$secure = Read-Host -Prompt "Password for PostgreSQL user '$PostgresUser'" -AsSecureString
$plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)
if (-not $plainPassword) { Stop-WithMessage "No password was entered." "Run the script again and enter the postgres password." }

# PGPASSWORD is set only for this process, so it never reaches the command line
# or the shell history.
$env:PGPASSWORD = $plainPassword

& $psql -h $PostgresHost -p $Port -U $PostgresUser -d postgres -c "SELECT 1;" *> $null
if ($LASTEXITCODE -ne 0) {
  $env:PGPASSWORD = $null
  Stop-WithMessage "PostgreSQL rejected that password, or is not listening on port $Port." `
    "Check the password and the port. The port is set during PostgreSQL installation and is often 5432 or 5433."
}
Write-Ok "Connected to PostgreSQL on $PostgresHost`:$Port"

# --------------------------------------------------------------------------
# 4. Database (created only if absent — never dropped)
# --------------------------------------------------------------------------
Write-Step "Database '$DatabaseName'"

$exists = (& $psql -h $PostgresHost -p $Port -U $PostgresUser -d postgres -tAc `
  "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';") 2>$null

if ($exists -match "1") {
  Write-Ok "Already exists — left untouched"
} elseif ($SkipDatabaseCreate) {
  Write-Warn "Missing, and -SkipDatabaseCreate was given"
} else {
  & $psql -h $PostgresHost -p $Port -U $PostgresUser -d postgres -c "CREATE DATABASE `"$DatabaseName`";" *> $null
  if ($LASTEXITCODE -ne 0) {
    $env:PGPASSWORD = $null
    Stop-WithMessage "Could not create the database '$DatabaseName'." "Confirm '$PostgresUser' may create databases."
  }
  Write-Ok "Created"
}

# --------------------------------------------------------------------------
# 5. Configuration file
# --------------------------------------------------------------------------
Write-Step "Writing configuration"

$configDir = Join-Path $env:APPDATA "home-connect\config"
$envFile = Join-Path $configDir "production.env"
if (-not (Test-Path -LiteralPath $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }

function New-Secret {
  $bytes = [byte[]]::new(48)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes)
}

# Existing secrets are reused so a re-run does not sign every user out.
function Get-ExistingValue {
  param([string]$Name)
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Name\s*=\s*", "").Trim()
}

$jwtSecret = Get-ExistingValue "JWT_SECRET"
if (-not $jwtSecret) { $jwtSecret = New-Secret; Write-Ok "Generated JWT_SECRET" } else { Write-Ok "Kept existing JWT_SECRET" }

$jwtRefresh = Get-ExistingValue "JWT_REFRESH_SECRET"
if (-not $jwtRefresh) { $jwtRefresh = New-Secret; Write-Ok "Generated JWT_REFRESH_SECRET" } else { Write-Ok "Kept existing JWT_REFRESH_SECRET" }

# The documented pitfall: an unencoded '@' splits the URL early and the app then
# reads a nonsense host. EscapeDataString covers '@', '/', '#', '?' and the rest.
$encodedPassword = [uri]::EscapeDataString($plainPassword)
$encodedUser = [uri]::EscapeDataString($PostgresUser)
$databaseUrl = "postgresql://$encodedUser`:$encodedPassword@$PostgresHost`:$Port/$DatabaseName"

if ($encodedPassword -ne $plainPassword) {
  Write-Ok "Password contained characters that must be encoded — handled automatically"
}

@(
  "# HomeConnect production configuration",
  "# Generated by Setup-HomeConnect.ps1 on $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
  "# Keep this file private. It contains the database password.",
  "NODE_ENV=production",
  "DATABASE_URL=$databaseUrl",
  "JWT_SECRET=$jwtSecret",
  "JWT_REFRESH_SECRET=$jwtRefresh"
) | Set-Content -LiteralPath $envFile -Encoding UTF8

# Lock the file down to this user; it holds the database password.
try {
  icacls $envFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" *> $null
  Write-Ok "Restricted access to $env:USERNAME"
} catch {
  Write-Warn "Could not tighten file permissions — check them manually"
}
Write-Ok "Wrote $envFile"

$env:PGPASSWORD = $null
$plainPassword = $null

# --------------------------------------------------------------------------
# 6. Point the app at the file
# --------------------------------------------------------------------------
Write-Step "Registering BACKEND_ENV_FILE"
[Environment]::SetEnvironmentVariable("BACKEND_ENV_FILE", $envFile, "User")
$env:BACKEND_ENV_FILE = $envFile
Write-Ok "Set for this user"

# --------------------------------------------------------------------------
# 7. Verify
# --------------------------------------------------------------------------
Write-Step "Verifying"

$tester = Join-Path $PSScriptRoot "Test-HomeConnectDatabaseUrl.ps1"
if (Test-Path -LiteralPath $tester) {
  & $tester -EnvFile $envFile
  if ($LASTEXITCODE -ne 0) { Stop-WithMessage "The connection test failed." "Send the output above for help." }
} else {
  Write-Warn "Test-HomeConnectDatabaseUrl.ps1 not found next to this script — skipped"
}

Write-Host "`n=====================================" -ForegroundColor Green
Write-Host " HomeConnect setup completed" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host " Database : $DatabaseName on $PostgresHost`:$Port"
Write-Host " Config   : $envFile"
Write-Host ""
Write-Host " Next steps:" -ForegroundColor Cyan
Write-Host "  1. Install HomeConnect using the installer in this bundle."
Write-Host "  2. Start HomeConnect and create the first administrator account."
Write-Host "  3. Open Settings -> Maintenance and apply any pending database updates."
Write-Host ""
