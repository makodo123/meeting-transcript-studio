import type { TranscriptSegment } from "../types";
import type { AudioChunk } from "./audioChunker";
import { toTraditionalTaiwan } from "./opencc";

interface WhisperVerboseSegment {
  start: number;
  end: number;
  text: string;
  no_speech_prob?: number;
  avg_logprob?: number;
}

interface WhisperVerboseResponse {
  segments?: WhisperVerboseSegment[];
}

// Whisper 遇到靜音、背景音樂、或聽不清楚的片段時，不會老實留白，
// 而是會「幻覺」出訓練資料裡背過的句子（中文最常見的就是各種 YouTube 開場/結尾台詞，
// 而且會不斷重複同一句）。這裡用官方文件建議的門檻過濾掉這類低信心片段。
const NO_SPEECH_PROB_THRESHOLD = 0.6;
const AVG_LOGPROB_THRESHOLD = -1;

function isLikelyHallucinatedSilence(seg: WhisperVerboseSegment): boolean {
  const noSpeechProb = seg.no_speech_prob ?? 0;
  const avgLogprob = seg.avg_logprob ?? 0;
  return noSpeechProb > NO_SPEECH_PROB_THRESHOLD && avgLogprob < AVG_LOGPROB_THRESHOLD;
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
  let repeatText = "";
  let repeatCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const { blob, offsetSeconds } = chunks[i];
    const segments = await transcribeChunk(blob, apiKey, relayUrl);
    for (const seg of segments) {
      if (isLikelyHallucinatedSilence(seg)) continue;

      const text = toTraditionalTaiwan(seg.text.trim());
      if (!text) continue;

      // 保險機制：即使 no_speech_prob 沒抓到，同一句話連續出現 3 次以上
      // 也視為幻覺迴圈，只保留前兩次、之後全部略過。
      if (text === repeatText) {
        repeatCount++;
        if (repeatCount >= 2) continue;
      } else {
        repeatText = text;
        repeatCount = 0;
      }

      result.push({ start: offsetSeconds + seg.start, end: offsetSeconds + seg.end, text });
    }
    onProgress(i + 1, chunks.length, [...result]);
  }
  return result;
}
