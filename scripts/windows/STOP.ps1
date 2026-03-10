$ErrorActionPreference = 'Stop'

# Корень проекта — на 2 уровня выше scripts/windows/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $scriptDir)
$normalizedRoot = $root.ToLowerInvariant()
$botPidFile = Join-Path $env:TEMP 'carwash_telegram_bot.pid'

function Get-ProcessInfoById {
  param(
    [int]$ProcessId
  )

  return Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
}

function Format-ProcessInfo {
  param(
    [int]$ProcessId,
    $ProcessInfo
  )

  if (-not $ProcessInfo) {
    return "PID $ProcessId"
  }

  $commandLine = [string]$ProcessInfo.CommandLine
  if ($commandLine.Length -gt 120) {
    $commandLine = $commandLine.Substring(0, 117) + '...'
  }
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return "PID $ProcessId [$($ProcessInfo.Name)]"
  }

  return "PID $ProcessId [$($ProcessInfo.Name)] $commandLine"
}

function Test-IsProjectProcess {
  param(
    $ProcessInfo
  )

  if (-not $ProcessInfo) {
    return $false
  }

  $commandLine = [string]$ProcessInfo.CommandLine
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return $false
  }

  return $commandLine.ToLowerInvariant().Contains($normalizedRoot)
}

if (Test-Path $botPidFile) {
  try {
    $botPid = Get-Content $botPidFile -ErrorAction Stop | Select-Object -First 1
    if ($botPid -and ($botPid -as [int])) {
      Stop-Process -Id ([int]$botPid) -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped telegram worker PID $botPid"
    }
  } catch {
    Write-Host 'Failed to stop telegram worker by PID file.' -ForegroundColor Yellow
  } finally {
    Remove-Item $botPidFile -Force -ErrorAction SilentlyContinue
  }
}

$staleBotProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot) -and (
    ($_.Name -eq 'node.exe' -and ($_.CommandLine -like '*telegram-bot/worker.mjs*' -or $_.CommandLine -like '*telegram-bot\worker.mjs*')) -or
    $_.CommandLine -like '*run bot:telegram*'
  )
}

foreach ($proc in $staleBotProcesses) {
  $procId = [int]$proc.ProcessId
  if ($procId -gt 0) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped stale telegram process PID $procId"
  }
}

$staleBackendLaunchers = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot) -and (
    ($_.Name -eq 'go.exe' -and $_.CommandLine -like '*run*cmd/server*') -or
    ($_.Name -eq 'cmd.exe' -and $_.CommandLine -like '*go*run*cmd/server*')
  )
}

foreach ($proc in $staleBackendLaunchers) {
  $procId = [int]$proc.ProcessId
  if ($procId -gt 0) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped backend launcher PID $procId"
  }
}

$ports = @(3000, 3001, 3002, 3003, 3004, 3005, 8080, 8081, 8082, 8083, 8084, 8085)

foreach ($port in $ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    Write-Host "Port $port is free"
    continue
  }

  $procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $procIds) {
    $processId = [int]$procId
    $processInfo = Get-ProcessInfoById -ProcessId $processId
    if (Test-IsProjectProcess -ProcessInfo $processInfo) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped $(Format-ProcessInfo -ProcessId $processId -ProcessInfo $processInfo) on port $port"
    } else {
      Write-Host "Skipped $(Format-ProcessInfo -ProcessId $processId -ProcessInfo $processInfo) on port $port (not this project)" -ForegroundColor Yellow
    }
  }
}

Write-Host 'Done.'
