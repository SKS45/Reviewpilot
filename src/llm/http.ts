import { LLMError } from "./types.js";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 15_000);

interface PostJsonOptions {
  timeoutMs?: number;
  maxAttempts?: number;
}

/** POST JSON with a timeout, retrying 429/5xx/network errors with backoff (honouring Retry-After). */
export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  opts: PostJsonOptions = {},
): Promise<T> {
  const { timeoutMs = 90_000, maxAttempts = 3 } = opts;
  let lastError: LLMError = new LLMError("request was never attempted");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = new LLMError(`Request failed: ${(err as Error).message}`, undefined, true);
      if (attempt === maxAttempts) throw lastError;
      await sleep(backoff(attempt));
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const text = (await res.text()).slice(0, 500);
    const retryable = res.status === 429 || res.status >= 500;
    lastError = new LLMError(`LLM API ${res.status}: ${text}`, res.status, retryable);
    if (!retryable || attempt === maxAttempts) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : backoff(attempt));
  }

  throw lastError;
}
