$ErrorActionPreference = 'Stop'

$pidFile = Join-Path $env:TEMP 'carwash_cloudflared.pid'
$urlFile = Join-Path $env:TEMP 'carwash_cloudflared.url'

if (Test-Path -LiteralPath $pidFile) {
  try {
    $pidRaw = Get-Content -LiteralPath $pidFile -ErrorAction Stop | Select-Object -First 1
    $pid = [int]$pidRaw
    if ($pid -gt 0) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped tunnel PID $pid"
    }
  } catch {
    Write-Host 'Could not stop tunnel by PID file.' -ForegroundColor Yellow
  } finally {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
}

$stale = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq 'cloudflared.exe' -and $_.CommandLine -and
  $_.CommandLine -match 'tunnel' -and $_.CommandLine -match '127\.0\.0\.1:3000'
}

foreach ($proc in $stale) {
  $procId = [int]$proc.ProcessId
  if ($procId -gt 0) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped stale tunnel PID $procId"
  }
}

Remove-Item -LiteralPath $urlFile -Force -ErrorAction SilentlyContinue
Write-Host 'Tunnel stopped.'
