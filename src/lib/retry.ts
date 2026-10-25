/**
 * Bounded retry with exponential backoff for network-side effects such as
 * Google Drive backup uploads. Never used to fake success: after the final
 * attempt the original error is thrown so the caller can surface it.
 */
export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms: attempt N waits baseMs * 2^(N-1). Default 500. */
  baseMs?: number;
  /** Optional sleeper (tests inject a no-op). */
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseMs = options.baseMs ?? 500;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(baseMs * 2 ** (attempt - 1));
      }
    }
  }
  throw lastError;
}
