import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  scope?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(
  ctx: RequestContext,
  fn: () => T
): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

export function contextFields(): Record<string, string | undefined> {
  const ctx = storage.getStore();
  if (!ctx) return {};
  return { requestId: ctx.requestId, parentScope: ctx.scope };
}
