import type { TranscriptSegment } from "../types";
import type { AudioChunk } from "./audioChunker";
import { toTraditionalTaiwan } from "./opencc";

interface WhisperVerboseSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperVerboseResponse {
  segments?: WhisperVerboseSegment[];
}

// OpenAI 的 API 沒有開放瀏覽器直接呼叫（沒有 CORS 標頭），所以要透過一個小型中繼伺服器
// （見 worker/index.js，部署成 Cloudflare Worker）轉發請求。relayUrl 就是那個 Worker 的網址。
async function transcribeChunk(blob: Blob, apiKey: string, relayUrl: string): Promise<WhisperVerboseSegment[]> {
  const formData = new FormData();
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");
  formData.append("language", "zh");

  const res = await fetch(relayUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || detail;
    } catch {
      // ignore parse failure, fall back to statusText
    }
    if (res.status === 401) {
      throw new Error("API 金鑰無效，請確認金鑰是否正確。");
    }
    throw new Error(`Whisper API 呼叫失敗（${res.status}）：${detail}`);
  }

  const data: WhisperVerboseResponse = await res.json();
  return data.segments ?? [];
}

/** 依序對每個切塊呼叫 Whisper API（經由中繼伺服器），並把時間戳記加上該段在原始音檔中的偏移量後回傳。*/
export async function transcribeChunks(
  chunks: AudioChunk[],
  apiKey: string,
  relayUrl: string,
  onProgress: (done: number, total: number, segments: TranscriptSegment[]) => void,
): Promise<TranscriptSegment[]> {
  const result: TranscriptSegment[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const { blob, offsetSeconds } = chunks[i];
    const segments = await transcribeChunk(blob, apiKey, relayUrl);
    for (const seg of segments) {
      const text = toTraditionalTaiwan(seg.text.trim());
      if (text) {
        result.push({ start: offsetSeconds + seg.start, end: offsetSeconds + seg.end, text });
      }
    }
    onProgress(i + 1, chunks.length, [...result]);
  }
  return result;
}
