$ErrorActionPreference = 'Stop'

# Корень проекта — на 2 уровня выше scripts/windows/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $scriptDir)
$origin = 'http://127.0.0.1:3000'
$cloudflaredExe = Join-Path $root 'tools\cloudflared.exe'

$logFile = Join-Path $env:TEMP 'carwash_cloudflared.log'
$errFile = Join-Path $env:TEMP 'carwash_cloudflared.err.log'
$pidFile = Join-Path $env:TEMP 'carwash_cloudflared.pid'
$urlFile = Join-Path $env:TEMP 'carwash_cloudflared.url'

if (-not (Test-Path -LiteralPath $cloudflaredExe)) {
  Write-Host "cloudflared.exe not found: $cloudflaredExe" -ForegroundColor Red
  Write-Host 'Place cloudflared.exe in tools\ and run again.' -ForegroundColor Yellow
  exit 1
}

try {
  $status = Invoke-WebRequest -UseBasicParsing -Uri "$origin/login" -TimeoutSec 6
  if ($status.StatusCode -lt 200 -or $status.StatusCode -ge 500) {
    throw "Origin returned status $($status.StatusCode)"
  }
} catch {
  Write-Host "Local app is not responding at $origin." -ForegroundColor Red
  Write-Host 'Run START.ps1 first, then retry START-TUNNEL.ps1.' -ForegroundColor Yellow
  exit 1
}

# Stop old tunnel by PID file if present.
if (Test-Path -LiteralPath $pidFile) {
  try {
    $oldPidRaw = Get-Content -LiteralPath $pidFile -ErrorAction Stop | Select-Object -First 1
    $oldPid = [int]$oldPidRaw
    if ($oldPid -gt 0) {
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped previous tunnel PID $oldPid"
    }
  } catch {
    Write-Host 'Could not stop previous tunnel by PID file.' -ForegroundColor Yellow
  }
}

# Stop stale cloudflared tunnel processes for localhost:3000.
$stale = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -and
  $_.CommandLine -match 'tunnel' -and $_.CommandLine -match '127\.0\.0\.1:3000'
}
foreach ($proc in $stale) {
  Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction SilentlyContinue
}

Remove-Item -LiteralPath $logFile,$errFile,$urlFile,$pidFile -Force -ErrorAction SilentlyContinue

$proc = Start-Process `
  -FilePath $cloudflaredExe `
  -ArgumentList @('tunnel', '--no-autoupdate', '--url', $origin) `
  -WorkingDirectory $root `
  -WindowStyle Minimized `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ascii
Write-Host "Tunnel process PID: $($proc.Id)"

$urlRegex = 'https://[-a-zA-Z0-9]+\.trycloudflare\.com'
$publicUrl = $null

for ($i = 0; $i -lt 45; $i++) {
  Start-Sleep -Seconds 1

  foreach ($file in @($logFile, $errFile)) {
    if (-not (Test-Path -LiteralPath $file)) { continue }
    $content = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
    if ($content -match $urlRegex) {
      $publicUrl = $Matches[0]
      break
    }
  }

  if ($publicUrl) { break }
  if ($proc.HasExited) { break }
}

if ($publicUrl) {
  Set-Content -LiteralPath $urlFile -Value $publicUrl -Encoding ascii
  Write-Host "Tunnel URL: $publicUrl" -ForegroundColor Green
  Write-Host "Logs: $logFile"
  Write-Host "Stop command: STOP-TUNNEL.ps1"
  exit 0
}

if ($proc.HasExited) {
  Write-Host 'Tunnel process exited too early.' -ForegroundColor Red
} else {
  Write-Host 'Tunnel started, but URL was not found in logs in 45 seconds.' -ForegroundColor Yellow
}

Write-Host "Check logs: $logFile and $errFile"
exit 1
