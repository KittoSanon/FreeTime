param(
    [ValidateSet('Backend', 'Frontend')]
    [string]$Service
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$backendVenv = Join-Path $root 'Backend\.venv'
$backendPython = Join-Path $backendVenv 'Scripts\python.exe'
$frontendRoot = Join-Path $root 'Frontend'

if ($Service -eq 'Backend') {
    Set-Location -LiteralPath $root
    & $backendPython -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir Backend
    exit $LASTEXITCODE
}

if ($Service -eq 'Frontend') {
    $npmCommand = Get-Command npm.cmd -ErrorAction Stop
    Set-Location -LiteralPath $frontendRoot
    & $npmCommand.Source run dev -- --host 127.0.0.1
    exit $LASTEXITCODE
}

if (-not (Test-Path $backendPython)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        throw 'Python was not found. Install Python, then run this launcher again.'
    }

    & $pythonCommand.Source -m venv $backendVenv
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not create the backend virtual environment.'
    }
}

$sitePackages = Join-Path $backendVenv 'Lib\site-packages'
$requiredPackages = @('fastapi', 'uvicorn', 'sqlalchemy', 'dotenv', 'pymysql')
$missingPackages = @($requiredPackages | Where-Object { -not (Test-Path (Join-Path $sitePackages $_)) })
if ($missingPackages.Count -gt 0) {
    & $backendPython -m pip install -r (Join-Path $root 'Backend\requirements.txt')
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not install backend dependencies.'
    }
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    throw 'npm was not found. Install Node.js, then run this launcher again.'
}

if (-not (Test-Path (Join-Path $frontendRoot 'node_modules'))) {
    Push-Location $frontendRoot
    try {
        & $npmCommand.Source ci
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not install frontend dependencies.'
        }
    } finally {
        Pop-Location
    }
}

$launcher = '"' + $PSCommandPath + '"'
Write-Host 'Starting FreeTime. Keep both PowerShell windows open.'
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $root -ArgumentList @(
    '-NoExit', '-File', $launcher, '-Service', 'Backend'
)
Start-Process -FilePath 'powershell.exe' -WorkingDirectory $root -ArgumentList @(
    '-NoExit', '-File', $launcher, '-Service', 'Frontend'
)
Write-Host 'Open http://127.0.0.1:5173 after the frontend window is ready.'
