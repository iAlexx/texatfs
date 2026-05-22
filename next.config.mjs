/** @type {import('next').NextConfig} */

/** Never bundle these — load from node_modules at runtime (avoids minified e.use errors). */
const puppeteerExternals = [
  "puppeteer-extra",
  "puppeteer-extra-plugin-stealth",
  "puppeteer-core",
  "puppeteer",
  "puppeteer-extra-plugin",
  "puppeteer-extra-plugin-user-preferences",
  "puppeteer-extra-plugin-user-data-dir",
];

/** gramjs (telegram package) uses native Node crypto/net — must not be bundled by webpack. */
const gramjsExternals = ["telegram", "telegram/sessions", "telegram/extensions"];

const puppeteerTraceIncludes = [
  "./scripts/puppeteer-runtime.cjs",
  "./node_modules/puppeteer-core/**",
  "./node_modules/puppeteer-extra/**",
  "./node_modules/puppeteer-extra-plugin/**",
  "./node_modules/puppeteer-extra-plugin-stealth/**",
  "./node_modules/puppeteer-extra-plugin-user-preferences/**",
  "./node_modules/puppeteer-extra-plugin-user-data-dir/**",
  "./node_modules/fs-extra/**",
  "./node_modules/rimraf/**",
  "./node_modules/graceful-fs/**",
  "./node_modules/jsonfile/**",
  "./node_modules/universalify/**",
];

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Next.js 14 — keeps puppeteer-* and gramjs out of the webpack server bundle
    serverComponentsExternalPackages: [...puppeteerExternals, ...gramjsExternals],
    outputFileTracingIncludes: {
      "/api/*": puppeteerTraceIncludes,
      "/api/**/*": puppeteerTraceIncludes,
      "/api/cron/*": puppeteerTraceIncludes,
      "/api/render/*": puppeteerTraceIncludes,
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externalsPresets = { ...config.externalsPresets, node: true };
      const prev = config.externals;
      config.externals = [
        ...(Array.isArray(prev) ? prev : prev ? [prev] : []),
        ...puppeteerExternals,
        ...gramjsExternals,
      ];
    }
    return config;
  },
};

export default nextConfig;
