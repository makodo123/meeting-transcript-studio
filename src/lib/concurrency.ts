/**
 * 以固定的併發數同時處理多個工作，結果依原本的順序回傳。
 *
 * 用來讓多個音檔片段同時送去辨識（而不是一段做完才做下一段），
 * 一小時的會議可以從「12 段依序等待」縮短成「同時跑 N 段」。
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  concurrency: number,
  worker: (item: TIn, index: number) => Promise<TOut>,
  onEachDone?: (index: number, result: TOut) => void,
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length);
  let nextIndex = 0;
  let failure: unknown = null;

  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (failure === null) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        const result = await worker(items[i], i);
        results[i] = result;
        onEachDone?.(i, result);
      } catch (err) {
        // 記下第一個錯誤就停止派工，但仍讓已經在飛的請求自然結束，
        // 避免產生沒人處理的 rejected promise。
        if (failure === null) failure = err;
        return;
      }
    }
  });

  await Promise.all(runners);
  if (failure !== null) throw failure;
  return results;
}
