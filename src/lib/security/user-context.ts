import { createLogger } from "@/lib/observability/logger";

const log = createLogger("security/user-context");

export class UserContextViolation extends Error {
  readonly code = "USER_CONTEXT_VIOLATION";

  constructor(
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "UserContextViolation";
  }
}

export interface UserScopeContext {
  resolvedUserId: string;
  texasUsername?: string | null;
  texasAffiliateId?: string | null;
  whatsappChatId?: string | null;
  cacheKey?: string | null;
}

export function logUserScope(scope: UserScopeContext, step: string): void {
  log.info("user scope", {
    step,
    resolvedUserId: scope.resolvedUserId,
    texasUsername: scope.texasUsername ?? null,
    texasAffiliateId: scope.texasAffiliateId ?? null,
    whatsappChatId: scope.whatsappChatId ?? null,
    cacheKey: scope.cacheKey ?? null,
  });
}

export function abortOnUserContextViolation(
  condition: boolean,
  message: string,
  details: Record<string, unknown> = {}
): void {
  if (!condition) return;
  log.error("USER CONTEXT VIOLATION", { message, ...details });
  throw new UserContextViolation(message, details);
}

export function assertMatchingUserId(
  expectedUserId: string,
  actualUserId: string | null | undefined,
  context: string
): void {
  abortOnUserContextViolation(
    !actualUserId || actualUserId !== expectedUserId,
    `${context}: userId mismatch`,
    { expectedUserId, actualUserId: actualUserId ?? null }
  );
}
