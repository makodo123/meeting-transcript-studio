import { useEffect, useState } from "react";
import { Dropzone } from "./components/Dropzone";
import { ExportPanel } from "./components/ExportPanel";
import { ProgressPanel } from "./components/ProgressPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { TranscriptView } from "./components/TranscriptView";
import { decodeAndChunkAudio } from "./lib/audioChunker";
import { transcribeChunks } from "./lib/whisperClient";
import type { JobStatus, MeetingMeta, TranscriptSegment } from "./types";

const API_KEY_STORAGE_KEY = "voiceToWord.openaiApiKey";
const RELAY_URL_STORAGE_KEY = "voiceToWord.relayUrl";

function App() {
  const [apiKey, setApiKey] = useState("");
  const [relayUrl, setRelayUrl] = useState("");
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<MeetingMeta>({ title: "", date: "", participants: "" });

  useEffect(() => {
    setApiKey(localStorage.getItem(API_KEY_STORAGE_KEY) ?? "");
    setRelayUrl(localStorage.getItem(RELAY_URL_STORAGE_KEY) ?? "");
  }, []);

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  };

  const handleRelayUrlChange = (url: string) => {
    setRelayUrl(url);
    localStorage.setItem(RELAY_URL_STORAGE_KEY, url);
  };

  const handleFileSelected = async (file: File) => {
    if (!apiKey.trim()) {
      setStatus("error");
      setError("請先在上方輸入 OpenAI API 金鑰。");
      return;
    }
    if (!relayUrl.trim()) {
      setStatus("error");
      setError("請先在上方填入中繼伺服器網址（部署 worker/ 資料夾後取得，詳見 README）。");
      return;
    }

    setStatus("processing");
    setProgress({ done: 0, total: 0 });
    setSegments([]);
    setError("");

    try {
      const chunks = await decodeAndChunkAudio(file);
      setProgress({ done: 0, total: chunks.length });

      const result = await transcribeChunks(chunks, apiKey, relayUrl, (done, total, partial) => {
        setProgress({ done, total });
        setSegments(partial);
      });

      setSegments(result);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "發生未知錯誤。");
    }
  };

  return (
    <main className="container">
      <h1>會議錄音逐字稿工具</h1>
      <p className="subtitle">上傳會議錄音，自動轉成帶時間戳記的繁體中文逐字稿</p>

      <SettingsPanel
        apiKey={apiKey}
        onApiKeyChange={handleApiKeyChange}
        relayUrl={relayUrl}
        onRelayUrlChange={handleRelayUrlChange}
      />
      <Dropzone disabled={status === "processing"} onFileSelected={handleFileSelected} />
      <ProgressPanel status={status} progress={progress} error={error} />
      <TranscriptView segments={segments} />
      <ExportPanel segments={segments} meta={meta} onMetaChange={setMeta} />
    </main>
  );
}

export default App;
