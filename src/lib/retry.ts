/** 標記不應該重試的錯誤（例如金鑰無效），避免浪費時間重試一定會失敗的請求。*/
export class NonRetryableError extends Error {}

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, maxAttempts: number, err: unknown) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 網路不穩時以指數退避（1s、2s、4s…）自動重試，NonRetryableError 不會重試。*/
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof NonRetryableError || attempt === retries) throw err;
      options.onRetry?.(attempt + 1, retries, err);
      await sleep(baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}
