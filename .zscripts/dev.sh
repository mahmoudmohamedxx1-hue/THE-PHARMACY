#!/bin/bash

set -euo pipefail

# 获取脚本所在目录（.zscripts）
# 使用 $0 获取脚本路径（与 build.sh 保持一致）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

log_step_start() {
        local step_name="$1"
        echo "=========================================="
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting: $step_name"
        echo "=========================================="
        export STEP_START_TIME
        STEP_START_TIME=$(date +%s)
}

log_step_end() {
        local step_name="${1:-Unknown step}"
        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - STEP_START_TIME))
        echo "=========================================="
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Completed: $step_name"
        echo "[LOG] Step: $step_name | Duration: ${duration}s"
        echo "=========================================="
        echo ""
}

start_mini_services() {
        local mini_services_dir="$PROJECT_DIR/mini-services"
        local started_count=0

        log_step_start "Starting mini-services"
        if [ ! -d "$mini_services_dir" ]; then
                echo "Mini-services directory not found, skipping..."
                log_step_end "Starting mini-services"
                return 0
        fi

        echo "Found mini-services directory, scanning for sub-services..."

        for service_dir in "$mini_services_dir"/*; do
                if [ ! -d "$service_dir" ]; then
                        continue
                fi

                local service_name
                service_name=$(basename "$service_dir")
                echo "Checking service: $service_name"

                if [ ! -f "$service_dir/package.json" ]; then
                        echo "[$service_name] No package.json found, skipping..."
                        continue
                fi

                if ! grep -q '"dev"' "$service_dir/package.json"; then
                        echo "[$service_name] No dev script found, skipping..."
                        continue
                fi

                echo "Starting $service_name in background..."
                (
                        cd "$service_dir"
                        echo "[$service_name] Installing dependencies..."
                        bun install
                        echo "[$service_name] Running bun run dev..."
                        exec bun run dev
                ) >"$PROJECT_DIR/.zscripts/mini-service-${service_name}.log" 2>&1 &

                local service_pid=$!
                echo "[$service_name] Started in background (PID: $service_pid)"
                echo "[$service_name] Log: $PROJECT_DIR/.zscripts/mini-service-${service_name}.log"
                disown "$service_pid" 2>/dev/null || true
                started_count=$((started_count + 1))
        done

        echo "Mini-services startup completed. Started $started_count service(s)."
        log_step_end "Starting mini-services"
}

wait_for_service() {
        local host="$1"
        local port="$2"
        local service_name="$3"
        local max_attempts="${4:-60}"
        local attempt=1

        echo "Waiting for $service_name to be ready on $host:$port..."

        while [ "$attempt" -le "$max_attempts" ]; do
                if curl -s --connect-timeout 2 --max-time 5 "http://$host:$port" >/dev/null 2>&1; then
                        echo "$service_name is ready!"
                        return 0
                fi

                echo "Attempt $attempt/$max_attempts: $service_name not ready yet, waiting..."
                sleep 1
                attempt=$((attempt + 1))
        done

        echo "ERROR: $service_name failed to start within $max_attempts seconds"
        return 1
}

cleanup() {
        if [ -n "${DEV_PID:-}" ] && kill -0 "$DEV_PID" >/dev/null 2>&1; then
                echo "Stopping Next.js dev server (PID: $DEV_PID)..."
                kill "$DEV_PID" >/dev/null 2>&1 || true
        fi
}

trap cleanup EXIT INT TERM

cd "$PROJECT_DIR"

if ! command -v bun >/dev/null 2>&1; then
        echo "ERROR: bun is not installed or not in PATH"
        exit 1
fi

log_step_start "bun install"
echo "[BUN] Installing dependencies..."
bun install
log_step_end "bun install"

log_step_start "bun run db:push"
echo "[BUN] Setting up database..."
bun run db:push
log_step_end "bun run db:push"

# Preview speed: a compiled production build loads dramatically faster than
# `next dev` (precompiled routes, minified JS, ISR cache — dev mode ships ~5MB+
# of unminified chunks and slow hydration). If a standalone build exists, serve
# it. Force classic dev mode with: FORCE_DEV=1 bash .zscripts/dev.sh
if [ -f "$PROJECT_DIR/.next/standalone/server.js" ] && [ "${FORCE_DEV:-0}" != "1" ]; then
        log_step_start "Starting Next.js PRODUCTION preview server"
        echo "[PREVIEW] .next/standalone/server.js found -> serving production build (set FORCE_DEV=1 for dev mode)"
        export NODE_ENV=production
        export PORT=3000
        export HOSTNAME=0.0.0.0
        # Point the standalone server at the project database so preview data
        # (orders, prescriptions) persists across rebuilds of the bundle.
        export DATABASE_URL="${DATABASE_URL:-file:$PROJECT_DIR/db/custom.db}"
        bun "$PROJECT_DIR/.next/standalone/server.js" >>"$PROJECT_DIR/dev.log" 2>&1 &
        DEV_PID=$!
        log_step_end "Starting Next.js PRODUCTION preview server"
else
        log_step_start "Starting Next.js dev server"
        echo "[BUN] Starting development server..."
        bun run dev &
        DEV_PID=$!
        log_step_end "Starting Next.js dev server"

        # SELF-HEAL: dev mode blocks the external preview domain (cross-origin
        # resource checks in `next dev`) and the .next/standalone production
        # bundle is NOT preserved across sandbox restores (repo.tar excludes
        # .next/). So whenever we land in dev mode, rebuild the production
        # bundle in the background and swap the server over automatically once
        # it is ready. Boot flow is unaffected: dev mode passes health checks
        # first, then the swap happens minutes later.
        (
                cd "$PROJECT_DIR"
                # let the dev server come up first so boot health checks pass
                for i in $(seq 1 60); do
                        curl -sf --max-time 2 http://localhost:3000/ >/dev/null 2>&1 && break
                        sleep 1
                done
                echo "[SELF-HEAL] $(date '+%H:%M:%S') no production bundle; rebuilding in background" >>"$PROJECT_DIR/dev.log"
                if bun run build >>"$PROJECT_DIR/dev.log" 2>&1 && [ -f "$PROJECT_DIR/.next/standalone/server.js" ]; then
                        echo "[SELF-HEAL] $(date '+%H:%M:%S') build complete; swapping dev -> production server" >>"$PROJECT_DIR/dev.log"
                        pkill -f "next dev" 2>/dev/null || true
                        pkill -f "next-server" 2>/dev/null || true
                        pkill -f "tee dev.log" 2>/dev/null || true
                        sleep 3
                        export NODE_ENV=production
                        export PORT=3000
                        export HOSTNAME=0.0.0.0
                        export DATABASE_URL="file:$PROJECT_DIR/db/custom.db"
                        exec bun "$PROJECT_DIR/.next/standalone/server.js" >>"$PROJECT_DIR/dev.log" 2>&1
                else
                        echo "[SELF-HEAL] $(date '+%H:%M:%S') build failed; staying in dev mode" >>"$PROJECT_DIR/dev.log"
                fi
        ) >/dev/null 2>&1 &
        disown 2>/dev/null || true
fi

log_step_start "Waiting for Next.js dev server"
wait_for_service "localhost" "3000" "Next.js dev server"
log_step_end "Waiting for Next.js dev server"

log_step_start "Health check"
echo "[BUN] Performing health check..."
curl -fsS localhost:3000 >/dev/null
echo "[BUN] Health check passed"
log_step_end "Health check"

start_mini_services

echo "Next.js dev server is running in background (PID: $DEV_PID)."
echo "Use 'kill $DEV_PID' to stop it."
disown "$DEV_PID" 2>/dev/null || true
unset DEV_PID
