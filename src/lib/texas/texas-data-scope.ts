import {
  abortOnUserContextViolation,
  logUserScope,
  type UserScopeContext,
} from "@/lib/security/user-context";
import { pickString, statsRecordMapping } from "@/lib/texas/field-resolver";
import { createLogger } from "@/lib/observability/logger";
import type { NormalizedTexasSnapshot } from "@/lib/texas/types";

const scopeLog = createLogger("texas/data-scope");

export interface TexasDataScopeInput {
  userId: string;
  texasUsername: string | null;
  texasAffiliateId: string | null;
  role: "super_master" | "master" | "player";
}

/**
 * Validates that Texas snapshot totals belong to the authenticated tenant.
 * Logs warnings when affiliateId is missing or unmatched, but does NOT abort.
 */
export function validateTexasSnapshotScope(
  snapshot: NormalizedTexasSnapshot,
  scope: TexasDataScopeInput
): void {
  logUserScope(
    {
      resolvedUserId: scope.userId,
      texasUsername: scope.texasUsername,
      texasAffiliateId: scope.texasAffiliateId,
    },
    "validateTexasSnapshotScope"
  );

  if (scope.role === "super_master") {
    return;
  }

  const affiliateId = scope.texasAffiliateId?.trim();
  if (!affiliateId) {
    scopeLog.warn("texasAffiliateId missing — scope validation skipped", {
      userId: scope.userId,
      role: scope.role,
    });
    return;
  }

  const records = extractStatisticsRecords(snapshot.rawStatistics);
  if (records.length === 0) {
    return;
  }

  const match = records.find((row) => {
    const id = pickString(row, statsRecordMapping.affiliateId);
    return id !== null && id === affiliateId;
  });

  if (!match) {
    scopeLog.warn("affiliateId not found in API response — scope validation skipped", {
      userId: scope.userId,
      texasAffiliateId: affiliateId,
      recordCount: records.length,
    });
  }
}

function extractStatisticsRecords(
  raw: Record<string, unknown>
): Record<string, unknown>[] {
  const result = raw.result;
  if (!result || typeof result !== "object") return [];
  const records = (result as { records?: unknown }).records;
  if (!Array.isArray(records)) return [];
  return records.filter(
    (r): r is Record<string, unknown> => r !== null && typeof r === "object"
  );
}

export function stampCacheScope<T extends object>(
  payload: T,
  scope: UserScopeContext
): T & { _scope: UserScopeContext } {
  return { ...payload, _scope: scope };
}

export function assertCacheScope<T extends { _scope?: UserScopeContext }>(
  payload: T,
  expectedUserId: string,
  cacheKey: string
): T {
  const owner = payload._scope?.resolvedUserId;
  abortOnUserContextViolation(
    owner !== expectedUserId,
    "Cache entry owner mismatch — discarding",
    { cacheKey, expectedUserId, ownerUserId: owner ?? null }
  );
  return payload;
}
