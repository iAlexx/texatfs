import { existsSync } from "node:fs";
import type {
  Browser,
  Cookie,
  ElementHandle,
  HTTPResponse,
  LaunchOptions,
  Page,
} from "puppeteer-core";
import {
  getTexasSignInErrorMessage,
  isTexasSignInSuccess,
  sleep,
  TEXAS_AGENTS_ORIGIN,
  type TexasSignInEnvelope,
} from "@/lib/texas/texas-api-config";
import { isRailwayRuntime } from "@/lib/texas/texas-browser-config";
import {
  getTexasProxyAuth,
  getTexasProxyLaunchArgs,
  logProxyCheck,
  resolveTexasProxyUrl,
} from "@/lib/texas/texas-proxy";

export {
  isTexasBrowserLoginEnabled,
  isTexasBrowserLoginFallbackEnabled,
  isRailwayRuntime,
} from "@/lib/texas/texas-browser-config";

const CF_CLEAR_TIMEOUT_MS = 120_000;
/** Navigation / goto timeout — proxy + Cloudflare can be slow on Railway. */
const NAVIGATION_TIMEOUT_MS = 60_000;
const LOGIN_TIMEOUT_MS = 90_000;
const BROWSER_PROTOCOL_TIMEOUT_MS = 120_000;

const RAILWAY_CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--single-process",
  "--no-zygote",
  "--disable-software-rasterizer",
  "--disable-extensions",
  "--no-first-run",
  "--disable-blink-features=AutomationControlled",
  "--window-size=1366,768",
] as const;

const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input[id="username"]',
  'input[formcontrolname="username"]',
  'input[autocomplete="username"]',
  'input[type="email"]',
  'input[placeholder*="user" i]',
  'input[placeholder*="login" i]',
  'input[type="text"]',
];

const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input[id="password"]',
  'input[formcontrolname="password"]',
  'input[autocomplete="current-password"]',
  'input[type="password"]',
];

const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button.btn-login',
  'button.login',
  'a.btn-login',
  'button.mat-primary',
  'button[class*="login" i]',
];

export interface TexasBrowserSignInResult {
  setCookies: string[];
  signInData: TexasSignInEnvelope | null;
  httpStatus: number;
}

type PuppeteerExtra = {
  launch: (options?: LaunchOptions) => Promise<Browser>;
  connect: (options: {
    browserWSEndpoint: string;
    defaultViewport?: { width: number; height: number } | null;
  }) => Promise<Browser>;
};

let puppeteerExtraPromise: Promise<PuppeteerExtra> | null = null;

/** Lazy-load Puppeteer so Next.js build does not evaluate native bindings. */
async function loadPuppeteer(): Promise<PuppeteerExtra> {
  if (!puppeteerExtraPromise) {
    puppeteerExtraPromise = (async () => {
      const [{ addExtra }, StealthPlugin, puppeteerCore] = await Promise.all([
        import("puppeteer-extra"),
        import("puppeteer-extra-plugin-stealth"),
        import("puppeteer-core"),
      ]);
      const instance = addExtra(
        puppeteerCore.default as unknown as Parameters<typeof addExtra>[0]
      );
      instance.use(StealthPlugin.default());
      return instance as PuppeteerExtra;
    })();
  }
  return puppeteerExtraPromise;
}

/** Convert Puppeteer cookies into Set-Cookie-style lines for token-manager. */
export function puppeteerCookiesToSetCookieLines(cookies: Cookie[]): string[] {
  return cookies.map((c) => {
    let line = `${c.name}=${c.value}`;
    if (c.domain) line += `; Domain=${c.domain}`;
    if (c.path) line += `; Path=${c.path}`;
    if (c.expires && c.expires > 0) {
      line += `; Expires=${new Date(c.expires * 1000).toUTCString()}`;
    }
    if (c.httpOnly) line += "; HttpOnly";
    if (c.secure) line += "; Secure";
    if (c.sameSite && c.sameSite !== "None") {
      line += `; SameSite=${c.sameSite}`;
    }
    return line;
  });
}

function linuxChromiumCandidates(): string[] {
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
  ];
}

async function resolveBundledChromiumPath(): Promise<string | undefined> {
  if (process.platform === "linux") return undefined;
  try {
    const bundled = await import("puppeteer");
    return bundled.default.executablePath();
  } catch {
    return undefined;
  }
}

function isTargetClosedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes("Target closed") ||
    msg.includes("Protocol error") ||
    msg.includes("Session closed") ||
    msg.includes("Browser closed")
  );
}

async function resolveExecutablePath(): Promise<string> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const chromePath = process.env.CHROME_PATH?.trim();

  if (envPath) {
    if (existsSync(envPath)) {
      console.info("[texas-browser] Using PUPPETEER_EXECUTABLE_PATH", {
        path: envPath,
      });
      return envPath;
    }
    console.warn("[texas-browser] PUPPETEER_EXECUTABLE_PATH missing on disk", {
      path: envPath,
    });
  }

  if (chromePath && existsSync(chromePath)) {
    console.info("[texas-browser] Using CHROME_PATH", { path: chromePath });
    return chromePath;
  }

  for (const candidate of linuxChromiumCandidates()) {
    if (existsSync(candidate)) {
      console.info("[texas-browser] Using system Chromium", { path: candidate });
      return candidate;
    }
  }

  const bundled = await resolveBundledChromiumPath();
  if (bundled) {
    console.info("[texas-browser] Using bundled Chromium", { path: bundled });
    return bundled;
  }

  throw new Error(
    "Chromium not found. Set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium (Railway Docker)."
  );
}

async function buildLaunchOptions(): Promise<LaunchOptions> {
  const proxyArgs = getTexasProxyLaunchArgs();
  const headed = process.env.TEXAS_BROWSER_HEADED === "true";
  const executablePath = await resolveExecutablePath();

  return {
    executablePath,
    headless: headed ? false : true,
    defaultViewport: { width: 1366, height: 768 },
    ignoreDefaultArgs: ["--enable-automation"],
    protocolTimeout: BROWSER_PROTOCOL_TIMEOUT_MS,
    timeout: BROWSER_PROTOCOL_TIMEOUT_MS,
    dumpio: process.env.TEXAS_BROWSER_DUMPIO === "true",
    args: [...RAILWAY_CHROMIUM_ARGS, ...proxyArgs],
  };
}

function attachBrowserDiagnostics(browser: Browser): void {
  browser.on("disconnected", () => {
    console.error(
      "[texas-browser] Chromium process disconnected (OOM/SIGKILL or crash in container)"
    );
  });
}

function buildBrowserlessEndpoint(): string | undefined {
  const raw = process.env.BROWSERLESS_WS_ENDPOINT?.trim();
  if (!raw) return undefined;

  const proxyUrl = resolveTexasProxyUrl();
  if (!proxyUrl) return raw;

  try {
    const u = new URL(proxyUrl);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const proxyServer = `${u.protocol}//${u.hostname}:${port}`;
    const sep = raw.includes("?") ? "&" : "?";
    return `${raw}${sep}--proxy-server=${encodeURIComponent(proxyServer)}`;
  } catch {
    return raw;
  }
}

async function launchBrowser(): Promise<Browser> {
  const puppeteer = await loadPuppeteer();
  const browserless = buildBrowserlessEndpoint();

  if (browserless) {
    console.info("[texas-browser] Connecting to remote browser", {
      endpoint: browserless.replace(/token=[^&]+/i, "token=***"),
    });
    return puppeteer.connect({
      browserWSEndpoint: browserless,
      defaultViewport: { width: 1366, height: 768 },
    });
  }

  logProxyCheck(TEXAS_AGENTS_ORIGIN);
  const launchOptions = await buildLaunchOptions();

  console.info("[texas-browser] Launching Chromium (stealth)", {
    proxy: resolveTexasProxyUrl() ? "enabled" : "none",
    railway: isRailwayRuntime(),
    executablePath: launchOptions.executablePath,
    headless: launchOptions.headless,
  });

  const browser = await puppeteer.launch(launchOptions);
  attachBrowserDiagnostics(browser);
  return browser;
}

