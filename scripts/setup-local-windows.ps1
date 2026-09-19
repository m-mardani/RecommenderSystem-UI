param(
  [string]$BackendPath = $env:BACKEND_PATH,
  [string]$ApiUrl = $(if ($env:API_URL) { $env:API_URL } else { "http://127.0.0.1:8000/api/v1" }),
  [int]$FrontendPort = $(if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 3000 }),
  [int]$BackendPort = $(if ($env:BACKEND_PORT) { [int]$env:BACKEND_PORT } else { 8000 }),
  [string]$BackendApp = $env:BACKEND_APP,
  [switch]$Prod,
  [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $ProjectRoot "frontend"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "[$(Get-Date -Format HH:mm:ss)] $Message" -ForegroundColor Cyan
}

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Install-WingetPackage {
  param(
    [string]$Id,
    [string]$Name
  )
  if (-not (Test-Command winget)) {
    throw "winget is not available. Install App Installer from Microsoft Store, then re-run this script."
  }
  Write-Step "Installing $Name with winget"
  winget install --id $Id --exact --accept-source-agreements --accept-package-agreements
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Ensure-Node22 {
  $major = 0
  if (Test-Command node) {
    try { $major = [int](& node -p "process.versions.node.split('.')[0]") } catch { $major = 0 }
  }
  if ($major -ge 22 -and (Test-Command npm)) {
    Write-Step "Node.js is ready: $(node --version)"
    return
  }

  Install-WingetPackage -Id "OpenJS.NodeJS" -Name "Node.js"
  Refresh-Path

  if (-not (Test-Command node) -or -not (Test-Command npm)) {
    throw "Node.js installation finished, but node/npm is not on PATH. Open a new PowerShell and re-run."
  }
  $major = [int](& node -p "process.versions.node.split('.')[0]")
  if ($major -lt 22) {
    throw "Node.js $(node --version) is installed, but this project needs Node.js 22+. Install Node 22+ and re-run."
  }
  Write-Step "Node.js is ready: $(node --version)"
}

function Ensure-WslForDocker {
  if ($SkipDocker) { return }

  if (Test-Command wsl) {
    return
  }

  if (-not (Test-Admin)) {
    Write-Warning "WSL is not available. Docker Desktop may request WSL setup. Re-run PowerShell as Administrator if Docker cannot start."
    return
  }

  Write-Step "Enabling Windows WSL features for Docker Desktop"
  dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
  dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

  try {
    wsl --install --no-distribution
  } catch {
    Write-Warning "WSL install command reported an issue. A Windows restart may be required before Docker can start."
  }
}

function Ensure-Docker {
  if ($SkipDocker) { return }

  if (-not (Test-Command docker)) {
    if (-not (Test-Admin)) {
      Write-Warning "Docker Desktop installation may require Administrator. If winget fails, re-run PowerShell as Administrator."
    }
    Install-WingetPackage -Id "Docker.DockerDesktop" -Name "Docker Desktop"
    Refresh-Path
  }

  if (-not (Test-Command docker)) {
    throw "Docker was installed, but docker is not on PATH. Open a new PowerShell and re-run."
  }

  try {
    docker info *> $null
    docker compose version *> $null
    Write-Step "Docker is ready: $(docker --version)"
    return
  } catch {
    Write-Step "Starting Docker Desktop"
    $dockerDesktop = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktop) {
      Start-Process $dockerDesktop | Out-Null
    } else {
      Start-Process "Docker Desktop" -ErrorAction SilentlyContinue | Out-Null
    }
  }

  $deadline = (Get-Date).AddMinutes(5)
  do {
    Start-Sleep -Seconds 5
    try {
      docker info *> $null
      docker compose version *> $null
      Write-Step "Docker is ready: $(docker --version)"
      return
    } catch {
      Write-Host "Waiting for Docker engine..."
    }
  } while ((Get-Date) -lt $deadline)

  throw "Docker Desktop is installed but the engine did not start. Start Docker Desktop manually, finish any WSL/reboot prompt, then re-run."
}

function Ensure-Python {
  if (Test-Command python) {
    Write-Step "Python is ready: $(python --version)"
    return
  }
  Install-WingetPackage -Id "Python.Python.3.12" -Name "Python 3.12"
  Refresh-Path
  if (-not (Test-Command python)) { throw "Python installation finished, but python is not on PATH. Open a new PowerShell and re-run." }
}

function Resolve-Backend {
  if ([string]::IsNullOrWhiteSpace($BackendPath)) {
    return $null
  }

  if (-not (Test-Path $BackendPath)) {
    throw "Backend path does not exist: $BackendPath"
  }

  return (Resolve-Path $BackendPath).Path
}

