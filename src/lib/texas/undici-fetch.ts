import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";

export type TexasUndiciFetchInit = UndiciRequestInit & { dispatcher?: Dispatcher };

type UndiciFetchFn = (
  input: RequestInfo | URL,
  init?: TexasUndiciFetchInit
) => Promise<Response>;

let undiciFetchPromise: Promise<UndiciFetchFn> | undefined;
let undiciModulePromise: Promise<typeof import("undici")> | undefined;

/**
 * undici 8.0.3+ assigns `worker_threads.markAsUncloneable` without a fallback.
 * Railway runs Node 20 (Dockerfile) where that API is missing →
 * `webidl.util.markAsUncloneable is not a function`.
 *
 * Polyfill a no-op before the first dynamic import so undici loads safely on Node 20.
 * On Node 22+ the native implementation is left untouched.
 */
function ensureWorkerThreadsMarkAsUncloneable(): void {
  try {
    // Dynamic require — never bundled; runs only in Node.js server runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const wt = require("node:worker_threads") as {
      markAsUncloneable?: (obj: unknown) => void;
    };
    if (typeof wt.markAsUncloneable !== "function") {
      wt.markAsUncloneable = () => {};
    }
  } catch {
    /* worker_threads unavailable — undici import will surface the real error */
  }
}

/** Shared dynamic import — applies Node 20 polyfill before loading undici. */
export async function importUndici(): Promise<typeof import("undici")> {
  undiciModulePromise ??= (async () => {
    ensureWorkerThreadsMarkAsUncloneable();
    return import("undici");
  })();
  return undiciModulePromise;
}

/**
 * Lazy undici fetch — never statically import `undici` in route bundles.
 * Webpack-bundled undici breaks with markAsUncloneable on Node 20 / Next.js.
 */
export async function texasUndiciFetch(
  input: Parameters<UndiciFetchFn>[0],
  init?: TexasUndiciFetchInit
): ReturnType<UndiciFetchFn> {
  undiciFetchPromise ??= importUndici().then(
    (m) => m.fetch as unknown as UndiciFetchFn
  );
  const fetch = await undiciFetchPromise;
  return fetch(input, init);
}

export type { Dispatcher };
