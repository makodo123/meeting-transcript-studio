import type { Engine, TranscriptSegment } from "../types";

// 我們不會把音檔本身存起來（Blob 太大，localStorage 也塞不下），
// 只存「這個檔案轉錄到第幾段、目前逐字稿長怎樣」。
// 因為重新解碼同一個檔案會得到完全一樣的切塊結果，
// 所以只要使用者「重新拖上同一個檔案」，就能從中斷的地方接著轉錄，不用整份重來。
export interface SavedProgress {
  totalChunks: number;
  doneChunks: number;
  segments: TranscriptSegment[];
  savedAt: number;
}

const PREFIX = "voiceToWord.progress.";

function jobKey(file: File, engine: Engine): string {
  return `${PREFIX}${engine}::${file.name}::${file.size}::${file.lastModified}`;
}

export function loadProgress(file: File, engine: Engine): SavedProgress | null {
  try {
    const raw = localStorage.getItem(jobKey(file, engine));
    if (!raw) return null;
    return JSON.parse(raw) as SavedProgress;
  } catch {
    return null;
  }
}

export function saveProgress(file: File, engine: Engine, progress: Omit<SavedProgress, "savedAt">): void {
  try {
    localStorage.setItem(jobKey(file, engine), JSON.stringify({ ...progress, savedAt: Date.now() }));
  } catch {
    // localStorage 滿了或不可用時靜默放棄保存進度，不影響這次轉錄本身
  }
}

export function clearProgress(file: File, engine: Engine): void {
  localStorage.removeItem(jobKey(file, engine));
}
