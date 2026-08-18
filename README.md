# 會議錄音逐字稿工具

🔗 **線上使用**：https://makodo123.github.io/meeting-transcript-studio/

把會議錄音轉成帶時間戳記的繁體中文逐字稿，並可匯出成 Word / PDF 會議紀錄。**前端網頁部署在 GitHub Pages**，可以選擇 **OpenAI Whisper** 或 **Google Gemini** 兩種語音辨識引擎，音檔本身不會經過任何自建後端（Gemini）或只經過極簡的中繼站（OpenAI，見下方說明）。

## 架構

- React + TypeScript + Vite，部署到 GitHub Pages
- 音檔切塊：瀏覽器 Web Audio API 解碼、降到 16kHz 單聲道，切成約 5 分鐘一段，全程在瀏覽器記憶體中處理，不需要 ffmpeg
- 語音辨識引擎（網頁上可切換）：
  - **OpenAI Whisper**（`whisper-1`）：取得逐句時間戳記
    - ⚠️ OpenAI API **不支援瀏覽器直接呼叫**（沒有 CORS 標頭），所以請求會先送到 `worker/` 資料夾裡的 Cloudflare Worker，由它轉發給 OpenAI 並補上 CORS 標頭。Worker 不記錄、不儲存你的金鑰，只是單純轉發
    - 會自動過濾 Whisper 對靜音/雜音片段的幻覺輸出（重複台詞）
  - **Google Gemini**（`gemini-3.7-flash`）：支援瀏覽器直接呼叫，**不需要中繼伺服器**，用 prompt 請模型輸出帶時間戳記的逐字稿並解析
- 簡轉繁：`opencc-js`，轉換成台灣繁體用語
- 匯出 Word：`docx` 套件產生 .docx
- 匯出 PDF：把逐字稿畫成 HTML 後用 `html2canvas` 截圖、`jsPDF` 組成 PDF（借用系統中文字型，避免額外打包字型檔）
- **自動重試**：單一切塊呼叫失敗時，以指數退避（1s / 2s / 4s）自動重試最多 3 次；金鑰無效這類重試也沒用的錯誤會直接停止，不會白等
- **斷點續傳**：轉錄進度（已完成到第幾段、目前的逐字稿）會存在瀏覽器 `localStorage`。如果中途網路斷線、分頁關掉、或重試 3 次後還是失敗，只要**重新拖上同一個檔案**（檔名、大小、修改時間都相同）就會從中斷的地方接著轉錄，不用整份重來
  - 這裡不會把音檔本身存起來（太大），是靠重新解碼同一個檔案得到一模一樣的切塊結果來對齊進度，所以檔案必須是同一個

## 一次性設定：部署 Cloudflare Worker 中繼站（只有用 OpenAI Whisper 時才需要）

> 如果你只打算用 Google Gemini，可以跳過這一段，直接到「使用網頁」去申請 Gemini 金鑰。

1. 免費註冊 Cloudflare 帳號：https://dash.cloudflare.com/sign-up
2. 在本機安裝 wrangler 並登入：
   ```bash
   cd worker
   npm install -g wrangler
   wrangler login
   ```
3. 部署：
   ```bash
   wrangler deploy
   ```
4. 部署完成後 wrangler 會印出網址，例如 `https://whisper-cors-relay.<你的帳號>.workers.dev`，記下這個網址
5. （建議）把 `worker/index.js` 裡的 `ALLOWED_ORIGIN` 從 `"*"` 改成你的 GitHub Pages 網址（例如 `"https://<帳號>.github.io"`），避免別人拿你的中繼站亂用，改完要重新 `wrangler deploy`

## 使用網頁

1. 開啟網頁後，先選擇要用的引擎：
   - **OpenAI Whisper**：填入 **OpenAI API 金鑰**（https://platform.openai.com/api-keys 申請）與 **中繼伺服器網址**（上面 wrangler deploy 印出的網址）
   - **Google Gemini**：只需要填入 **Gemini API 金鑰**（https://aistudio.google.com/apikey 免費申請），不需要中繼伺服器
2. 金鑰只會存在你瀏覽器的 `localStorage`，不會被打包進程式碼或提交到 GitHub
3. 拖曳或選擇音檔上傳，等待處理完成，即可看到帶時間戳記的逐字稿，並匯出 Word / PDF

> 若之後把這個網址分享給別人，對方也需要有自己的金鑰（用 OpenAI 的話還需要中繼站）。

## 本機開發

```bash
npm install
npm run dev
```

開啟 `http://localhost:5173`。

## 部署到 GitHub Pages

1. 建立 GitHub repo，把這個資料夾的內容 push 上去（`worker/` 資料夾也可以一起放，方便之後重新部署 Worker）
2. 到 repo 的 **Settings → Pages**，「Build and deployment」的 Source 選擇 **GitHub Actions**
3. push 到 `main` 分支後，`.github/workflows/deploy.yml` 會自動 build 並部署，完成後可在 Settings → Pages 看到網址

`vite.config.ts` 已設定 `base: './'`（相對路徑），不管 repo 名稱是什麼都能正常載入資源，不需要另外修改。

## 注意事項

- 逐字稿由 OpenAI Whisper 或 Google Gemini 產生，錄音會上傳到你選擇的服務商伺服器進行辨識
- 長錄音會在瀏覽器記憶體中處理，非常長（例如 3 小時以上）的錄音在部分裝置上可能會吃較多記憶體
- PDF 匯出是把逐字稿截圖貼進 PDF，文字無法反白選取；Word 匯出則是純文字，可正常編輯搜尋
- Gemini 的時間戳記是模型依 prompt 產生的估計值，精確度不如 Whisper 原生回傳的逐句時間戳記
