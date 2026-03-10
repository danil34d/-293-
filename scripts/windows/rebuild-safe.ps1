param(
  [switch]$UseCiInstall,
  [switch]$SkipGoBuild
)

$ErrorActionPreference = 'Stop'

# Корень проекта — на 2 уровня выше scripts/windows/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $scriptDir)
Set-Location $root

Write-Host '== Rebuild Safe ==' -ForegroundColor Cyan
Write-Host "Project root: $root"

$defaultNodeDir = 'C:\Program Files\nodejs'
$defaultGoDir = 'C:\Program Files\Go\bin'

function Resolve-ExecutablePath {
  param(
    [string]$CommandName,
    [string[]]$FallbackPaths
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command -and $command.Source) {
    return $command.Source
  }

  foreach ($path in $FallbackPaths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return $path
    }
  }

  return $null
}

# На некоторых Windows-системах PATHEXT может быть поврежден, поэтому используем npm.cmd явно.
$npmPath = Resolve-ExecutablePath -CommandName 'npm.cmd' -FallbackPaths @(
  (Join-Path $defaultNodeDir 'npm.cmd')
)
$nodeExePath = Resolve-ExecutablePath -CommandName 'node.exe' -FallbackPaths @(
  (Join-Path $defaultNodeDir 'node.exe')
)
$goPath = Resolve-ExecutablePath -CommandName 'go' -FallbackPaths @(
  (Join-Path $defaultGoDir 'go.exe')
)

if (-not $npmPath) {
  Write-Host 'npm.cmd not found. Reinstall Node.js 20+ and run again.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path -LiteralPath $npmPath)) {
  Write-Host "npm.cmd path is invalid: $npmPath" -ForegroundColor Red
  exit 1
}

$npmCmdEscaped = "`"$npmPath`""
if (-not $nodeExePath) {
  Write-Host 'node.exe not found рядом с npm.cmd. Reinstall Node.js 20+ and run again.' -ForegroundColor Red
  exit 1
}

# Важно: *.cmd из node_modules/.bin (next.cmd, tsc.cmd, etc.) часто вызывают `node` по PATH.
# Поэтому добавляем папку node.exe в PATH, даже если глобальный PATH/PATHEXT поврежден.
$nodeDir = Split-Path -Parent $nodeExePath
if ($nodeDir -and ($env:PATH -notlike "*$nodeDir*")) {
  $env:PATH = "$nodeDir;$env:PATH"
}

# Иногда в системе поврежден PATHEXT, из-за чего команды без расширения не находятся (node/tsc/next).
# Фиксируем PATHEXT для текущего процесса (и всех дочерних cmd.exe).
$defaultPathext = '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC'
$pathext = [string]$env:PATHEXT
if ([string]::IsNullOrWhiteSpace($pathext) -or ($pathext -notmatch '\\.EXE') -or ($pathext -notmatch '\\.CMD')) {
  $env:PATHEXT = $defaultPathext
  Write-Host "PATHEXT was fixed for this run: $defaultPathext" -ForegroundColor Yellow
}

function Invoke-CmdLine {
  param(
    [Parameter(Mandatory = $true)][string]$CommandLine,
    [string]$WorkingDirectory = $root
  )

  $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $CommandLine) -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
  return [int]$proc.ExitCode
}

function Invoke-Exe {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$WorkingDirectory = $root
  )

  $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
  return [int]$proc.ExitCode
}

$stopScript = Join-Path $root 'scripts\windows\STOP.ps1'
$cleanupScript = Join-Path $root 'scripts\cleanup-safe.ps1'

if (Test-Path $stopScript) {
  Write-Host '[1/6] Stopping running services...' -ForegroundColor Green
  & $stopScript
}

Write-Host '[2/6] Cleaning build artifacts and old binaries...' -ForegroundColor Green
& $cleanupScript -SkipRunningCheck

Write-Host '[3/6] Installing dependencies...' -ForegroundColor Green
if ($UseCiInstall -and (Test-Path (Join-Path $root 'package-lock.json'))) {
  $exitCode = Invoke-CmdLine "$npmCmdEscaped ci"
} else {
  $exitCode = Invoke-CmdLine "$npmCmdEscaped install"
}
if ($exitCode -ne 0) { exit $exitCode }

Write-Host '[4/6] TypeScript check...' -ForegroundColor Green
$exitCode = Invoke-CmdLine "$npmCmdEscaped run typecheck"
if ($exitCode -ne 0) { exit $exitCode }

Write-Host '[5/6] Production build...' -ForegroundColor Green
$exitCode = Invoke-CmdLine "$npmCmdEscaped run build"
if ($exitCode -ne 0) { exit $exitCode }

Write-Host '[6/6] Telegram worker dry check (disabled)...' -ForegroundColor Green
$oldTelegramEnabled = $env:TELEGRAM_BOT_ENABLED
$env:TELEGRAM_BOT_ENABLED = 'false'
$botScript = Join-Path $root 'telegram-bot\worker.mjs'
# Важно: путь может содержать пробелы/кириллицу, поэтому явно квотим аргумент.
$exitCode = Invoke-Exe -FilePath $nodeExePath -Arguments @("`"$botScript`"") -WorkingDirectory $root
if ($null -eq $oldTelegramEnabled) {
  Remove-Item Env:\TELEGRAM_BOT_ENABLED -ErrorAction SilentlyContinue
} else {
  $env:TELEGRAM_BOT_ENABLED = $oldTelegramEnabled
}
if ($exitCode -ne 0) { exit $exitCode }

if (-not $SkipGoBuild) {
  if ($goPath) {
    Write-Host '[Optional] Go build check...' -ForegroundColor Green
    $exitCode = Invoke-Exe -FilePath $goPath -Arguments @('build', './...') -WorkingDirectory (Join-Path $root 'backend-go')
    if ($exitCode -ne 0) { exit $exitCode }
  } else {
    Write-Host '[Optional] Go is not installed. Skipping go build.' -ForegroundColor Yellow
  }
}

Write-Host 'Rebuild completed successfully.' -ForegroundColor Green
