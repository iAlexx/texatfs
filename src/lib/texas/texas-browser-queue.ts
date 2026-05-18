/**
 * Serializes Puppeteer sign-in launches — one Chromium at a time per process.
 * Prevents OOM / Target closed when multiple Telegram users onboard concurrently.
 */
let browserLoginChain: Promise<void> = Promise.resolve();

export function withTexasBrowserLoginLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = browserLoginChain.then(fn);
  browserLoginChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
