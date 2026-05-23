import { z } from "zod";

const texasPagedResultSchema = z
  .object({
    records: z.unknown().optional(),
    totalRecordsCount: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

/** Validates Texas portal JSON envelope before mapping. */
export const texasStatisticsResponseSchema = z
  .object({
    status: z.boolean(),
    result: texasPagedResultSchema.optional(),
  })
  .passthrough();

export function parseTexasStatisticsResponse(raw: unknown):
  | { ok: true; data: z.infer<typeof texasStatisticsResponseSchema> }
  | { ok: false; error: string } {
  const result = texasStatisticsResponseSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    error: result.error.issues[0]?.message ?? "Invalid Texas API response",
  };
}
