import { z } from "zod";

export const registerPhoneSchema = z.object({
  phone: z.string().trim().min(4).max(20),
  countryCode: z.string().trim().max(6).optional(),
  initData: z.string().optional(),
  telegramUserId: z.number().optional(),
});

export type RegisterPhoneInput = z.infer<typeof registerPhoneSchema>;

export function parseRegisterPhoneBody(raw: unknown):
  | { ok: true; data: RegisterPhoneInput }
  | { ok: false; error: string } {
  const result = registerPhoneSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid body" };
}
