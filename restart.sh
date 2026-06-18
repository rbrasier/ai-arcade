#!/usr/bin/env bash
#
# restart.sh — stop, (re)seed, and start the AI Arcade.
#
# Usage:
#   ./restart.sh            # stop running server, push schema, seed, start dev
#   ./restart.sh --prod     # same, but build + start in production mode
#   ./restart.sh --no-seed  # skip the database seed step
#
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
PID_FILE=".arcade.pid"
LOG_FILE=".arcade.log"
MODE="dev"
DO_SEED=1

for arg in "$@"; do
  case "$arg" in
    --prod) MODE="prod" ;;
    --no-seed) DO_SEED=0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

echo "==> Stopping any running arcade server..."
# Stop by recorded PID first.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi
# Also free the port in case something else is holding it.
if command -v lsof >/dev/null 2>&1; then
  PORT_PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
  if [[ -n "$PORT_PIDS" ]]; then
    echo "    freeing port $PORT (pids: $PORT_PIDS)"
    kill $PORT_PIDS 2>/dev/null || true
    sleep 1
  fi
fi

if [[ ! -d node_modules ]]; then
  echo "==> Installing dependencies..."
  npm install
fi

echo "==> Applying database schema (drizzle push)..."
npm run db:push

if [[ "$DO_SEED" -eq 1 ]]; then
  echo "==> Seeding database..."
  npm run db:seed
fi

if [[ "$MODE" == "prod" ]]; then
  echo "==> Building for production..."
  npm run build
  echo "==> Starting production server on port $PORT..."
  PORT="$PORT" nohup npm run start >"$LOG_FILE" 2>&1 &
else
  echo "==> Starting dev server on port $PORT..."
  PORT="$PORT" nohup npm run dev >"$LOG_FILE" 2>&1 &
fi

echo $! >"$PID_FILE"
echo "==> Arcade started (pid $(cat "$PID_FILE")). Logs: $LOG_FILE"
echo "==> http://localhost:$PORT"
