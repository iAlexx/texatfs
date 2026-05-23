import { z } from "zod";

/** Loose WASenderAPI envelope — normalisation stays in webhook-types.ts. */
export const whatsAppWebhookSchema = z
  .object({
    event: z.string().optional(),
    type: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    message: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type ParsedWhatsAppWebhook = z.infer<typeof whatsAppWebhookSchema>;

export function parseWhatsAppWebhook(raw: unknown):
  | { ok: true; data: ParsedWhatsAppWebhook }
  | { ok: false; error: string } {
  const result = whatsAppWebhookSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid payload" };
}
