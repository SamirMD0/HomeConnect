param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "production.env")
)

$ErrorActionPreference = "Stop"

function Stop-WithMessage {
  param([string]$Message)
  Write-Host "FAILED: $Message" -ForegroundColor Red
  exit 1
}

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^\s*$Name\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  $value = $line -replace "^\s*$Name\s*=\s*", ""
  $value = $value.Trim()

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  return $value
}

function Find-Psql {
  $command = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidate = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($candidate) {
    return $candidate.FullName
  }

  return $null
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
  Stop-WithMessage "Could not find env file: $EnvFile"
}

$databaseUrl = Get-EnvValue -Path $EnvFile -Name "DATABASE_URL"
if (-not $databaseUrl) {
  Stop-WithMessage "DATABASE_URL was not found in $EnvFile"
}

$atCount = ([regex]::Matches($databaseUrl, "@")).Count
if ($atCount -gt 1) {
  Stop-WithMessage "DATABASE_URL contains more than one @ character. If your password contains @, write it as %40. Example: p%40ssword"
}

try {
  $uri = [Uri]$databaseUrl
} catch {
  Stop-WithMessage "DATABASE_URL is not a valid URL. $($_.Exception.Message)"
}

if ($uri.Scheme -notin @("postgresql", "postgres")) {
  Stop-WithMessage "DATABASE_URL must start with postgresql://"
}

$database = $uri.AbsolutePath.TrimStart("/")
if (-not $database) {
  Stop-WithMessage "DATABASE_URL does not include a database name."
}

$hostName = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$userInfo = $uri.UserInfo

if (-not $userInfo -or $userInfo -notmatch ":") {
  Stop-WithMessage "DATABASE_URL must include username and password."
}

$userParts = $userInfo.Split(":", 2)
$username = [Uri]::UnescapeDataString($userParts[0])
$password = [Uri]::UnescapeDataString($userParts[1])

Write-Host "HomeConnect database URL test" -ForegroundColor Cyan
Write-Host "Env file : $EnvFile"
Write-Host "Host     : $hostName"
Write-Host "Port     : $port"
Write-Host "Database : $database"
Write-Host "Username : $username"

$tcp = Test-NetConnection -ComputerName $hostName -Port $port -InformationLevel Quiet
if (-not $tcp) {
  Stop-WithMessage "Cannot reach PostgreSQL at ${hostName}:${port}. Check PostgreSQL service, pgAdmin server port, and firewall."
}
Write-Host "TCP check: OK" -ForegroundColor Green

$psql = Find-Psql
if (-not $psql) {
  Stop-WithMessage "psql.exe was not found. Install PostgreSQL command line tools or add PostgreSQL bin folder to PATH."
}
Write-Host "psql    : $psql"

$oldPgPassword = $env:PGPASSWORD
$env:PGPASSWORD = $password

try {
  $query = "SELECT current_database(), current_user, inet_server_port();"
  $output = & $psql -h $hostName -p $port -U $username -d $database -v ON_ERROR_STOP=1 -t -A -c $query 2>&1
  $exitCode = $LASTEXITCODE
} finally {
  if ($null -eq $oldPgPassword) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
  } else {
    $env:PGPASSWORD = $oldPgPassword
  }
}

if ($exitCode -ne 0) {
  Write-Host $output
  Stop-WithMessage "PostgreSQL login/query failed. Check username, password, port, database name, and password URL encoding."
}

Write-Host "Database query: OK" -ForegroundColor Green
Write-Host $output
Write-Host "SUCCESS: DATABASE_URL is valid for HomeConnect." -ForegroundColor Green
