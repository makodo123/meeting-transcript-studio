export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface MeetingMeta {
  title: string;
  date: string;
  participants: string;
}

export type JobStatus = "idle" | "processing" | "done" | "error";

export type Engine = "openai" | "gemini";

export interface TranscribeOptions {
  /** 從第幾個切塊開始處理（用於斷點續傳，預設從頭開始）。 */
  startIndex?: number;
  /** 續傳時已經轉錄好的逐字稿，會接在新結果前面。 */
  initialSegments?: TranscriptSegment[];
  /** 同時處理幾個切塊，預設 3。調高會更快，但比較容易撞到 API 頻率限制。 */
  concurrency?: number;
  /** 某個切塊重試時呼叫，可用來在畫面上顯示「重試中」。 */
  onRetry?: (chunkIndex: number, totalChunks: number, attempt: number, maxAttempts: number) => void;
}

export interface ProgressUpdate {
  /** 已完成的切塊數（用於進度條）。 */
  done: number;
  total: number;
  /** 目前已完成的逐字稿（依時間排序），用於畫面顯示。 */
  segments: TranscriptSegment[];
  /**
   * 可安全續傳的watermark：因為是併發處理，可能第 3 段做完了第 2 段還沒好，
   * 所以只有「從頭連續完成」的部分能拿來存檔續傳，否則中斷後會漏掉中間的段落。
   */
  resumeDoneChunks: number;
  resumeSegments: TranscriptSegment[];
}
