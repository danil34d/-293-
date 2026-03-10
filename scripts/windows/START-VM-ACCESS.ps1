$ErrorActionPreference = 'Stop'

# Корень проекта — на 2 уровня выше scripts/windows/
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $scriptDir)
Set-Location $root

$vmName = 'Ubuntu-24.04.4-Server'
$vmUser = 'danil'
$userProfile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
$sshKeyPath = Join-Path $userProfile '.ssh\carwash_vm_ed25519'
$listenAddress = '127.0.0.1'
$webPort = 13000
$sshPort = 12222

$pidFile = Join-Path $env:TEMP 'carwash_vm_access.pid'
$stateFile = Join-Path $env:TEMP 'carwash_vm_access.json'
$logFile = Join-Path $env:TEMP 'carwash_vm_access.log'
$errFile = Join-Path $env:TEMP 'carwash_vm_access.err.log'

function Resolve-ExecutablePath {
  param(
    [string]$CommandName,
    [string[]]$FallbackPaths = @()
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

function Remove-StaleTunnelProcesses {
  param(
    [string]$SshExePath,
    [int]$ExpectedWebPort,
    [int]$ExpectedSshPort
  )

  if (Test-Path -LiteralPath $pidFile) {
    try {
      $oldPid = [int](Get-Content -LiteralPath $pidFile -ErrorAction Stop | Select-Object -First 1)
      if ($oldPid -gt 0) {
        Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped previous VM access PID $oldPid"
      }
    } catch {
      Write-Host 'Could not stop previous VM access by PID file.' -ForegroundColor Yellow
    } finally {
      Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    }
  }

  $expectedSnippets = @(
    "-L $listenAddress`:$ExpectedWebPort`:`127.0.0.1`:3000",
    "-L $listenAddress`:$ExpectedSshPort`:`127.0.0.1`:22"
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

function Get-PortListenerInfo {
  param(
    [int]$Port
  )

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
  if (-not $listeners) {
    return @()
  }

  $items = @()
  foreach ($listener in $listeners) {
    $procId = [int]$listener.OwningProcess
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
    $items += [pscustomobject]@{
      ProcessId = $procId
      Name = if ($proc) { [string]$proc.Name } else { 'unknown' }
      CommandLine = if ($proc) { [string]$proc.CommandLine } else { '' }
    }
  }

  return $items
}

function Assert-PortAvailable {
  param(
    [int]$Port
  )

  $listeners = Get-PortListenerInfo -Port $Port
  if (-not $listeners -or $listeners.Count -eq 0) {
    return
  }

  Write-Host "Local port $Port is already in use:" -ForegroundColor Red
  foreach ($listener in $listeners) {
    $display = if ([string]::IsNullOrWhiteSpace($listener.CommandLine)) {
      "PID $($listener.ProcessId) [$($listener.Name)]"
    } else {
      "PID $($listener.ProcessId) [$($listener.Name)] $($listener.CommandLine)"
    }
    Write-Host "  $display"
  }

  throw "Port $Port is busy."
}

function Get-GuestCandidatesFromNeighbors {
  param(
    [string]$VmName
  )

  $adapter = Get-VMNetworkAdapter -VMName $VmName -ErrorAction Stop
  $mac = ($adapter.MacAddress -replace '..(?!$)', '$0-').ToUpperInvariant()
  $neighborCandidates = Get-NetNeighbor -InterfaceAlias 'vEthernet (Default Switch)' -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.LinkLayerAddress -eq $mac -and
      $_.IPAddress -notlike '255.*'
    } |
    Select-Object -ExpandProperty IPAddress -Unique

  return @($neighborCandidates)
}

function Get-LastKnownGuestIp {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    return $null
  }

  try {
    $state = Get-Content -LiteralPath $stateFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($state -and $state.guestIp) {
      return [string]$state.guestIp
    }
  } catch {
    return $null
  }

  return $null
}

function Resolve-GuestIp {
  param(
    [string]$VmName,
    [int]$TimeoutSec = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $candidates = New-Object System.Collections.Generic.List[string]

    $lastKnown = Get-LastKnownGuestIp
    if ($lastKnown) {
      [void]$candidates.Add($lastKnown)
    }

    foreach ($candidate in (Get-GuestCandidatesFromNeighbors -VmName $VmName)) {
      if (-not [string]::IsNullOrWhiteSpace($candidate) -and -not $candidates.Contains($candidate)) {
        [void]$candidates.Add($candidate)
      }
    }

    foreach ($candidate in $candidates) {
      if ($candidate -and (Test-NetConnection $candidate -Port 22 -WarningAction SilentlyContinue -InformationLevel Quiet)) {
        return $candidate
      }
    }

    Start-Sleep -Seconds 2
  }

  throw "Could not resolve a reachable IPv4 for VM '$VmName'."
}

function Wait-UntilReady {
  param(
    [int]$TimeoutSec = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $webReady = $false
    $sshReady = $false

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://$listenAddress`:$webPort/login" -TimeoutSec 4
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        $webReady = $true
      }
    } catch {
      $webReady = $false
    }

    try {
      $sshReady = [bool](Test-NetConnection $listenAddress -Port $sshPort -WarningAction SilentlyContinue -InformationLevel Quiet)
    } catch {
      $sshReady = $false
    }

    if ($webReady -and $sshReady) {
      return $true
    }

    Start-Sleep -Milliseconds 800
  }

  return $false
}

