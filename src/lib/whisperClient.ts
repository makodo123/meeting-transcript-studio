import type { ProgressUpdate, TranscribeOptions, TranscriptSegment } from "../types";
import type { AudioChunk } from "./audioChunker";
import { runChunkedTranscription } from "./chunkRunner";
import { toTraditionalTaiwan } from "./opencc";
import { NonRetryableError } from "./retry";

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

/**
 * 保險機制：即使 no_speech_prob 沒抓到，同一句話連續出現 3 次以上
 * 也視為幻覺迴圈，只保留前兩次、之後全部略過。
 *
 * 因為切塊是併發處理的，這個「跨片段」的判斷必須等結果依序組合好之後再做。
 */
function dropRepeatedHallucinations(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  let repeatText = "";
  let repeatCount = 0;

  for (const seg of segments) {
    if (seg.text === repeatText) {
      repeatCount++;
      if (repeatCount >= 2) continue;
    } else {
      repeatText = seg.text;
      repeatCount = 0;
    }
    out.push(seg);
  }
  return out;
}

// OpenAI 的 API 沒有開放瀏覽器直接呼叫（沒有 CORS 標頭），所以要透過一個小型中繼伺服器
// （見 worker/index.js，部署成 Cloudflare Worker）轉發請求。relayUrl 就是那個 Worker 的網址。
async function transcribeChunk(chunk: AudioChunk, apiKey: string, relayUrl: string): Promise<TranscriptSegment[]> {
  const formData = new FormData();
  formData.append("file", chunk.blob, "audio.wav");
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
      throw new NonRetryableError("API 金鑰無效，請確認金鑰是否正確。");
    }
    if (res.status === 429) {
      // 額度/頻率限制通常是暫時的，值得重試
      throw new Error(`Whisper API 額度限制（429）：${detail}`);
    }
    if (res.status >= 400 && res.status < 500) {
      // 其餘 4xx 是請求本身有問題，重試也不會成功
      throw new NonRetryableError(`Whisper API 請求有問題（${res.status}）：${detail}`);
    }
    throw new Error(`Whisper API 呼叫失敗（${res.status}）：${detail}`);
  }

  const data: WhisperVerboseResponse = await res.json();
  const out: TranscriptSegment[] = [];
  for (const seg of data.segments ?? []) {
    if (isLikelyHallucinatedSilence(seg)) continue;
    const text = toTraditionalTaiwan(seg.text.trim());
    if (!text) continue;
    out.push({
      start: chunk.offsetSeconds + seg.start,
      end: chunk.offsetSeconds + seg.end,
      text,
    });
  }
  return out;
}

/** 併發對每個切塊呼叫 Whisper API（經由中繼伺服器），結果依時間順序組合後回傳。*/
export function transcribeChunks(
  chunks: AudioChunk[],
  apiKey: string,
  relayUrl: string,
  onProgress: (update: ProgressUpdate) => void,
  options: TranscribeOptions = {},
): Promise<TranscriptSegment[]> {
  return runChunkedTranscription(
    chunks,
    options,
    onProgress,
    (chunk) => transcribeChunk(chunk, apiKey, relayUrl),
    dropRepeatedHallucinations,
  );
}
