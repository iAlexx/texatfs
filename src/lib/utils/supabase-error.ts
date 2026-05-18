/** Turn Supabase/PostgREST errors into readable Error messages (never `[object Object]`). */
export function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): Error {
  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `code=${error.code}` : null,
  ].filter(Boolean);

  return new Error(parts.join(" | ") || "Database error");
}

export function throwSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): never {
  throw formatSupabaseError(error);
}
