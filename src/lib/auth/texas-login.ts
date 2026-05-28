/**
 * Canonical Texas login normalization for DB storage and lookup.
 * Re-uses texas-api-config rules (trim + lowercase).
 */
import { normalizeTexasUsername } from "@/lib/texas/texas-api-config";

export function normalizeTexasLogin(login: string): string {
  return normalizeTexasUsername(login);
}
