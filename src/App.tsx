import { useEffect, useState } from "react";
import { Dropzone } from "./components/Dropzone";
import { ExportPanel } from "./components/ExportPanel";
import { ProgressPanel } from "./components/ProgressPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TranscriptView } from "./components/TranscriptView";
import { decodeAndChunkAudio } from "./lib/audioChunker";
import { transcribeChunksGemini } from "./lib/geminiClient";
import { clearProgress, loadProgress, saveProgress } from "./lib/resumeStore";
import { transcribeChunks } from "./lib/whisperClient";
import type { Engine, JobStatus, MeetingMeta, TranscriptSegment } from "./types";

const ENGINE_STORAGE_KEY = "voiceToWord.engine";
const OPENAI_API_KEY_STORAGE_KEY = "voiceToWord.openaiApiKey";
const RELAY_URL_STORAGE_KEY = "voiceToWord.relayUrl";
const GEMINI_API_KEY_STORAGE_KEY = "voiceToWord.geminiApiKey";

function App() {
  const [engine, setEngine] = useState<Engine>("openai");
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [relayUrl, setRelayUrl] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<{ count: number; elapsedSeconds: number } | null>(null);
  const [meta, setMeta] = useState<MeetingMeta>({ title: "", date: "", participants: "" });

  useEffect(() => {
    const savedEngine = localStorage.getItem(ENGINE_STORAGE_KEY);
    if (savedEngine === "openai" || savedEngine === "gemini") setEngine(savedEngine);
    setOpenaiApiKey(localStorage.getItem(OPENAI_API_KEY_STORAGE_KEY) ?? "");
    setRelayUrl(localStorage.getItem(RELAY_URL_STORAGE_KEY) ?? "");
    setGeminiApiKey(localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) ?? "");
  }, []);

  const handleEngineChange = (next: Engine) => {
    setEngine(next);
    localStorage.setItem(ENGINE_STORAGE_KEY, next);
  };

  const handleOpenaiApiKeyChange = (key: string) => {
    setOpenaiApiKey(key);
    localStorage.setItem(OPENAI_API_KEY_STORAGE_KEY, key);
  };

  const handleRelayUrlChange = (url: string) => {
    setRelayUrl(url);
    localStorage.setItem(RELAY_URL_STORAGE_KEY, url);
  };

  const handleGeminiApiKeyChange = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
  };

  const handleFileSelected = async (file: File) => {
    if (engine === "openai") {
      if (!openaiApiKey.trim()) {
        setStatus("error");
        setError("請先在上方輸入 OpenAI API 金鑰。");
        return;
      }
      if (!relayUrl.trim()) {
        setStatus("error");
        setError("請先在上方填入中繼伺服器網址（部署 worker/ 資料夾後取得，詳見 README）。");
        return;
      }
    } else {
      if (!geminiApiKey.trim()) {
        setStatus("error");
        setError("請先在上方輸入 Google Gemini API 金鑰。");
        return;
      }
    }

    setStatus("processing");
    setError("");
    setNotice("");
    setStats(null);
    const startedAt = performance.now();

    try {
      const chunks = await decodeAndChunkAudio(file);

      // 斷點續傳：如果同一個檔案（檔名/大小/修改時間都相同）之前用同一個引擎轉錄到一半，
      // 就從上次的進度接著做，不用整份重來。
      const saved = loadProgress(file, engine);
      const canResume = !!saved && saved.totalChunks === chunks.length && saved.doneChunks < chunks.length;
      const startIndex = canResume ? saved!.doneChunks : 0;
      const initialSegments = canResume ? saved!.segments : [];

      if (canResume) {
        setNotice(`偵測到上次未完成的進度，從第 ${startIndex + 1}/${chunks.length} 段繼續轉錄`);
      }

      setSegments(initialSegments);
      setProgress({ done: startIndex, total: chunks.length });

      const onProgress = (done: number, total: number, partial: TranscriptSegment[]) => {
        setProgress({ done, total });
        setSegments(partial);
        saveProgress(file, engine, { totalChunks: total, doneChunks: done, segments: partial });
      };
      const onRetry = (chunkIndex: number, total: number, attempt: number, maxAttempts: number) => {
        setNotice(`第 ${chunkIndex}/${total} 段連線失敗，重試中（${attempt}/${maxAttempts}）…`);
      };

      const result =
        engine === "openai"
          ? await transcribeChunks(chunks, openaiApiKey, relayUrl, onProgress, {
              startIndex,
              initialSegments,
              onRetry,
            })
          : await transcribeChunksGemini(chunks, geminiApiKey, onProgress, {
              startIndex,
              initialSegments,
              onRetry,
            });

      setSegments(result);
      setStatus("done");
      setNotice("");
      setStats({ count: result.length, elapsedSeconds: Math.round((performance.now() - startedAt) / 1000) });
      clearProgress(file, engine);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "發生未知錯誤。");
      setNotice("目前進度已保留，重新拖上同一個檔案可以接著轉錄，不用從頭開始。");
    }
  };

  return (
    <main className="container">
      <h1>會議錄音逐字稿工具</h1>
      <p className="subtitle">上傳會議錄音，自動轉成帶時間戳記的繁體中文逐字稿</p>

      <SettingsPanel
        engine={engine}
        onEngineChange={handleEngineChange}
        openaiApiKey={openaiApiKey}
        onOpenaiApiKeyChange={handleOpenaiApiKeyChange}
        relayUrl={relayUrl}
        onRelayUrlChange={handleRelayUrlChange}
        geminiApiKey={geminiApiKey}
        onGeminiApiKeyChange={handleGeminiApiKeyChange}
      />
      <Dropzone disabled={status === "processing"} onFileSelected={handleFileSelected} />
      <ProgressPanel status={status} progress={progress} error={error} notice={notice} stats={stats} />
      <TranscriptView segments={segments} />
      <ExportPanel segments={segments} meta={meta} onMetaChange={setMeta} />
    </main>
  );
}

export default App;
