#!/bin/bash
# Starts both the data server and the static file server for MTG MVM

echo "Starting server.js (data API, port 3001)..."
node "$(dirname "$0")/server.js" &
SERVER_PID=$!

echo "Starting live-server (static files, port 8080)..."
live-server "$(dirname "$0")" --port=8080 --host=0.0.0.0 --no-browser --ignore=data &
LIVESERVER_PID=$!

echo ""
echo "Both running. Press Ctrl+C to stop both."
echo "  - Data API:  http://localhost:3001"
echo "  - Site:      http://localhost:8080"
echo "  - LAN:       http://192.168.4.141:8080"

trap "kill $SERVER_PID $LIVESERVER_PID" EXIT
wait
