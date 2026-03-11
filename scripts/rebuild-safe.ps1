$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $scriptDir 'windows\rebuild-safe.ps1'

if (-not (Test-Path -LiteralPath $target)) {
  throw "Missing script: $target"
}

& $target @args
exit $LASTEXITCODE
