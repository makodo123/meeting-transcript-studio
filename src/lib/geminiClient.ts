import type { TranscribeOptions, TranscriptSegment } from "../types";
import type { AudioChunk } from "./audioChunker";
import { toTraditionalTaiwan } from "./opencc";
import { NonRetryableError, withRetry } from "./retry";

// Google 的 Generative Language API 支援瀏覽器直接呼叫（有開放 CORS），
// 不像 OpenAI 那樣需要中繼伺服器。
const GEMINI_MODEL = "gemini-3.7-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = [
  "請把這段音訊逐字轉成繁體中文（台灣用語）逐字稿。",
  "依照實際語意分段（大約每句或每個語氣停頓一段），每段輸出獨立一行，格式固定為：",
  "[MM:SS] 文字內容",
  "時間戳記是這段音訊「內部」的相對時間，從 00:00 開始計算，不是絕對時間。",
  "不要輸出任何說明、標題或多餘文字，只要逐字稿本身。",
  "如果整段音訊都沒有人聲（例如純音樂、靜音、雜訊），請不要輸出任何內容。",
].join("\n");

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message?: string };
}

const LINE_PATTERN = /^\[(\d{1,3}):(\d{2})\]\s*(.+)$/;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.substring(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("讀取音檔失敗"));
    reader.readAsDataURL(blob);
  });
}

/** 解析成「這段音訊內部」的相對秒數（呼叫端再加上該切塊在原始音檔中的偏移量）。*/
function parseTranscriptText(text: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(LINE_PATTERN);
    if (!match) continue;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const content = toTraditionalTaiwan(match[3].trim());
    if (!content) continue;

    const start = minutes * 60 + seconds;
    segments.push({ start, end: start, text: content });
  }
  return segments;
}

async function transcribeChunk(blob: Blob, apiKey: string): Promise<TranscriptSegment[]> {
  const base64 = await blobToBase64(blob);

  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ inline_data: { mime_type: "audio/wav", data: base64 } }, { text: PROMPT }],
        },
      ],
    }),
  });

  const data: GeminiResponse = await res.json().catch(() => ({}) as GeminiResponse);

  if (!res.ok) {
    const message = data.error?.message || res.statusText;
    if (res.status === 429) {
      // 額度/頻率限制通常是暫時的，值得重試
      throw new Error(`Gemini API 額度限制（429）：${message}`);
    }
    if (res.status >= 400 && res.status < 500) {
      // 其餘 4xx（通常是金鑰無效或請求本身有問題）重試也不會成功
      throw new NonRetryableError(`Gemini API 金鑰或請求有問題（${res.status}）：${message}`);
    }
    throw new Error(`Gemini API 呼叫失敗（${res.status}）：${message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return parseTranscriptText(text);
}

/** 依序對每個切塊呼叫 Gemini API，並把時間戳記加上該段在原始音檔中的偏移量後回傳。*/
export async function transcribeChunksGemini(
  chunks: AudioChunk[],
  apiKey: string,
  onProgress: (done: number, total: number, segments: TranscriptSegment[]) => void,
  options: TranscribeOptions = {},
): Promise<TranscriptSegment[]> {
  const startIndex = options.startIndex ?? 0;
  const result: TranscriptSegment[] = [...(options.initialSegments ?? [])];

  for (let i = startIndex; i < chunks.length; i++) {
    const { blob, offsetSeconds } = chunks[i];
    const segments = await withRetry(() => transcribeChunk(blob, apiKey), {
      onRetry: (attempt, maxAttempts) => options.onRetry?.(i + 1, chunks.length, attempt, maxAttempts),
    });
    for (const seg of segments) {
      result.push({ start: seg.start + offsetSeconds, end: seg.end + offsetSeconds, text: seg.text });
    }
    onProgress(i + 1, chunks.length, [...result]);
  }
  return result;
}
