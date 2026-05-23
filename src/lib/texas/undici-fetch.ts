import type { Dispatcher, RequestInit as UndiciRequestInit } from "undici";

export type TexasUndiciFetchInit = UndiciRequestInit & { dispatcher?: Dispatcher };

type UndiciFetchFn = (
  input: RequestInfo | URL,
  init?: TexasUndiciFetchInit
) => Promise<Response>;

let undiciFetchPromise: Promise<UndiciFetchFn> | undefined;

/**
 * Lazy undici fetch — never statically import `undici` in route bundles.
 * Webpack-bundled undici breaks with `util.markAsUncloneable is not a function`.
 */
export async function texasUndiciFetch(
  input: Parameters<UndiciFetchFn>[0],
  init?: TexasUndiciFetchInit
): ReturnType<UndiciFetchFn> {
  undiciFetchPromise ??= import("undici").then((m) => m.fetch as UndiciFetchFn);
  const fetch = await undiciFetchPromise;
  return fetch(input, init);
}

export type { Dispatcher };
