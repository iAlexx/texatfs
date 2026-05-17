/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "puppeteer-core",
      "puppeteer-extra",
      "puppeteer-extra-plugin-stealth",
    ],
  },
};

export default nextConfig;
