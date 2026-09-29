param(
  [Parameter(Mandatory = $true)][string]$InstalledExe,
  [Parameter(Mandatory = $true)][string]$UserDataDirectory,
  [int]$BackendPort = 3001,
  [int]$FrontendPort = 3002
)

# Read-only operator aid. Run after the installed app has been launched following
# a real reboot. It does not start/stop processes, read credentials, or migrate DBs.
$ErrorActionPreference = 'Stop'
$exe = Get-Item -LiteralPath $InstalledExe -ErrorAction Stop
$data = Get-Item -LiteralPath $UserDataDirectory -ErrorAction Stop
$config = Join-Path $data.FullName 'config\production.env'
$processes = @(Get-Process -Name 'HomeConnect' -ErrorAction SilentlyContinue)
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @($BackendPort, $FrontendPort) })
$backend = @($listeners | Where-Object LocalPort -eq $BackendPort)
$frontend = @($listeners | Where-Object LocalPort -eq $FrontendPort)
$health = $null
try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/v1/health" -TimeoutSec 5
} catch {
  $health = $null
}

$checks = [ordered]@{
  InstalledExePresent = $exe.Extension -eq '.exe'
  UserDataPresent = $data.PSIsContainer
  ConfigPresent = Test-Path -LiteralPath $config -PathType Leaf
  OneAppProcess = $processes.Count -eq 1
  OneBackendListener = $backend.Count -eq 1
  OneFrontendListener = $frontend.Count -eq 1
  BackendDatabaseConnected = $health.success -eq $true -and $health.data.database -eq 'connected'
}

Write-Output 'Post-reboot read-only checks (secrets omitted):'
foreach ($item in $checks.GetEnumerator()) {
  Write-Output ("{0}: {1}" -f $item.Key, $(if ($item.Value) { 'PASS' } else { 'FAIL' }))
}
Write-Output ("Installed executable version: {0}" -f $exe.VersionInfo.ProductVersion)
Write-Output ("App PID(s): {0}" -f (($processes.Id | Sort-Object) -join ', '))
Write-Output ("Backend listener PID(s): {0}" -f (($backend.OwningProcess | Sort-Object -Unique) -join ', '))
Write-Output ("Frontend listener PID(s): {0}" -f (($frontend.OwningProcess | Sort-Object -Unique) -join ', '))
Write-Output 'Check migration status in the app Maintenance panel; this script does not access migration credentials.'
if (@($checks.Values | Where-Object { -not $_ }).Count -gt 0) { exit 1 }
