[CmdletBinding()]
param(
    [string]$HostAddress = "127.0.0.1",
    [int]$FrontendPort = 5173,
    [int]$ApiPort = 8787,
    [int]$StartupTimeoutSeconds = 90,
    [switch]$Restart
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
                return
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
    throw "$ServiceName did not become ready at $Url.`n$details"
}

function Stop-PortProcess {
    param([int]$Port)
    $processIds = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $processIds) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

Set-Location $ProjectRoot
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd was not found. Install Node.js and reopen PowerShell."
}
if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
    throw "cargo.exe was not found. Install the Rust toolchain and reopen PowerShell."
}

# The API requires PostgreSQL. Start an installed Windows service when possible.
if (-not (Test-TcpPort 5432)) {
    $postgresService = Get-Service -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^postgresql' } |
        Select-Object -First 1
    if ($postgresService -and $postgresService.Status -ne "Running") {
        Write-Host "Starting PostgreSQL service $($postgresService.Name)..."
        Start-Service $postgresService.Name
        $postgresService.WaitForStatus("Running", [TimeSpan]::FromSeconds(20))
    }
}
if (-not (Test-TcpPort 5432)) {
    throw "PostgreSQL is not listening on port 5432. Start PostgreSQL before running this script."
}

if ($Restart) {
    Stop-PortProcess $FrontendPort
    Stop-PortProcess $ApiPort
    Start-Sleep -Milliseconds 500
}

$apiOut = Join-Path $LogDir "api.out.log"
$apiErr = Join-Path $LogDir "api.error.log"
$webOut = Join-Path $LogDir "web.out.log"
$webErr = Join-Path $LogDir "web.error.log"

if (-not (Test-TcpPort $ApiPort)) {
    Write-Host "Starting API on http://${HostAddress}:${ApiPort}..."
    $apiEnvironment = @{
        API_HOST = $HostAddress
        API_PORT = $ApiPort.ToString()
        CLIENT_ORIGIN = "http://${HostAddress}:${FrontendPort}"
    }
    foreach ($entry in $apiEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, "Process")
    }
    Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "api") `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden `
        -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr | Out-Null
} else {
    Write-Host "API port $ApiPort is already in use; reusing the running service."
}
Wait-HttpReady "http://${HostAddress}:${ApiPort}/health/ready" "API" $apiErr

if (-not (Test-TcpPort $FrontendPort)) {
    Write-Host "Starting frontend on http://${HostAddress}:${FrontendPort}..."
    Start-Process -FilePath "npm.cmd" `
        -ArgumentList @("run", "dev", "--", "--host", $HostAddress, "--port", $FrontendPort.ToString(), "--strictPort") `
        -WorkingDirectory $ProjectRoot -WindowStyle Hidden `
        -RedirectStandardOutput $webOut -RedirectStandardError $webErr | Out-Null
} else {
    Write-Host "Frontend port $FrontendPort is already in use; reusing the running service."
}
Wait-HttpReady "http://${HostAddress}:${FrontendPort}/" "Frontend" $webErr

Write-Host ""
Write-Host "Development services are ready." -ForegroundColor Green
Write-Host "Frontend: http://${HostAddress}:${FrontendPort}/"
Write-Host "API:      http://${HostAddress}:${ApiPort}/health/ready"
Write-Host "Logs:     $LogDir"
