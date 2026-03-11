$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $scriptDir 'windows\health-check.ps1'

if (-not (Test-Path -LiteralPath $target)) {
  throw "Missing script: $target"
}

& $target @args
exit $LASTEXITCODE
