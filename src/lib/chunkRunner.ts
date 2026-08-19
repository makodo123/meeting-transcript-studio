import type { ProgressUpdate, TranscribeOptions, TranscriptSegment } from "../types";
import type { AudioChunk } from "./audioChunker";
import { mapWithConcurrency } from "./concurrency";
import { withRetry } from "./retry";

export const DEFAULT_CONCURRENCY = 3;

/**
 * 兩種辨識引擎共用的切塊處理流程：併發送出、自動重試、依序組合結果、回報進度。
 *
 * transcribeOne 只需要負責「把一個切塊轉成逐字稿（時間戳記已含偏移量）」，
 * 併發、重試、排序、續傳 watermark 都由這裡統一處理。
 */
export async function runChunkedTranscription(
  chunks: AudioChunk[],
  options: TranscribeOptions,
  onProgress: (update: ProgressUpdate) => void,
  transcribeOne: (chunk: AudioChunk) => Promise<TranscriptSegment[]>,
  postProcess: (segments: TranscriptSegment[]) => TranscriptSegment[] = (s) => s,
): Promise<TranscriptSegment[]> {
  const startIndex = options.startIndex ?? 0;
  const initialSegments = options.initialSegments ?? [];
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const pending = chunks.slice(startIndex);
  const perChunk: (TranscriptSegment[] | undefined)[] = new Array(pending.length);
  let completedCount = 0;

  const flatten = (upTo: number) => {
    const out: TranscriptSegment[] = [...initialSegments];
    for (let i = 0; i < upTo; i++) {
      const segs = perChunk[i];
      if (segs) out.push(...segs);
    }
    return out;
  };

  const handleChunkDone = () => {
    completedCount++;

    // 續傳只能記錄「從頭連續完成」的部分，否則中斷後會漏掉中間還沒好的段落
    let watermark = 0;
    while (watermark < perChunk.length && perChunk[watermark]) watermark++;

    onProgress({
      done: startIndex + completedCount,
      total: chunks.length,
      segments: postProcess(flatten(perChunk.length)),
      resumeDoneChunks: startIndex + watermark,
      resumeSegments: postProcess(flatten(watermark)),
    });
  };

  await mapWithConcurrency(
    pending,
    concurrency,
    (chunk, index) =>
      withRetry(() => transcribeOne(chunk), {
        onRetry: (attempt, maxAttempts) =>
          options.onRetry?.(startIndex + index + 1, chunks.length, attempt, maxAttempts),
      }),
    (index, result) => {
      perChunk[index] = result;
      handleChunkDone();
    },
  );

  return postProcess(flatten(perChunk.length));
}
