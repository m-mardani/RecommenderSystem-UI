#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

API_URL="${API_URL:-http://127.0.0.1:8000/api/v1}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_PATH="${BACKEND_PATH:-}"
BACKEND_APP="${BACKEND_APP:-}"
RUN_MODE="${RUN_MODE:-dev}"
SKIP_DOCKER="${SKIP_DOCKER:-0}"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/setup-local-ubuntu.sh [options]

Options:
  --backend-path PATH     Local backend project path.
  --api-url URL           Frontend API URL. Default: http://127.0.0.1:8000/api/v1
  --frontend-port PORT    Next.js port. Default: 3000
  --backend-port PORT     FastAPI port. Default: 8000
  --backend-app APP       Uvicorn ASGI app, e.g. main:app or src.main:app.
  --prod                  Build and run Next.js production server.
  --skip-docker           Do not install/check Docker.
  -h, --help              Show this help.

Examples:
  bash scripts/setup-local-ubuntu.sh --backend-path ../RecommenderSystem-Backend
EOF
}

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

sudo_if_needed() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backend-path) BACKEND_PATH="${2:-}"; shift 2 ;;
      --api-url) API_URL="${2:-}"; shift 2 ;;
      --frontend-port) FRONTEND_PORT="${2:-}"; shift 2 ;;
      --backend-port) BACKEND_PORT="${2:-}"; shift 2 ;;
      --backend-app) BACKEND_APP="${2:-}"; shift 2 ;;
      --prod) RUN_MODE="prod"; shift ;;
      --skip-docker) SKIP_DOCKER="1"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fail "Unknown option: $1" ;;
    esac
  done
}

