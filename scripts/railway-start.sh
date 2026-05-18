#!/bin/sh
set -e

export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NODE_ENV="${NODE_ENV:-production}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"

echo "[railway-start] NODE_ENV=${NODE_ENV}"
echo "[railway-start] Binding http://${HOSTNAME}:${PORT}"
echo "[railway-start] PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-unset}"
echo "[railway-start] TEXAS_BROWSER_LOGIN=${TEXAS_BROWSER_LOGIN:-true}"
echo "[railway-start] LOCAL_DEBUG=${LOCAL_DEBUG:-unset}"

if [ "${LOCAL_DEBUG}" = "true" ]; then
  echo "[railway-start] WARN: LOCAL_DEBUG=true is for local dev only — unset on Railway"
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY}" ]; then
  echo "[railway-start] ERROR: SUPABASE_SERVICE_ROLE_KEY is required"
  exit 1
fi

if [ -z "${TELEGRAM_BOT_TOKEN}" ]; then
  echo "[railway-start] ERROR: TELEGRAM_BOT_TOKEN is required"
  exit 1
fi

if [ -z "${CREDENTIALS_ENCRYPTION_KEY}" ]; then
  echo "[railway-start] ERROR: CREDENTIALS_ENCRYPTION_KEY is required"
  exit 1
fi

if [ ! -f "./server.js" ]; then
  echo "[railway-start] ERROR: server.js missing — standalone build failed"
  exit 1
fi

if [ ! -f "./scripts/puppeteer-runtime.cjs" ]; then
  echo "[railway-start] ERROR: scripts/puppeteer-runtime.cjs missing"
  exit 1
fi

if [ -n "${PUPPETEER_EXECUTABLE_PATH}" ] && [ ! -f "${PUPPETEER_EXECUTABLE_PATH}" ]; then
  echo "[railway-start] WARN: Chromium not found at ${PUPPETEER_EXECUTABLE_PATH}"
fi
if [ -f /usr/lib/chromium/chromium ]; then
  echo "[railway-start] Chromium binary: /usr/lib/chromium/chromium"
fi
if [ -z "${TEXAS_HTTP_PROXY}" ]; then
  echo "[railway-start] WARN: TEXAS_HTTP_PROXY unset — Cloudflare may block datacenter IP"
fi

exec node server.js
