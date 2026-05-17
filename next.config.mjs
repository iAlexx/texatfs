/** @type {import('next').NextConfig} */
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
    serverComponentsExternalPackages: [
      "puppeteer-core",
      "puppeteer-extra",
      "puppeteer-extra-plugin-stealth",
    ],
  },
};

export default nextConfig;
