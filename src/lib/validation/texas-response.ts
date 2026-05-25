import { z } from "zod";

const texasPagedResultSchema = z
  .object({
    records: z.unknown().optional(),
    totalRecordsCount: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .passthrough();

/** Validates Texas portal JSON envelope before mapping. */
export const texasStatisticsResponseSchema = z
  .object({
    status: z.boolean(),
    result: texasPagedResultSchema.optional().nullable(),
  })
  .passthrough();

export function parseTexasStatisticsResponse(raw: unknown):
  | { ok: true; data: z.infer<typeof texasStatisticsResponseSchema> }
  | { ok: false; error: string } {
  const result = texasStatisticsResponseSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const issues = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`
  ).join("; ");

  return {
    ok: false,
    error: issues || "Invalid Texas API response",
  };
}
