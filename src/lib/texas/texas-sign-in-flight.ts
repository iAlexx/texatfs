/**
 * In-flight promise coalescing for Texas signIn(username).
 * Prevents thundering herd — concurrent callers share one Puppeteer/HTTP attempt.
 */
const signInInflight = new Map<string, Promise<string>>();

export function coalesceTexasSignIn(
  key: string,
  run: () => Promise<string>
): Promise<string> {
  const existing = signInInflight.get(key);
  if (existing) {
    console.info("[texas-auth] awaiting in-flight sign-in", {
      keyPrefix: key.split("::")[0],
    });
    return existing;
  }

  const promise = run().finally(() => {
    signInInflight.delete(key);
  });

  signInInflight.set(key, promise);
  return promise;
}
