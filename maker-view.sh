#!/usr/bin/env bash
# Starts ROS2 Maker View (if not already running) and opens it in the browser.
# foxglove_bridge is not started here: run it yourself with the right ROS environment,
# then press Connect in the view.
#
#   ./maker-view.sh                      # view list (create and edit views, also offline)
#   ./maker-view.sh demo                 # views/demo.json
#   ./maker-view.sh exports/demo.html    # standalone export, no web server needed
#
# Options:
#   --port <n>           web server port (default 8080, env PORT)
#   --bridge <url>       foxglove_bridge URL for this session (default ws://<host>:8765)
#   --browser <cmd>      browser command (default: env BROWSER, google-chrome, xdg-open)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEW=""
PORT="${PORT:-8080}"
BRIDGE=""
BROWSER_CMD="${BROWSER:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift ;;
    --bridge) BRIDGE="$2"; shift ;;
    --browser) BROWSER_CMD="$2"; shift ;;
    -h|--help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
    -*) echo "Unknown option $1" >&2; exit 2 ;;
    *) VIEW="$1" ;;
  esac
  shift
done

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

server_pid=""
cleanup() { [[ -n $server_pid ]] && kill "$server_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 130' INT TERM

query=""
[[ -n $BRIDGE ]] && query="?bridge=$BRIDGE"

if [[ $VIEW == *.html ]]; then
  [[ -f $VIEW ]] || { echo "File not found: $VIEW" >&2; exit 1; }
  url="file://$(realpath "$VIEW")$query"
else
  if port_open "$PORT"; then
    echo "ROS2 Maker View already running on port $PORT"
  else
    node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)'; }
    if ! node_ok && [[ -s ${NVM_DIR:-$HOME/.nvm}/nvm.sh ]]; then
      set +u; source "${NVM_DIR:-$HOME/.nvm}/nvm.sh" >/dev/null; nvm use --silent default >/dev/null 2>&1 || true; set -u
    fi
    node_ok || { echo "Node.js >= 22.18 is required (found: $(node -v 2>/dev/null || echo none))" >&2; exit 1; }
    cd "$ROOT"
    [[ -d node_modules ]] || npm install
    [[ -f dist/index.html ]] || npm run build
    node server/index.ts --port "$PORT" &
    server_pid=$!
    for _ in $(seq 50); do port_open "$PORT" && break; sleep 0.1; done
  fi
  url="http://localhost:$PORT/$query"
  [[ -n $VIEW ]] && url+="#/v/$VIEW"
fi

echo "Opening $url"
if [[ -n $BROWSER_CMD ]]; then $BROWSER_CMD "$url" >/dev/null 2>&1 &
elif command -v google-chrome >/dev/null; then google-chrome "$url" >/dev/null 2>&1 &
else xdg-open "$url" >/dev/null 2>&1 &
fi
disown || true

if [[ -n $server_pid ]]; then
  echo "Running. Press Ctrl+C to stop."
  wait "$server_pid"
fi