install_base_packages() {
  log "Checking base packages"
  local missing=()
  for cmd in curl ca-certificates lsof; do
    need_cmd "$cmd" || missing+=("$cmd")
  done

  if [[ ${#missing[@]} -gt 0 ]]; then
    log "Installing missing packages: ${missing[*]}"
    sudo_if_needed apt-get update
    sudo_if_needed apt-get install -y ca-certificates curl gnupg lsof
  fi
}

ensure_node_22() {
  local node_major="0"
  if need_cmd node; then
    node_major="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  fi

  if [[ "$node_major" -ge 22 ]] && need_cmd npm; then
    log "Node.js $(node --version) is ready"
    return
  fi

  log "Installing Node.js 22 with nvm"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 22
  nvm use 22
  nvm alias default 22
  need_cmd node || fail "Node.js installation failed"
  need_cmd npm || fail "npm installation failed"
  log "Node.js $(node --version) is ready"
}

ensure_docker() {
  [[ "$SKIP_DOCKER" == "1" ]] && return

  if ! need_cmd docker; then
    log "Installing Docker Engine and Compose plugin"
    sudo_if_needed apt-get update
    sudo_if_needed apt-get install -y ca-certificates curl gnupg
    sudo_if_needed install -m 0755 -d /etc/apt/keyrings
    sudo_if_needed rm -f /etc/apt/keyrings/docker.gpg
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo_if_needed gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo_if_needed chmod a+r /etc/apt/keyrings/docker.gpg
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo_if_needed tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo_if_needed apt-get update
    sudo_if_needed apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  if ! docker info >/dev/null 2>&1; then
    log "Starting Docker service"
    sudo_if_needed systemctl enable --now docker || sudo_if_needed service docker start || true
  fi

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is installed but not reachable. Log out/in after group changes or run this script with sudo."
  fi

  if ! groups "$USER" | tr ' ' '\n' | grep -qx docker; then
    log "Adding current user to docker group for future sessions"
    sudo_if_needed usermod -aG docker "$USER" || true
  fi

  docker compose version >/dev/null 2>&1 || fail "Docker Compose plugin is not available"
  log "Docker is ready: $(docker --version)"
}

prepare_backend_path() {
  if [[ -n "$BACKEND_PATH" ]]; then
    BACKEND_PATH="$(cd "$(dirname "$BACKEND_PATH")" && pwd)/$(basename "$BACKEND_PATH")"
  else
    return
  fi

  if [[ ! -d "$BACKEND_PATH" ]]; then
    fail "Backend path does not exist: $BACKEND_PATH"
  fi
}

port_is_busy() {
  lsof -iTCP:"$1" -sTCP:LISTEN -Pn >/dev/null 2>&1
}

detect_backend_app() {
  [[ -n "$BACKEND_APP" ]] && return
  [[ -f "$BACKEND_PATH/main.py" ]] && BACKEND_APP="main:app" && return
  [[ -f "$BACKEND_PATH/src/main.py" ]] && BACKEND_APP="src.main:app" && return
  local candidate
  candidate="$(find "$BACKEND_PATH" -maxdepth 3 -type f -name '*.py' -print | while read -r file; do
    grep -q 'FastAPI(' "$file" && printf '%s\n' "$file" && break
  done)"
  [[ -n "$candidate" ]] || return
  candidate="${candidate#"$BACKEND_PATH/"}"
  candidate="${candidate%.py}"
  BACKEND_APP="${candidate//\//.}:app"
}

start_backend() {
  [[ -z "$BACKEND_PATH" ]] && {
    log "No backend path supplied. Expecting backend at $API_URL"
    return
  }

  [[ -d "$BACKEND_PATH" ]] || fail "Backend directory not found: $BACKEND_PATH"

  if [[ -f "$BACKEND_PATH/docker-compose.yml" || -f "$BACKEND_PATH/docker-compose.yaml" || -f "$BACKEND_PATH/compose.yml" || -f "$BACKEND_PATH/compose.yaml" ]]; then
    log "Starting backend with Docker Compose"
    (cd "$BACKEND_PATH" && docker compose up -d --build)
    return
  fi

  if [[ -f "$BACKEND_PATH/requirements.txt" || -f "$BACKEND_PATH/pyproject.toml" ]]; then
    log "Starting backend with local Python/uvicorn"
    need_cmd python3 || sudo_if_needed apt-get install -y python3 python3-venv python3-pip
    detect_backend_app
    [[ -n "$BACKEND_APP" ]] || fail "Could not detect FastAPI app. Re-run with --backend-app main:app"
    if port_is_busy "$BACKEND_PORT"; then
      log "Backend port $BACKEND_PORT is already in use; leaving existing backend running"
      return
    fi
    (
      cd "$BACKEND_PATH"
      python3 -m venv .venv
      # shellcheck disable=SC1091
      . .venv/bin/activate
      python -m pip install --upgrade pip
      [[ -f requirements.txt ]] && pip install -r requirements.txt
      [[ -f pyproject.toml ]] && pip install -e .
      nohup python -m uvicorn "$BACKEND_APP" --host 127.0.0.1 --port "$BACKEND_PORT" > backend.local.log 2>&1 &
    )
    sleep 2
    return
  fi

  log "Backend supplied, but no docker-compose.yml, requirements.txt, or pyproject.toml was found. Skipping backend startup."
}

prepare_frontend_env() {
  log "Writing frontend/.env.local"
  printf 'NEXT_PUBLIC_API_URL=%s\n' "$API_URL" > "$FRONTEND_DIR/.env.local"
}

install_frontend_deps() {
  log "Installing frontend dependencies"
  cd "$FRONTEND_DIR"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}

run_frontend() {
  cd "$FRONTEND_DIR"
  if port_is_busy "$FRONTEND_PORT"; then
    fail "Frontend port $FRONTEND_PORT is already in use. Set FRONTEND_PORT or pass --frontend-port."
  fi

  if [[ "$RUN_MODE" == "prod" ]]; then
    log "Building and starting frontend production server on http://localhost:$FRONTEND_PORT"
    npm run build
    PORT="$FRONTEND_PORT" npm start
  else
    log "Starting frontend dev server on http://localhost:$FRONTEND_PORT"
    PORT="$FRONTEND_PORT" npm run dev
  fi
}

main() {
  parse_args "$@"
  [[ -d "$FRONTEND_DIR" ]] || fail "frontend directory not found at $FRONTEND_DIR"

  install_base_packages
  ensure_node_22
  ensure_docker
  prepare_backend_path
  start_backend
  prepare_frontend_env
  install_frontend_deps

  log "Local URLs"
  printf 'Frontend: http://localhost:%s\n' "$FRONTEND_PORT"
  printf 'Backend API: %s\n' "$API_URL"
  [[ -n "$BACKEND_PATH" ]] && printf 'Backend path: %s\n' "$BACKEND_PATH"

  run_frontend
}

main "$@"