$sshExe = Resolve-ExecutablePath -CommandName 'ssh' -FallbackPaths @(
  'C:\Windows\System32\OpenSSH\ssh.exe'
)

if (-not $sshExe) {
  throw 'ssh.exe not found.'
}

if (-not (Test-Path -LiteralPath $sshKeyPath)) {
  throw "SSH key not found: $sshKeyPath"
}

Remove-StaleTunnelProcesses -SshExePath $sshExe -ExpectedWebPort $webPort -ExpectedSshPort $sshPort
Assert-PortAvailable -Port $webPort
Assert-PortAvailable -Port $sshPort

$guestIp = Resolve-GuestIp -VmName $vmName

Remove-Item -LiteralPath $logFile,$errFile -Force -ErrorAction SilentlyContinue

$arguments = @(
  '-N',
  '-o', 'ExitOnForwardFailure=yes',
  '-o', 'ServerAliveInterval=30',
  '-o', 'ServerAliveCountMax=3',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-i', ('"{0}"' -f $sshKeyPath),
  '-L', "$listenAddress`:$webPort`:127.0.0.1`:3000",
  '-L', "$listenAddress`:$sshPort`:127.0.0.1`:22",
  "$vmUser@$guestIp"
)

$proc = Start-Process `
  -FilePath $sshExe `
  -ArgumentList $arguments `
  -WorkingDirectory $root `
  -WindowStyle Minimized `
  -RedirectStandardOutput $logFile `
  -RedirectStandardError $errFile `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ascii

if (-not (Wait-UntilReady -TimeoutSec 25)) {
  $errPreview = if (Test-Path -LiteralPath $errFile) {
    Get-Content -LiteralPath $errFile -Tail 20 -ErrorAction SilentlyContinue | Out-String
  } else {
    ''
  }

  throw "VM access tunnel did not become ready.`n$errPreview"
}

$state = [pscustomobject]@{
  vmName = $vmName
  guestIp = $guestIp
  webPort = $webPort
  sshPort = $sshPort
  pid = $proc.Id
  startedAt = (Get-Date).ToString('s')
}

$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding ascii

Write-Host "VM access tunnel PID: $($proc.Id)"
Write-Host "Resolved VM IP: $guestIp"
Write-Host "Web: http://$listenAddress`:$webPort/login" -ForegroundColor Green
Write-Host "SSH: ssh -p $sshPort -i `"$sshKeyPath`" $vmUser@$listenAddress" -ForegroundColor Green
Write-Host "Logs: $logFile"