async function safeGoto(
  page: Page,
  url: string,
  label: string
): Promise<void> {
  try {
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    if (isTargetClosedError(error)) {
      throw new Error(
        `[texas-browser] Chromium crashed during ${label} (Target closed). ` +
          "Railway may be OOM — ensure --disable-dev-shm-usage and --single-process are set."
      );
    }
    throw new Error(
      `[texas-browser] Navigation failed during ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function safeReload(page: Page, label: string): Promise<void> {
  try {
    await page.reload({
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
  } catch (error) {
    if (isTargetClosedError(error)) {
      throw new Error(
        `[texas-browser] Chromium crashed during ${label} (Target closed).`
      );
    }
    throw error;
  }
}

async function openTexasPage(browser: Browser): Promise<Page> {
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    return page;
  } catch (error) {
    if (isTargetClosedError(error)) {
      throw new Error(
        "[texas-browser] Chromium crashed before newPage() (Target closed). " +
          "Check PUPPETEER_EXECUTABLE_PATH and Railway memory limits."
      );
    }
    throw new Error(
      `[texas-browser] browser.newPage() failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function applyProxyAuth(page: Page): Promise<void> {
  const auth = getTexasProxyAuth();
  if (!auth) return;
  await page.authenticate(auth);
}

async function isChallengeVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const title = document.title.toLowerCase();
    const body = document.body?.innerText?.toLowerCase() ?? "";
    return (
      title.includes("just a moment") ||
      title.includes("attention required") ||
      body.includes("checking your browser") ||
      body.includes("verify you are human") ||
      body.includes("enable javascript")
    );
  });
}

async function hasCfClearanceCookie(page: Page): Promise<boolean> {
  const cookies = await page.cookies(TEXAS_AGENTS_ORIGIN);
  return cookies.some((c) => c.name === "cf_clearance");
}

async function tryDismissCloudflareWidget(page: Page): Promise<void> {
  for (const frame of page.frames()) {
    if (!frame.url().includes("challenges.cloudflare.com")) continue;
    try {
      const checkbox = await frame.$(
        'input[type="checkbox"], .ctp-checkbox-label, label'
      );
      if (checkbox) await checkbox.click({ delay: 50 });
    } catch {
      /* challenge iframe may be cross-origin */
    }
  }

  try {
    const verifyBtn = await page.$(
      '#challenge-form input[type="submit"], button[type="submit"]'
    );
    if (verifyBtn) await verifyBtn.click({ delay: 50 });
  } catch {
    /* no legacy challenge form */
  }
}

async function waitForCloudflareClear(page: Page): Promise<void> {
  console.info("[texas-browser] Phase 1: navigate to Texas agents portal", {
    timeoutMs: NAVIGATION_TIMEOUT_MS,
  });
  await safeGoto(page, `${TEXAS_AGENTS_ORIGIN}/`, "portal landing");

  console.info("[texas-browser] Phase 2: waiting for Cloudflare to clear");
  const deadline = Date.now() + CF_CLEAR_TIMEOUT_MS;
  let reloadAttempted = false;

  while (Date.now() < deadline) {
    await tryDismissCloudflareWidget(page);

    const [challenge, cfClearance] = await Promise.all([
      isChallengeVisible(page),
      hasCfClearanceCookie(page),
    ]);

    if (cfClearance && !challenge) {
      console.info("[texas-browser] Phase 2 complete", {
        title: await page.title(),
        cfClearance: true,
      });
      return;
    }

    if (!challenge) {
      const title = (await page.title()).toLowerCase();
      if (!title.includes("just a moment") && !title.includes("attention required")) {
        console.info("[texas-browser] Phase 2 complete", { title });
        return;
      }
    }

    if (
      !reloadAttempted &&
      Date.now() > deadline - CF_CLEAR_TIMEOUT_MS + 25_000 &&
      challenge
    ) {
      reloadAttempted = true;
      console.info("[texas-browser] reloading after stalled Cloudflare challenge");
      await safeReload(page, "portal reload after stalled CF");
    }

    await sleep(1500);
  }

  const title = await page.title();
  const cookieNames = (await page.cookies()).map((c) => c.name);
  throw new Error(
    `Cloudflare did not clear within ${CF_CLEAR_TIMEOUT_MS}ms (title=${title}, cookies=${cookieNames.join(",")})`
  );
}

async function findVisibleField(
  page: Page,
  selectors: string[]
): Promise<ElementHandle | null> {
  for (const selector of selectors) {
    const handles = await page.$$(selector);
    for (const handle of handles) {
      const box = await handle.boundingBox();
      if (box && box.width > 0 && box.height > 0) return handle;
      await handle.dispose();
    }
  }
  return null;
}

