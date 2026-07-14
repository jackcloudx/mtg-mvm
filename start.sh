#!/bin/bash
# Starts both the data server and the static file server for MTG MVM
# Processes are fully detached — survive terminal close.

DIR="$(cd "$(dirname "$0")" && pwd)"
LOGS="$DIR/logs"
PIDS="$DIR/logs"

mkdir -p "$LOGS"

# Kill any already-running instances to avoid port conflicts
if [ -f "$PIDS/server.pid" ]; then
  OLD=$(cat "$PIDS/server.pid")
  kill "$OLD" 2>/dev/null && echo "Stopped previous server.js (PID $OLD)"
  rm -f "$PIDS/server.pid"
fi
if [ -f "$PIDS/live-server.pid" ]; then
  OLD=$(cat "$PIDS/live-server.pid")
  kill "$OLD" 2>/dev/null && echo "Stopped previous live-server (PID $OLD)"
  rm -f "$PIDS/live-server.pid"
fi

# Launch server.js detached
nohup node "$DIR/server.js" >> "$LOGS/server.log" 2>&1 &
SERVER_PID=$!
disown $SERVER_PID
echo $SERVER_PID > "$PIDS/server.pid"

# Launch live-server detached
nohup live-server "$DIR" --port=8080 --host=0.0.0.0 --no-browser --ignore=data,logs >> "$LOGS/live-server.log" 2>&1 &
LS_PID=$!
disown $LS_PID
echo $LS_PID > "$PIDS/live-server.pid"

echo ""
echo "MTG | MVM servers started (detached)."
echo "  Data API:  http://localhost:3001"
echo "  Site:      http://localhost:8080"
echo "  LAN:       http://192.168.4.141:8080"
echo "  Watching:  data/season9.json"
echo ""
echo "Logs:  logs/server.log  |  logs/live-server.log"
echo "Stop:  ./stop.sh"
echo ""
