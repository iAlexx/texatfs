"use client";

/**
 * @deprecated Logout removed from product UX — route returns 410 unless ENABLE_AUTH_LOGOUT=true.
 */
export function useLogout() {
  return {
    isPending: false,
    mutate: () => {
      throw new Error("تسجيل الخروج غير متاح");
    },
    mutateAsync: async () => {
      throw new Error("تسجيل الخروج غير متاح");
    },
  };
}
