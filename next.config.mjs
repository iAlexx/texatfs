/** @type {import('next').NextConfig} */
const serverExternals = [
  "puppeteer-core",
  "puppeteer-extra",
  "puppeteer-extra-plugin-stealth",
  "puppeteer",
  "undici",
  "@puppeteer/browsers",
  "chromium-bidi",
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
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals ?? []), ...serverExternals];
    }
    return config;
  },
};

export default nextConfig;
