/** Diagnostic codes when sub-agents list would be empty. */
export type SubAgentsEmptyReasonCode =
  | "MISSING_CREDENTIALS"
  | "TEXAS_AUTH_FAILED"
  | "TEXAS_RETURNED_ZERO"
  | "DB_DIRECT_CHILDREN_ZERO"
  | "DB_LINK_FAILED"
  | "SELF_FILTER_REMOVED_ALL"
  | "MERGE_DROPPED_ALL"
  | "CACHE_STALE";

export interface SubAgentsDiagnostics {
  viewerId: string;
  hasTexasCredentials: boolean;
  texasUsernameMasked: string | null;
  viewerTexasAffiliateId: string | null;
  texasRowsTotal: number;
  texasChildrenInPortal: number;
  linkableForDb: number;
  linkResult: Record<string, unknown>;
  dbDirectChildrenRaw: number;
  excludedViewerSelf: number;
  afterSelfFilter: number;
  directChildrenReturned: number;
  matchedEnriched: number;
  stubCount: number;
  droppedTexasRows: number;
  emptyReason: SubAgentsEmptyReasonCode | null;
}

export interface SubAgentsEmptyContext {
  texasRowsTotal: number;
  texasChildrenInPortal: number;
  linkableForDb: number;
  linkCreated: number;
  linkSkipped: number;
  dbDirectChildrenRaw: number;
  excludedViewerSelf: number;
  afterSelfFilter: number;
  directChildrenReturned: number;
  matchedEnriched: number;
  stubCount: number;
  droppedTexasRows: number;
}

const EMPTY_REASON_MESSAGES: Record<SubAgentsEmptyReasonCode, string> = {
  MISSING_CREDENTIALS:
    "لا توجد بيانات دخول تكساس مخزّنة — افتح «حسابي» وأعد ربط حساب تكساس.",
  TEXAS_AUTH_FAILED:
    "تعذر تسجيل الدخول إلى لوحة تكساس. تحقق من بيانات الدخول في «حسابي».",
  TEXAS_RETURNED_ZERO:
    "لوحة تكساس لم تُرجع وكلاء فرعيين لهذا الحساب. تحقق من حساب تكساس أو حاول لاحقاً.",
  DB_DIRECT_CHILDREN_ZERO:
    "لا يوجد وكلاء مباشرون مرتبطون في قاعدة البيانات. جاري المزامنة من تكساس… إذا استمر الخطأ، أعد ربط حساب تكساس.",
  DB_LINK_FAILED:
    "تكساس أظهر وكلاء مباشرين لكن فشل ربطهم في قاعدة البيانات. تواصل مع الدعم.",
  SELF_FILTER_REMOVED_ALL:
    "تعارض في تصفية الحساب: تم استبعاد كل الصفوف كحسابك الشخصي. تواصل مع الدعم.",
  MERGE_DROPPED_ALL:
    "تعارض في دمج بيانات تكساس مع قاعدة البيانات. تواصل مع الدعم.",
  CACHE_STALE: "بيانات مخزّنة قديمة — حاول التحديث.",
};

export function messageForSubAgentsEmptyReason(
  code: SubAgentsEmptyReasonCode
): string {
  return EMPTY_REASON_MESSAGES[code];
}

export function maskTexasUsername(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const s = value.trim();
  if (s.length <= 3) return "***";
  return `${s.slice(0, 2)}***${s.slice(-1)}`;
}

export function resolveSubAgentsEmptyReason(
  ctx: SubAgentsEmptyContext
): SubAgentsEmptyReasonCode | null {
  if (ctx.directChildrenReturned > 0) return null;

  if (
    ctx.afterSelfFilter === 0 &&
    ctx.dbDirectChildrenRaw > 0 &&
    ctx.excludedViewerSelf >= ctx.dbDirectChildrenRaw
  ) {
    return "SELF_FILTER_REMOVED_ALL";
  }

  if (ctx.linkableForDb > 0 && ctx.dbDirectChildrenRaw === 0 && ctx.linkCreated === 0) {
    return "DB_LINK_FAILED";
  }

  if (ctx.texasChildrenInPortal === 0 && ctx.texasRowsTotal === 0) {
    return "TEXAS_RETURNED_ZERO";
  }

  if (ctx.dbDirectChildrenRaw === 0 && ctx.afterSelfFilter === 0) {
    if (ctx.linkableForDb > 0) return "DB_LINK_FAILED";
    return "DB_DIRECT_CHILDREN_ZERO";
  }

  if (ctx.afterSelfFilter > 0 && ctx.matchedEnriched === 0 && ctx.stubCount === 0) {
    return "MERGE_DROPPED_ALL";
  }

  return "DB_DIRECT_CHILDREN_ZERO";
}
