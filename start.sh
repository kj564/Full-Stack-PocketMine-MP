#!/bin/bash
# Start PMMP Dashboard

cd "$(dirname "$0")"

# Start websocket service
cd mini-services/pmmp-console-service
bun run dev &

# Start dashboard
cd ../..
bun run dev
