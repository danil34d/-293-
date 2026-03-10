param(
  [string]$BaseUrl = 'http://localhost:3000',
  [string]$BackendHealthUrl = 'http://127.0.0.1:8080/health',
  [string]$AdminUser = 'admin',
  [string]$AdminPassword = 'admin',
  [string]$UseGoBackend = ''
)

$ErrorActionPreference = 'Continue'

function Get-EnvValueFromFile {
  param(
    [string]$FilePath,
    [string]$Key
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    return $null
  }

  $line = Get-Content -LiteralPath $FilePath -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$Key\s*=" } |
    Select-Object -First 1

  if (-not $line) {
    return $null
  }

  $value = ($line -replace "^\s*$Key\s*=\s*", '').Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Resolve-UseGoBackend {
  param([string]$ExplicitValue)

  if ($ExplicitValue) {
    return $ExplicitValue.Trim().ToLowerInvariant() -eq 'true'
  }

  if ($env:USE_GO_BACKEND) {
    return $env:USE_GO_BACKEND.Trim().ToLowerInvariant() -eq 'true'
  }

  $envFile = Join-Path (Get-Location) '.env.local'
  $fromFile = Get-EnvValueFromFile -FilePath $envFile -Key 'USE_GO_BACKEND'
  if ($fromFile) {
    return $fromFile.Trim().ToLowerInvariant() -eq 'true'
  }

  return $false
}

function Test-HttpStatus {
  param(
    [string]$Url,
    [string]$Method = 'GET',
    [object]$Body = $null,
    [string]$ContentType = '',
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
  )

  try {
    $requestParams = @{
      Uri                = $Url
      Method             = $Method
      UseBasicParsing    = $true
      MaximumRedirection = 0
      ErrorAction        = 'Stop'
    }

    if ($null -ne $Session) {
      $requestParams['WebSession'] = $Session
    }
    if ($null -ne $Body) {
      $requestParams['Body'] = $Body
    }
    if ($ContentType) {
      $requestParams['ContentType'] = $ContentType
    }

    $resp = Invoke-WebRequest @requestParams
    return [int]$resp.StatusCode
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    return -1
  }
}

$pageRoutes = @(
  '/dashboard',
  '/employee/workstation',
  '/wash-log',
  '/employees',
  '/schedule',
  '/schedule/planning',
  '/counter-agents',
  '/aggregators',
  '/salary-schemes',
  '/expenses',
  '/inventory',
  '/calculator',
  '/settings',
  '/transactions',
  '/salary-report',
  '/client-analytics',
  '/invoices'
)

$apiRoutes = @(
  '/api/employees',
  '/api/counter-agents',
  '/api/aggregators',
  '/api/wash-events',
  '/api/expenses',
  '/api/salary-schemes',
  '/api/shifts',
  '/api/schedule-plans',
  '/api/retail-price-list',
  '/api/inventory',
  '/api/stock-movements',
  '/api/chemical-config'
)

$issues = New-Object System.Collections.Generic.List[string]
$resolvedUseGoBackend = Resolve-UseGoBackend -ExplicitValue $UseGoBackend

Write-Host "== Carwash health check =="
Write-Host "Base URL: $BaseUrl"
Write-Host "USE_GO_BACKEND: $resolvedUseGoBackend"
Write-Host ""

foreach ($route in $pageRoutes) {
  $code = Test-HttpStatus -Url ($BaseUrl + $route)
  Write-Host ("PAGE " + $route + " -> " + $code)
  if ($code -ge 500 -or $code -eq -1) {
    $issues.Add("Page failed: $route ($code)")
  }
}

foreach ($route in $apiRoutes) {
  $code = Test-HttpStatus -Url ($BaseUrl + $route)
  Write-Host ("API  " + $route + " -> " + $code)
  if ($code -ge 500 -or $code -eq -1) {
    $issues.Add("API failed: $route ($code)")
  }
}

$unauthorizedCode = Test-HttpStatus -Url ($BaseUrl + '/api/auth/me')
Write-Host ("API  /api/auth/me (without auth) -> " + $unauthorizedCode)
if ($unauthorizedCode -ne 401) {
  $issues.Add("/api/auth/me expected 401 without auth, got $unauthorizedCode")
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ username = $AdminUser; password = $AdminPassword } | ConvertTo-Json
$loginCode = Test-HttpStatus -Url ($BaseUrl + '/api/auth/login') -Method 'POST' -Body $loginBody -ContentType 'application/json' -Session $session
Write-Host ("API  /api/auth/login (valid creds) -> " + $loginCode)
if ($loginCode -ne 200) {
  $issues.Add("/api/auth/login expected 200 with valid credentials, got $loginCode")
}

$invalidJsonCode = Test-HttpStatus -Url ($BaseUrl + '/api/auth/login') -Method 'POST' -Body 'not-json' -ContentType 'application/json'
Write-Host ("API  /api/auth/login (invalid json) -> " + $invalidJsonCode)
if ($invalidJsonCode -ne 400) {
  $issues.Add("/api/auth/login expected 400 on invalid JSON, got $invalidJsonCode")
}

if ($resolvedUseGoBackend) {
  $backendCode = Test-HttpStatus -Url $BackendHealthUrl
  Write-Host ("BACK " + $BackendHealthUrl + " -> " + $backendCode)
  if ($backendCode -ge 500 -or $backendCode -eq -1) {
    $issues.Add("Backend health failed: $BackendHealthUrl ($backendCode)")
  }
} else {
  Write-Host 'BACK check skipped (USE_GO_BACKEND=false)'
}

Write-Host ""
if ($issues.Count -eq 0) {
  Write-Host "Result: OK. No critical issues found."
  exit 0
}

Write-Host "Result: FAIL. Issues found:" -ForegroundColor Red
foreach ($issue in $issues) {
  Write-Host ("- " + $issue) -ForegroundColor Red
}
exit 1
