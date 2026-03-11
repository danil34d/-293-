param(
  [switch]$SkipRunningCheck
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$normalizedRoot = $root.ToLowerInvariant()
Set-Location $root

function Get-ProjectProcesses {
  return Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalizedRoot)
  }
}

function Remove-PathIfExists {
  param(
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $absolutePath = Join-Path $root $RelativePath
  if (-not (Test-Path -LiteralPath $absolutePath)) {
    return $false
  }

  Remove-Item -LiteralPath $absolutePath -Recurse -Force
  Write-Host "Removed $RelativePath"
  return $true
}

if (-not $SkipRunningCheck) {
  $running = Get-ProjectProcesses | Where-Object {
    $_.Name -in @('node.exe', 'cmd.exe', 'go.exe', 'powershell.exe', 'pwsh.exe')
  }

  if ($running) {
    Write-Host 'Cleanup refused: project processes from this workspace are still running.' -ForegroundColor Red
    foreach ($proc in ($running | Select-Object ProcessId, Name, CommandLine)) {
      Write-Host ("- PID {0} [{1}] {2}" -f $proc.ProcessId, $proc.Name, $proc.CommandLine) -ForegroundColor Yellow
    }
    Write-Host 'Run STOP.ps1 first or rerun with -SkipRunningCheck.' -ForegroundColor Yellow
    exit 1
  }
}

$targets = @(
  '.next',
  '.next-runtime',
  '.next-runtime-v2',
  'temp',
  'tsconfig.tsbuildinfo',
  'tsconfig.typecheck.tsbuildinfo',
  'backend-go/server',
  'backend-go/server.exe',
  'tools/__pycache__'
)

$removedAny = $false
foreach ($target in $targets) {
  if (Remove-PathIfExists -RelativePath $target) {
    $removedAny = $true
  }
}

$extraPyCaches = Get-ChildItem -LiteralPath $root -Recurse -Directory -Force -Filter '__pycache__' -ErrorAction SilentlyContinue |
  Where-Object {
    $_.FullName -notlike '*\node_modules\*' -and
    $_.FullName -notlike '*\.git\*' -and
    $_.FullName -ne (Join-Path $root 'tools\__pycache__')
  }

foreach ($cacheDir in $extraPyCaches) {
  Remove-Item -LiteralPath $cacheDir.FullName -Recurse -Force
  Write-Host ("Removed " + $cacheDir.FullName.Substring($root.Length + 1))
  $removedAny = $true
}

if (-not $removedAny) {
  Write-Host 'Nothing to clean.'
  exit 0
}

Write-Host 'Cleanup completed successfully.' -ForegroundColor Green
