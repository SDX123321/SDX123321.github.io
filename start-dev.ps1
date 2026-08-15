[CmdletBinding()]
param(
    [string]$HostAddress = "127.0.0.1",
    [int]$FrontendPort = 5173,
    [int]$ApiPort = 8787,
    [int]$StartupTimeoutSeconds = 45,
    [switch]$Restart,
    [switch]$SkipApi,
    [switch]$RequirePostgres,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "tmp\dev-services"

function Test-TcpPort {
    param([int]$Port)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync("127.0.0.1", $Port)
        return $task.Wait(500) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [string]$ServiceName,
        [string]$ErrorLog
    )

    $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                return $true
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)

    $details = if (Test-Path $ErrorLog) {
        (Get-Content $ErrorLog -Tail 30) -join [Environment]::NewLine
    } else {
        "No error log was produced."
    }
    Write-Warning "$ServiceName did not become ready at $Url within $StartupTimeoutSeconds seconds.`nLog snippet:`n$details"
    return $false
}

function Stop-PortProcess {
    param([int]$Port)
    try {
        $processIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($processId in $processIds) {
            if ($processId -gt 0) {
                Write-Host "Stopping process $processId listening on port $Port..." -ForegroundColor Yellow
                Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
            }
        }
    }
    catch {
        Write-Warning "Could not stop process on port ${Port}: $_"
    }
}

Set-Location $ProjectRoot
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# 1. Verify Node / npm environment
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npmCmd) {
    throw "npm was not found in PATH. Please install Node.js and restart PowerShell."
}

# 2. Restart handling if requested
if ($Restart) {
    Stop-PortProcess $FrontendPort
    if (-not $SkipApi) {
        Stop-PortProcess $ApiPort
    }
    Start-Sleep -Milliseconds 500
}

$apiOut = Join-Path $LogDir "api.out.log"
$apiErr = Join-Path $LogDir "api.error.log"
$webOut = Join-Path $LogDir "web.out.log"
$webErr = Join-Path $LogDir "web.error.log"

# 3. Optional PostgreSQL & API startup logic
$apiRunning = $false
if (-not $SkipApi) {
    # Check PostgreSQL readiness
    $pgReady = Test-TcpPort 5432
    if (-not $pgReady) {
        $postgresService = Get-Service -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^postgresql' } |
            Select-Object -First 1
        if ($postgresService -and $postgresService.Status -ne "Running") {
            Write-Host "Attempting to start PostgreSQL service '$($postgresService.Name)'..." -ForegroundColor Yellow
            try {
                Start-Service $postgresService.Name
                $postgresService.WaitForStatus("Running", [TimeSpan]::FromSeconds(15))
                $pgReady = Test-TcpPort 5432
            }
            catch {
                Write-Warning "Could not automatically start PostgreSQL service: $_"
            }
        }
    }

    if (-not $pgReady) {
        if ($RequirePostgres) {
            throw "PostgreSQL is not listening on port 5432. -RequirePostgres flag was set."
        } else {
            Write-Host "[NOTICE] PostgreSQL (port 5432) is not active. API backend start skipped." -ForegroundColor Yellow
            Write-Host "         Frontend static review system will operate independently." -ForegroundColor Gray
        }
    } else {
        # Check Rust cargo availability
        $cargoCmd = Get-Command cargo.exe -ErrorAction SilentlyContinue
        if (-not $cargoCmd) {
            $cargoCmd = Get-Command cargo -ErrorAction SilentlyContinue
        }

        if (-not $cargoCmd) {
            Write-Warning "cargo is not installed. API backend (Rust) start skipped."
        } else {
            if (-not (Test-TcpPort $ApiPort)) {
                Write-Host "Starting API backend on http://${HostAddress}:${ApiPort}..." -ForegroundColor Cyan
                $apiEnvironment = @{
                    API_HOST = $HostAddress
                    API_PORT = $ApiPort.ToString()
                    CLIENT_ORIGIN = "http://${HostAddress}:${FrontendPort}"
                }
                foreach ($entry in $apiEnvironment.GetEnumerator()) {
                    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
                }
                Start-Process -FilePath $npmCmd.Path -ArgumentList @("run", "api") `
                    -WorkingDirectory $ProjectRoot -WindowStyle Hidden `
                    -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr | Out-Null
            } else {
                Write-Host "API port $ApiPort is already in use; reusing running service." -ForegroundColor DarkGray
            }
            $apiRunning = Wait-HttpReady "http://${HostAddress}:${ApiPort}/health/ready" "API" $apiErr
        }
    }
}

# 4. Frontend Startup logic
if (-not (Test-TcpPort $FrontendPort)) {
    Write-Host "Starting Vite frontend on http://${HostAddress}:${FrontendPort}..." -ForegroundColor Cyan
    Start-Process -FilePath $npmCmd.Path `
        -ArgumentList @("run", "dev", "--", "--host", $HostAddress, "--port", $FrontendPort.ToString(), "--strictPort") `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden `
        -RedirectStandardOutput $webOut -RedirectStandardError $webErr | Out-Null
} else {
    Write-Host "Frontend port $FrontendPort is already in use; reusing running service." -ForegroundColor DarkGray
}

$webReady = Wait-HttpReady "http://${HostAddress}:${FrontendPort}/" "Frontend" $webErr

if (-not $webReady) {
    throw "Frontend failed to start on http://${HostAddress}:${FrontendPort}/. Check log at $webErr"
}

# 5. Output Summary
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Development services are ready!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Frontend:  http://${HostAddress}:${FrontendPort}/" -ForegroundColor White

if ($apiRunning) {
    Write-Host "  API:       http://${HostAddress}:${ApiPort}/health/ready" -ForegroundColor White
} else {
    Write-Host "  API:       [Disabled / PostgreSQL Offline]" -ForegroundColor DarkGray
}
Write-Host "  Logs Dir:  $LogDir" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Green

if ($OpenBrowser) {
    Start-Process "http://${HostAddress}:${FrontendPort}/"
}
