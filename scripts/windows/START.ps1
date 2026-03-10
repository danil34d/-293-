$ErrorActionPreference = 'Stop'

# Корень проекта — на 2 уровня выше scripts/windows/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $scriptDir)
$normalizedRoot = $root.ToLowerInvariant()
Set-Location $root

$defaultNodeDir = 'C:\Program Files\nodejs'
$defaultGoDir = 'C:\Program Files\Go\bin'

function Get-EnvValueFromFile {
  param(
    [string]$FilePath,
    [string]$Key,
    [string]$DefaultValue = ''
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    return $DefaultValue
  }

  $line = Get-Content -LiteralPath $FilePath -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$Key\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $DefaultValue
  }

  $value = ($line -replace "^\s*$Key\s*=\s*", '').Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  return $value
}

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

function Get-ListeningProcessInfos {
  param(
    [int[]]$Ports
  )

  $results = @()
  $processCache = @{}

  foreach ($port in ($Ports | Where-Object { $_ -gt 0 } | Select-Object -Unique)) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      $processId = [int]$connection.OwningProcess
      if (-not $processCache.ContainsKey($processId)) {
        $processCache[$processId] = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
      }

      $processInfo = $processCache[$processId]
      $results += [pscustomobject]@{
        Port = [int]$port
        ProcessId = $processId
        Name = if ($processInfo) { [string]$processInfo.Name } else { 'unknown' }
        CommandLine = if ($processInfo) { [string]$processInfo.CommandLine } else { '' }
      }
    }
  }

  return $results | Sort-Object Port, ProcessId -Unique
}

