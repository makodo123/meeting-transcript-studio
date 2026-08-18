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
  /** 某個切塊重試時呼叫，可用來在畫面上顯示「重試中」。 */
  onRetry?: (chunkIndex: number, totalChunks: number, attempt: number, maxAttempts: number) => void;
}
