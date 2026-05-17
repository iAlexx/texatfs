/** Optional local dev dependency — not required on Railway (system Chromium). */
declare module "puppeteer" {
  const puppeteer: {
    executablePath(): string;
  };
  export default puppeteer;
}
