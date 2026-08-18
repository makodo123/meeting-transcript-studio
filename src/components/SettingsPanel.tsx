import type { Engine } from "../types";

interface Props {
  engine: Engine;
  onEngineChange: (engine: Engine) => void;
  openaiApiKey: string;
  onOpenaiApiKeyChange: (key: string) => void;
  relayUrl: string;
  onRelayUrlChange: (url: string) => void;
  geminiApiKey: string;
  onGeminiApiKeyChange: (key: string) => void;
}

export function SettingsPanel({
  engine,
  onEngineChange,
  openaiApiKey,
  onOpenaiApiKeyChange,
  relayUrl,
  onRelayUrlChange,
  geminiApiKey,
  onGeminiApiKeyChange,
}: Props) {
  return (
    <section className="card">
      <div className="engine-switch">
        <label>
          <input
            type="radio"
            name="engine"
            checked={engine === "openai"}
            onChange={() => onEngineChange("openai")}
          />
          OpenAI Whisper
        </label>
        <label>
          <input
            type="radio"
            name="engine"
            checked={engine === "gemini"}
            onChange={() => onEngineChange("gemini")}
          />
          Google Gemini
        </label>
      </div>

      {engine === "openai" ? (
        <>
          <label className="field">
            <span>OpenAI API 金鑰</span>
            <input
              type="password"
              placeholder="sk-..."
              value={openaiApiKey}
              onChange={(e) => onOpenaiApiKeyChange(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="hint">
            金鑰只會儲存在你瀏覽器的 localStorage，透過下方的中繼伺服器送到 OpenAI，不會被記錄或存到別的地方。
          </p>

          <label className="field" style={{ marginTop: "1rem" }}>
            <span>中繼伺服器網址</span>
            <input
              type="text"
              placeholder="https://your-worker.your-name.workers.dev"
              value={relayUrl}
              onChange={(e) => onRelayUrlChange(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="hint">
            OpenAI API 不開放瀏覽器直接呼叫，需要部署 <code>worker/</code> 資料夾裡的 Cloudflare Worker
            當中繼站，並把部署後的網址填在這裡（詳見 README）。
          </p>
        </>
      ) : (
        <>
          <label className="field">
            <span>Google Gemini API 金鑰</span>
            <input
              type="password"
              placeholder="AIza..."
              value={geminiApiKey}
              onChange={(e) => onGeminiApiKeyChange(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className="hint">
            可在 Google AI Studio（https://aistudio.google.com/apikey）免費申請。Gemini API 支援瀏覽器直接呼叫，不需要中繼伺服器；金鑰只會儲存在你瀏覽器的
            localStorage，直接從瀏覽器送到 Google。
          </p>
        </>
      )}
    </section>
  );
}