function Test-PortBusy {
  param([int]$Port)
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return $null -ne $connections
}

function Find-BackendApp {
  param([string]$Path)
  if (-not [string]::IsNullOrWhiteSpace($BackendApp)) { return $BackendApp }
  if (Test-Path (Join-Path $Path "main.py")) { return "main:app" }
  if (Test-Path (Join-Path $Path "src\main.py")) { return "src.main:app" }

  $candidate = Get-ChildItem -Path $Path -Filter "*.py" -Recurse -Depth 3 -ErrorAction SilentlyContinue |
    Where-Object { Select-String -Path $_.FullName -Pattern "FastAPI\(" -Quiet } |
    Select-Object -First 1

  if ($null -eq $candidate) { return $null }
  $relative = [IO.Path]::GetRelativePath($Path, $candidate.FullName)
  $module = [IO.Path]::ChangeExtension($relative, $null).Replace("\", ".").Replace("/", ".")
  return "$module`:app"
}

function Start-Backend {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) {
    Write-Step "No backend path supplied. Expecting backend at $ApiUrl"
    return
  }

  $composeFiles = @("docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml") |
    ForEach-Object { Join-Path $Path $_ } |
    Where-Object { Test-Path $_ }

  if ($composeFiles.Count -gt 0) {
    Write-Step "Starting backend with Docker Compose"
    Push-Location $Path
    try { docker compose up -d --build } finally { Pop-Location }
    return
  }

  $requirements = Join-Path $Path "requirements.txt"
  $pyproject = Join-Path $Path "pyproject.toml"
  if ((Test-Path $requirements) -or (Test-Path $pyproject)) {
    Write-Step "Starting backend with local Python/uvicorn"
    Ensure-Python
    $app = Find-BackendApp -Path $Path
    if ([string]::IsNullOrWhiteSpace($app)) {
      throw "Could not detect FastAPI app. Re-run with -BackendApp main:app"
    }
    if (Test-PortBusy -Port $BackendPort) {
      Write-Step "Backend port $BackendPort is already in use; leaving existing backend running"
      return
    }

    Push-Location $Path
    try {
      python -m venv .venv
      $venvPython = Join-Path $Path ".venv\Scripts\python.exe"
      & $venvPython -m pip install --upgrade pip
      if (Test-Path $requirements) { & $venvPython -m pip install -r $requirements }
      if (Test-Path $pyproject) { & $venvPython -m pip install -e . }
      Start-Process -FilePath $venvPython -ArgumentList @("-m", "uvicorn", $app, "--host", "127.0.0.1", "--port", "$BackendPort") -WorkingDirectory $Path -RedirectStandardOutput "backend.local.log" -RedirectStandardError "backend.local.err.log" | Out-Null
      Start-Sleep -Seconds 2
    } finally {
      Pop-Location
    }
    return
  }

  Write-Step "Backend supplied, but no docker-compose.yml, requirements.txt, or pyproject.toml was found. Skipping backend startup."
}

function Write-FrontendEnv {
  Write-Step "Writing frontend\.env.local"
  Set-Content -Path (Join-Path $FrontendDir ".env.local") -Value "NEXT_PUBLIC_API_URL=$ApiUrl" -Encoding ASCII
}

function Install-FrontendDeps {
  Write-Step "Installing frontend dependencies"
  Push-Location $FrontendDir
  try {
    if (Test-Path "package-lock.json") {
      npm ci
    } else {
      npm install
    }
  } finally {
    Pop-Location
  }
}

function Start-Frontend {
  if (Test-PortBusy -Port $FrontendPort) {
    throw "Frontend port $FrontendPort is already in use. Use -FrontendPort or set FRONTEND_PORT."
  }

  Push-Location $FrontendDir
  try {
    if ($Prod) {
      Write-Step "Building and starting frontend production server on http://localhost:$FrontendPort"
      npm run build
      $env:PORT = "$FrontendPort"
      npm start
    } else {
      Write-Step "Starting frontend dev server on http://localhost:$FrontendPort"
      $env:PORT = "$FrontendPort"
      npm run dev
    }
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $FrontendDir)) {
  throw "frontend directory not found at $FrontendDir"
}

Ensure-Node22
Ensure-WslForDocker
Ensure-Docker
$resolvedBackend = Resolve-Backend
Start-Backend -Path $resolvedBackend
Write-FrontendEnv
Install-FrontendDeps

Write-Step "Local URLs"
Write-Host "Frontend: http://localhost:$FrontendPort"
Write-Host "Backend API: $ApiUrl"
if (-not [string]::IsNullOrWhiteSpace($resolvedBackend)) {
  Write-Host "Backend path: $resolvedBackend"
}

Start-Frontend
