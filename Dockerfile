# TEXAS FUNDS calculate — Railway deployment with Chromium for Puppeteer
FROM node:20-bookworm-slim AS base

# Chromium + runtime libraries required by Puppeteer on Debian
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV TEXAS_BROWSER_LOGIN=true
ENV TEXAS_BROWSER_LOGIN_FALLBACK=false

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

RUN mkdir -p public
COPY scripts/railway-start.sh ./railway-start.sh
COPY scripts/puppeteer-runtime.cjs ./scripts/puppeteer-runtime.cjs
RUN chmod +x ./railway-start.sh \
  && test -x /usr/bin/chromium || test -f /usr/bin/chromium
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Merge full production puppeteer tree (standalone trace misses stealth/evasions/*)
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-core ./node_modules/puppeteer-core
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-extra ./node_modules/puppeteer-extra
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-extra-plugin ./node_modules/puppeteer-extra-plugin
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-extra-plugin-stealth ./node_modules/puppeteer-extra-plugin-stealth
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-extra-plugin-user-preferences ./node_modules/puppeteer-extra-plugin-user-preferences
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules/puppeteer-extra-plugin-user-data-dir ./node_modules/puppeteer-extra-plugin-user-data-dir
RUN chown nextjs:nodejs ./railway-start.sh

USER nextjs
EXPOSE 3000
CMD ["./railway-start.sh"]
