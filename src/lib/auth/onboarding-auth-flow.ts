/**
 * Pure onboarding routing decisions (unit-tested).
 */
export type OnboardingMode = "existing" | "new";

export type PostPasswordAction =
  | { kind: "relink_active"; message: "skip_license" }
  | { kind: "relink_expired"; message: "ask_renewal_license" }
  | { kind: "register_new"; message: "ask_license" }
  | { kind: "deny_other_telegram"; message: "linked_other" }
  | { kind: "deny_use_existing"; message: "account_exists_use_login" };

export type LicenseStepAction =
  | { kind: "relink_active" }
  | { kind: "relink_with_renewal" }
  | { kind: "register_new" }
  | { kind: "reject_wrong_mode" };

export function resolvePostPasswordAction(params: {
  mode: OnboardingMode;
  accountExists: boolean;
  accountTelegramId: number | null;
  currentTelegramId: number;
  subscriptionActive: boolean;
}): PostPasswordAction {
  const { mode, accountExists, accountTelegramId, currentTelegramId, subscriptionActive } =
    params;

  if (accountExists && accountTelegramId != null) {
    if (accountTelegramId === currentTelegramId) {
      return { kind: "relink_active", message: "skip_license" };
    }
    return { kind: "deny_other_telegram", message: "linked_other" };
  }

  if (accountExists && accountTelegramId == null) {
    if (subscriptionActive) {
      return { kind: "relink_active", message: "skip_license" };
    }
    return { kind: "relink_expired", message: "ask_renewal_license" };
  }

  if (!accountExists) {
    if (mode === "existing") {
      return { kind: "deny_use_existing", message: "account_exists_use_login" };
    }
    return { kind: "register_new", message: "ask_license" };
  }

  return { kind: "register_new", message: "ask_license" };
}

export function resolveLicenseStepAction(params: {
  mode: OnboardingMode;
  accountExists: boolean;
  accountTelegramId: number | null;
  currentTelegramId: number;
  subscriptionActive: boolean;
}): LicenseStepAction {
  const post = resolvePostPasswordAction(params);

  if (post.kind === "deny_other_telegram" || post.kind === "deny_use_existing") {
    return { kind: "reject_wrong_mode" };
  }

  if (post.kind === "relink_active") {
    return { kind: "relink_active" };
  }

  if (post.kind === "relink_expired") {
    return { kind: "relink_with_renewal" };
  }

  if (params.mode === "new" && !params.accountExists) {
    return { kind: "register_new" };
  }

  return { kind: "reject_wrong_mode" };
}

export function parseOnboardingModeChoice(text: string): OnboardingMode | null {
  const t = text.trim();
  if (
    t === "1" ||
    /^(تسجيل(\s+الدخول)?|دخول|حساب\s*موجود|existing|login)$/iu.test(t)
  ) {
    return "existing";
  }
  if (
    t === "2" ||
    /^(إنشاء(\s+حساب)?|جديد|new|register)$/iu.test(t)
  ) {
    return "new";
  }
  return null;
}
