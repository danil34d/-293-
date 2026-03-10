param(
  # Where to save the resulting ZIP (default: Desktop).
  [string]$DestinationDir = '',

  # Include data-backups (migration backups).
  [switch]$IncludeDataBackups,

  # Include Telegram bot runtime state (data/telegram-bot/*).
  # Default is to exclude it to keep the archive "clean".
  [switch]$IncludeTelegramBotState
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir

if ([string]::IsNullOrWhiteSpace($DestinationDir)) {
  $DestinationDir = [Environment]::GetFolderPath('Desktop')
}

if (-not (Test-Path -LiteralPath $DestinationDir)) {
  throw "DestinationDir does not exist: $DestinationDir"
}

$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$staging = Join-Path $DestinationDir ("carwash_export_" + $stamp)
$projectFolder = Join-Path $staging 'carwash'
$zipPath = Join-Path $DestinationDir ("carwash_export_" + $stamp + ".zip")

New-Item -ItemType Directory -Force -Path $projectFolder | Out-Null

# Copy everything from the project root except heavy/generated/runtime folders.
$excludeTopLevel = @(
  '.git',
  'node_modules',
  '.next',
  '.next-test',
  '.next-runtime',
  '.next-runtime-v2',
  '.venv-ocr',
  '.vscode',
  'temp',
  '.run',
  'logs'
)

if (-not $IncludeDataBackups) {
  $excludeTopLevel += 'data-backups'
}

Get-ChildItem -LiteralPath $root -Force | ForEach-Object {
  if ($excludeTopLevel -contains $_.Name) { return }
  $dest = Join-Path $projectFolder $_.Name
  Copy-Item -LiteralPath $_.FullName -Destination $dest -Recurse -Force
}

# Remove secrets from the archive.
Remove-Item -LiteralPath (Join-Path $projectFolder '.env.local') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $projectFolder 'telegram-bot\.env.local') -Force -ErrorAction SilentlyContinue

# Optional: remove Telegram bot runtime state (it will be recreated on first run).
if (-not $IncludeTelegramBotState) {
  Remove-Item -LiteralPath (Join-Path $projectFolder 'data\telegram-bot') -Recurse -Force -ErrorAction SilentlyContinue
}

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
}

Compress-Archive -LiteralPath $projectFolder -DestinationPath $zipPath -Force

# Cleanup staging directory.
Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue

Write-Output $zipPath
