#!/bin/bash
# Stops the MTG MVM data server and live-server.

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDS="$DIR/logs"

stop_proc() {
  local name="$1"
  local pidfile="$PIDS/$2"
  local port="$3"

  if [ -f "$pidfile" ]; then
    PID=$(cat "$pidfile")
    if kill "$PID" 2>/dev/null; then
      echo "Stopped $name (PID $PID)"
    else
      echo "$name PID $PID was not running"
    fi
    rm -f "$pidfile"
  else
    # Fallback: kill by port
    PID=$(lsof -ti tcp:"$port" 2>/dev/null)
    if [ -n "$PID" ]; then
      kill $PID 2>/dev/null && echo "Stopped $name on port $port (PID $PID)"
    else
      echo "$name: not running (no PID file, nothing on port $port)"
    fi
  fi
}

stop_proc "server.js"   "server.pid"      3001
stop_proc "live-server" "live-server.pid" 8080

echo "Done."