async function waitForLoginForm(page: Page): Promise<void> {
  const deadline = Date.now() + LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const usernameField = await findVisibleField(page, USERNAME_SELECTORS);
    const passwordField = await findVisibleField(page, PASSWORD_SELECTORS);
    if (usernameField && passwordField) {
      await usernameField.dispose();
      await passwordField.dispose();
      return;
    }
    if (usernameField) await usernameField.dispose();
    if (passwordField) await passwordField.dispose();
    await sleep(500);
  }

  const loginRoutes = ["/login", "/user/login", "/#/login"];
  for (const route of loginRoutes) {
    console.info("[texas-browser] trying login route", { route });
    await safeGoto(page, `${TEXAS_AGENTS_ORIGIN}${route}`, `login route ${route}`);
    const usernameField = await findVisibleField(page, USERNAME_SELECTORS);
    const passwordField = await findVisibleField(page, PASSWORD_SELECTORS);
    if (usernameField && passwordField) {
      await usernameField.dispose();
      await passwordField.dispose();
      return;
    }
    if (usernameField) await usernameField.dispose();
    if (passwordField) await passwordField.dispose();
  }

  throw new Error("Texas login form not found after Cloudflare clearance");
}

function isTexasSignInResponse(res: HTTPResponse): boolean {
  return (
    res.request().method() === "POST" &&
    res.url().includes("/User/signIn")
  );
}

async function signInViaUi(
  page: Page,
  username: string,
  password: string
): Promise<{ httpStatus: number; data: TexasSignInEnvelope | null }> {
  console.info("[texas-browser] Phase 3: UI login (type + click)");
  await waitForLoginForm(page);

  const signInResponsePromise = page.waitForResponse(isTexasSignInResponse, {
    timeout: LOGIN_TIMEOUT_MS,
  });

  const usernameField = await findVisibleField(page, USERNAME_SELECTORS);
  const passwordField = await findVisibleField(page, PASSWORD_SELECTORS);
  if (!usernameField || !passwordField) {
    throw new Error("Login inputs disappeared before fill");
  }

  await usernameField.click({ count: 3 });
  await usernameField.type(username, { delay: 45 });
  await passwordField.click({ count: 3 });
  await passwordField.type(password, { delay: 45 });

  let submitted = false;
  for (const selector of SUBMIT_SELECTORS) {
    const button = await page.$(selector);
    if (!button) continue;
    const box = await button.boundingBox();
    if (!box || box.width === 0) {
      await button.dispose();
      continue;
    }
    await button.click({ delay: 40 });
    submitted = true;
    await button.dispose();
    break;
  }

  if (!submitted) {
    await passwordField.press("Enter");
  }

  await usernameField.dispose();
  await passwordField.dispose();

  const response = await signInResponsePromise;
  const httpStatus = response.status();
  let data: TexasSignInEnvelope | null = null;
  try {
    data = (await response.json()) as TexasSignInEnvelope;
  } catch {
    data = null;
  }

  await page
    .waitForNavigation({ waitUntil: "networkidle2", timeout: 30_000 })
    .catch(() => undefined);

  return { httpStatus, data };
}

/**
 * Railway-ready browser login: proxy → portal → Cloudflare → UI sign-in → cookies.
 */
export async function texasBrowserSignIn(options: {
  username: string;
  password: string;
}): Promise<TexasBrowserSignInResult> {
  const { username, password } = options;
  let browser: Browser | undefined;

  try {
    browser = await launchBrowser();

    let page: Page;
    try {
      page = await openTexasPage(browser);
      await applyProxyAuth(page);
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
      );
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-US,en;q=0.9",
      });
    } catch (error) {
      console.error("[texas-browser] Failed to open page before navigation", {
        username,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    await waitForCloudflareClear(page);

    const signInResult = await signInViaUi(page, username, password);
    const { httpStatus, data: signInData } = signInResult;

    const envelope: TexasSignInEnvelope | null = signInData;

    if (!isTexasSignInSuccess(envelope)) {
      const texasMessage = getTexasSignInErrorMessage(envelope, httpStatus);
      console.error("[texas-browser] UI signIn rejected", {
        username,
        httpStatus,
        texasMessage,
      });
      return { setCookies: [], signInData: envelope, httpStatus };
    }

    const cookies = await page.cookies(TEXAS_AGENTS_ORIGIN);
    const setCookies = puppeteerCookiesToSetCookieLines(cookies);

    console.info("[texas-browser] Phase 4: session cookies captured", {
      username,
      cookieCount: setCookies.length,
      httpStatus,
    });

    return { setCookies, signInData: envelope, httpStatus };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
