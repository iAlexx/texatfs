#!/bin/sh
set -e

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"

echo "[railway-start] NODE_ENV=${NODE_ENV:-unset}"
echo "[railway-start] Binding http://${HOSTNAME}:${PORT}"
echo "[railway-start] PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-unset}"

exec node server.js
