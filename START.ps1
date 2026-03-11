$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $root 'scripts\windows\START.ps1'

if (-not (Test-Path -LiteralPath $target)) {
  throw "Missing script: $target"
}

& $target @args
exit $LASTEXITCODE
