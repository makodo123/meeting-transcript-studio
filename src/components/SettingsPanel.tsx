interface Props {
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  relayUrl: string;
  onRelayUrlChange: (url: string) => void;
}

export function SettingsPanel({ apiKey, onApiKeyChange, relayUrl, onRelayUrlChange }: Props) {
  return (
    <section className="card">
      <label className="field">
        <span>OpenAI API 金鑰</span>
        <input
          type="password"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
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
    </section>
  );
}
