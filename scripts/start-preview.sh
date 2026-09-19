#!/bin/bash
# Direct production preview server startup (mirrors .zscripts/dev.sh standalone path,
# skipping the bun install + db:push steps which are already done)
set -euo pipefail

PROJECT_DIR="/home/z/my-project"
cd "$PROJECT_DIR"

# Make sure nothing is squatting on port 3000
pkill -f "next dev" 2>/dev/null || true
pkill -f ".next/standalone/server.js" 2>/dev/null || true
sleep 2

export NODE_ENV=production
export PORT=3000
export HOSTNAME=0.0.0.0
export DATABASE_URL="file:$PROJECT_DIR/db/custom.db"

echo "[$(date '+%H:%M:%S')] Starting standalone production server on :3000"
exec bun "$PROJECT_DIR/.next/standalone/server.js"
