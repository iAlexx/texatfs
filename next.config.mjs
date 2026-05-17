/** @type {import('next').NextConfig} */
const serverExternals = [
  "puppeteer-core",
  "puppeteer-extra",
  "puppeteer-extra-plugin",
  "puppeteer-extra-plugin-stealth",
  "puppeteer-extra-plugin-user-preferences",
  "puppeteer-extra-plugin-user-data-dir",
  "puppeteer",
  "undici",
  "@puppeteer/browsers",
  "chromium-bidi",
];

const puppeteerTraceIncludes = [
  "./node_modules/puppeteer-core/**",
  "./node_modules/puppeteer-extra/**",
  "./node_modules/puppeteer-extra-plugin/**",
  "./node_modules/puppeteer-extra-plugin-stealth/**",
  "./node_modules/puppeteer-extra-plugin-user-preferences/**",
  "./node_modules/puppeteer-extra-plugin-user-data-dir/**",
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
    serverComponentsExternalPackages: serverExternals,
    outputFileTracingIncludes: {
      "/api/*": puppeteerTraceIncludes,
      "/api/**/*": puppeteerTraceIncludes,
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), ...serverExternals];
    }
    return config;
  },
};

export default nextConfig;