function Test-PortFree {
  param(
    [int]$Port
  )

  return -not [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Format-PortOwner {
  param(
    [Parameter(Mandatory = $true)]$Info
  )

  $commandLine = [string]$Info.CommandLine
  if ($commandLine.Length -gt 120) {
    $commandLine = $commandLine.Substring(0, 117) + '...'
  }
  if ([string]::IsNullOrWhiteSpace($commandLine)) {
    return "PID $($Info.ProcessId) [$($Info.Name)]"
  }

  return "PID $($Info.ProcessId) [$($Info.Name)] $commandLine"
}

function Resolve-FreePort {
  param(
    [int]$PreferredPort,
    [int[]]$FallbackPorts,
    [string]$Label
  )

  if (Test-PortFree -Port $PreferredPort) {
    return $PreferredPort
  }

  $occupiedPreferred = Get-ListeningProcessInfos -Ports @($PreferredPort)
  Write-Host "$Label port $PreferredPort is busy." -ForegroundColor Yellow
  foreach ($item in $occupiedPreferred) {
    Write-Host "  - $(Format-PortOwner -Info $item)" -ForegroundColor Yellow
  }

  foreach ($candidate in ($FallbackPorts | Where-Object { $_ -ne $PreferredPort } | Select-Object -Unique)) {
    if (Test-PortFree -Port $candidate) {
      Write-Host "$Label will use port $candidate for this run." -ForegroundColor Yellow
      return $candidate
    }
  }

  $allPorts = @($PreferredPort) + $FallbackPorts
  $occupiedAll = Get-ListeningProcessInfos -Ports $allPorts
  Write-Host "$Label could not find a free port in the allowed range." -ForegroundColor Red
  foreach ($item in $occupiedAll) {
    Write-Host "  - port $($item.Port): $(Format-PortOwner -Info $item)" -ForegroundColor Red
  }

  exit 1
}

function Get-PortFromUrl {
  param(
    [string]$Url,
    [int]$DefaultPort
  )

  try {
    $uri = [System.Uri]$Url
    if ($uri.Port -gt 0) {
      return [int]$uri.Port
    }
  } catch {
  }

  return $DefaultPort
}

function Set-PortInUrl {
  param(
    [string]$Url,
    [int]$Port,
    [string]$FallbackHost = '127.0.0.1'
  )

  try {
    $uri = [System.Uri]$Url
    $builder = [System.UriBuilder]::new($uri)
    $builder.Port = $Port
    return $builder.Uri.AbsoluteUri.TrimEnd('/')
  } catch {
    return "http://${FallbackHost}:$Port"
  }
}

function Test-IsProjectCommandLine {
  param(
    [string]$CommandLine
  )

  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  return $CommandLine.ToLowerInvariant().Contains($normalizedRoot)
}

function Stop-StaleProjectProcesses {
  $listeningInfos = Get-ListeningProcessInfos -Ports @(3000, 3001, 3002, 3003, 3004, 3005, 8080, 8081, 8082, 8083, 8084, 8085)
  $projectPortProcesses = $listeningInfos | Where-Object { (Test-IsProjectCommandLine -CommandLine $_.CommandLine) }
  $staleBotProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and (Test-IsProjectCommandLine -CommandLine $_.CommandLine) -and (
      ($_.Name -eq 'node.exe' -and ($_.CommandLine -like '*telegram-bot/worker.mjs*' -or $_.CommandLine -like '*telegram-bot\worker.mjs*')) -or
      $_.CommandLine -like '*run bot:telegram*'
    )
  }

  $processMap = @{}

  foreach ($item in $projectPortProcesses) {
    if (-not $processMap.ContainsKey($item.ProcessId)) {
      $processMap[$item.ProcessId] = [pscustomobject]@{
        ProcessId = [int]$item.ProcessId
        Name = [string]$item.Name
        CommandLine = [string]$item.CommandLine
      }
    }
  }

  foreach ($proc in $staleBotProcesses) {
    $processId = [int]$proc.ProcessId
    if (-not $processMap.ContainsKey($processId)) {
      $processMap[$processId] = [pscustomobject]@{
        ProcessId = $processId
        Name = [string]$proc.Name
        CommandLine = [string]$proc.CommandLine
      }
    }
  }

  if ($processMap.Count -eq 0) {
    return
  }

  Write-Host 'Stopping previous project processes from this workspace...' -ForegroundColor Yellow
  foreach ($processInfo in ($processMap.Values | Sort-Object ProcessId)) {
    Stop-Process -Id $processInfo.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "  - stopped $(Format-PortOwner -Info $processInfo)" -ForegroundColor Yellow
  }

  $botPidFile = Join-Path $env:TEMP 'carwash_telegram_bot.pid'
  Remove-Item $botPidFile -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
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

# Важно: next.cmd и другие *.cmd из node_modules/.bin часто вызывают `node` по PATH.
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

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installing dependencies...' -ForegroundColor Yellow
  & cmd.exe /c "$npmCmdEscaped install"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

Stop-StaleProjectProcesses

$envFile = Join-Path $root '.env.local'
$useGoBackendRaw = Get-EnvValueFromFile -FilePath $envFile -Key 'USE_GO_BACKEND' -DefaultValue 'false'
$goBackendUrl = Get-EnvValueFromFile -FilePath $envFile -Key 'GO_BACKEND_URL' -DefaultValue 'http://127.0.0.1:8080'
$telegramBaseUrlFromFile = Get-EnvValueFromFile -FilePath $envFile -Key 'TELEGRAM_APP_BASE_URL' -DefaultValue ''
$useGoBackend = $useGoBackendRaw.Trim().ToLowerInvariant() -eq 'true'

$frontendPort = Resolve-FreePort -PreferredPort 3000 -FallbackPorts @(3001, 3002, 3003, 3004, 3005) -Label 'Frontend'
$frontendUrl = "http://localhost:$frontendPort"

if ($useGoBackend) {
  $preferredBackendPort = Get-PortFromUrl -Url $goBackendUrl -DefaultPort 8080
  $backendPort = Resolve-FreePort -PreferredPort $preferredBackendPort -FallbackPorts @(8080, 8081, 8082, 8083, 8084, 8085) -Label 'Go backend'
  $goBackendUrl = Set-PortInUrl -Url $goBackendUrl -Port $backendPort
} else {
  $backendPort = $null
}

$env:USE_GO_BACKEND = if ($useGoBackend) { 'true' } else { 'false' }
$env:GO_BACKEND_URL = $goBackendUrl
$env:PORT = [string]$frontendPort

$telegramBaseUrl = if (-not [string]::IsNullOrWhiteSpace($telegramBaseUrlFromFile)) {
  $telegramBaseUrlFromFile
} else {
  [string]$env:TELEGRAM_APP_BASE_URL
}

if ([string]::IsNullOrWhiteSpace($telegramBaseUrl)) {
  $env:TELEGRAM_APP_BASE_URL = "http://127.0.0.1:$frontendPort"
} else {
  $env:TELEGRAM_APP_BASE_URL = Set-PortInUrl -Url $telegramBaseUrl -Port $frontendPort -FallbackHost '127.0.0.1'
}

$backendLog = Join-Path $env:TEMP 'carwash_backend.log'
$backendErr = Join-Path $env:TEMP 'carwash_backend.err.log'
$backendDir = Join-Path $root 'backend-go'
$botLog = Join-Path $env:TEMP 'carwash_telegram_bot.log'
$botErr = Join-Path $env:TEMP 'carwash_telegram_bot.err.log'
$botPidFile = Join-Path $env:TEMP 'carwash_telegram_bot.pid'

if ($useGoBackend) {
  if (-not $goPath) {
    Write-Host 'USE_GO_BACKEND=true, но Go не найден. Установите Go 1.23+ или установите USE_GO_BACKEND=false.' -ForegroundColor Red
    exit 1
  }

  Write-Host "[1/3] Starting Go backend on port $backendPort..." -ForegroundColor Green
  Start-Process -FilePath 'cmd.exe' -ArgumentList "/c set `"PORT=$backendPort`" && `"$goPath`" run ./cmd/server" -WorkingDirectory $backendDir -WindowStyle Minimized -RedirectStandardOutput $backendLog -RedirectStandardError $backendErr
  Start-Sleep -Seconds 2
} else {
  Write-Host '[1/3] Go backend skipped (USE_GO_BACKEND=false).' -ForegroundColor Yellow
}

$env:PORT = [string]$frontendPort

Write-Host '[2/3] Starting Telegram worker...' -ForegroundColor Green
$botScript = Join-Path $root 'telegram-bot\worker.mjs'
$botProcess = Start-Process -FilePath $nodeExePath -ArgumentList "`"$botScript`"" -WorkingDirectory $root -WindowStyle Minimized -RedirectStandardOutput $botLog -RedirectStandardError $botErr -PassThru
Start-Sleep -Seconds 1

if ($botProcess -and -not $botProcess.HasExited) {
  Set-Content -Path $botPidFile -Value $botProcess.Id -Encoding ascii
  Write-Host "Telegram worker PID: $($botProcess.Id)"
} else {
  Remove-Item $botPidFile -ErrorAction SilentlyContinue
  Write-Host 'Telegram worker exited quickly (check env TELEGRAM_BOT_* if bot is expected to run).' -ForegroundColor Yellow
}

Write-Host '[3/3] Starting Next.js frontend...' -ForegroundColor Green
Write-Host "Frontend: $frontendUrl"
if ($useGoBackend) {
  Write-Host "Backend:  $($goBackendUrl.TrimEnd('/'))/health"
  Write-Host "Backend logs: $backendLog"
} else {
  Write-Host 'Backend:  Next.js API mode (local handlers)'
}
Write-Host "Telegram logs: $botLog"
Write-Host ''
Write-Host 'Use STOP.ps1 to stop all services.'
Write-Host ''

$nextCli = Join-Path $root 'node_modules\next\dist\bin\next'
if (Test-Path -LiteralPath $nextCli) {
  # Avoid relying on `next.cmd` shims, which may break if node is missing in PATH.
  & $nodeExePath $nextCli dev -p $frontendPort
  exit $LASTEXITCODE
}

& cmd.exe /c "$npmCmdEscaped run dev -- -p $frontendPort"
exit $LASTEXITCODE
