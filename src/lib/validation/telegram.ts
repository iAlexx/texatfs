import { z } from "zod";

const telegramUserSchema = z
  .object({
    id: z.number(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    username: z.string().optional(),
  })
  .passthrough();

const telegramChatSchema = z
  .object({
    id: z.number(),
  })
  .passthrough();

const telegramMessageSchema = z
  .object({
    message_id: z.number(),
    chat: telegramChatSchema,
    from: telegramUserSchema.optional(),
    text: z.string().optional(),
  })
  .passthrough();

const telegramCallbackSchema = z
  .object({
    id: z.string(),
    from: telegramUserSchema,
    message: z
      .object({
        message_id: z.number(),
        chat: telegramChatSchema,
      })
      .passthrough()
      .optional(),
    data: z.string().optional(),
  })
  .passthrough();

/** Minimal Telegram Update — enough for routing without crashing on extras. */
export const telegramUpdateSchema = z
  .object({
    update_id: z.number(),
    message: telegramMessageSchema.optional(),
    callback_query: telegramCallbackSchema.optional(),
  })
  .passthrough();

export type ParsedTelegramUpdate = z.infer<typeof telegramUpdateSchema>;

export function parseTelegramUpdate(raw: unknown):
  | { ok: true; data: ParsedTelegramUpdate }
  | { ok: false; error: string } {
  const result = telegramUpdateSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "Invalid update" };
}
