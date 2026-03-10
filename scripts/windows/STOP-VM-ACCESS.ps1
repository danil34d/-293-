$ErrorActionPreference = 'Stop'

$listenAddress = '127.0.0.1'
$webPort = 13000
$sshPort = 12222

$pidFile = Join-Path $env:TEMP 'carwash_vm_access.pid'
$stateFile = Join-Path $env:TEMP 'carwash_vm_access.json'

function Stop-ProcessByPidFile {
  if (-not (Test-Path -LiteralPath $pidFile)) {
    return
  }

  try {
    $pid = [int](Get-Content -LiteralPath $pidFile -ErrorAction Stop | Select-Object -First 1)
    if ($pid -gt 0) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped VM access PID $pid"
    }
  } catch {
    Write-Host 'Could not stop VM access by PID file.' -ForegroundColor Yellow
  } finally {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
  }
}

function Stop-StaleTunnelProcesses {
  $expectedSnippets = @(
    "-L $listenAddress`:$webPort`:`127.0.0.1`:3000",
    "-L $listenAddress`:$sshPort`:`127.0.0.1`:22"
  )

  $stale = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    if ($_.Name -ne 'ssh.exe' -or [string]::IsNullOrWhiteSpace($_.CommandLine)) {
      return $false
    }

    $cmd = [string]$_.CommandLine
    return (($expectedSnippets | Where-Object { $_.Length -gt 0 -and $cmd.Contains($_) }).Count -gt 0)
  }

  foreach ($proc in $stale) {
    $procId = [int]$proc.ProcessId
    if ($procId -gt 0) {
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped stale VM access PID $procId"
    }
  }
}

Stop-ProcessByPidFile
Stop-StaleTunnelProcesses
Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue

Write-Host 'VM access tunnel stopped.'
