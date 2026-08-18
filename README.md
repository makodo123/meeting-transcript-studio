# 會議錄音逐字稿工具

🔗 **線上使用**：https://makodo123.github.io/meeting-transcript-studio/

把會議錄音轉成帶時間戳記的繁體中文逐字稿，並可匯出成 Word / PDF 會議紀錄。**前端網頁部署在 GitHub Pages**，只搭配一個極簡的 Cloudflare Worker 中繼站（因為 OpenAI API 不開放瀏覽器直接呼叫），音檔本身不會經過任何自建後端。

## 架構

- React + TypeScript + Vite，部署到 GitHub Pages
- 音檔切塊：瀏覽器 Web Audio API 解碼、降到 16kHz 單聲道，切成約 5 分鐘一段（避開 Whisper API 單檔 25MB 限制），全程在瀏覽器記憶體中處理，不需要 ffmpeg
- 語音辨識：呼叫 OpenAI Whisper API（`whisper-1`），取得逐句時間戳記
  - ⚠️ OpenAI API **不支援瀏覽器直接呼叫**（沒有 CORS 標頭），所以請求會先送到 `worker/` 資料夾裡的 Cloudflare Worker，由它轉發給 OpenAI 並補上 CORS 標頭。Worker 不記錄、不儲存你的金鑰，只是單純轉發
- 簡轉繁：`opencc-js`，轉換成台灣繁體用語
- 匯出 Word：`docx` 套件產生 .docx
- 匯出 PDF：把逐字稿畫成 HTML 後用 `html2canvas` 截圖、`jsPDF` 組成 PDF（借用系統中文字型，避免額外打包字型檔）

## 一次性設定：部署 Cloudflare Worker 中繼站

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

1. 開啟網頁後，在最上方分別填入：
   - **OpenAI API 金鑰**（https://platform.openai.com/api-keys 申請）
   - **中繼伺服器網址**（就是上面 wrangler deploy 印出的網址）
2. 這兩個值只會存在你瀏覽器的 `localStorage`，不會被打包進程式碼或提交到 GitHub，也不會經過除了 Cloudflare Worker 以外的任何伺服器
3. 拖曳或選擇音檔上傳，等待處理完成，即可看到帶時間戳記的逐字稿，並匯出 Word / PDF

> 若之後把這個網址分享給別人，對方也需要有自己的 OpenAI 金鑰，並用同一個（或自己部署的）中繼站。

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

- 逐字稿使用 OpenAI Whisper API 產生，錄音會經由你的 Cloudflare Worker 上傳到 OpenAI 的伺服器進行辨識
- 長錄音會在瀏覽器記憶體中處理，非常長（例如 3 小時以上）的錄音在部分裝置上可能會吃較多記憶體
- PDF 匯出是把逐字稿截圖貼進 PDF，文字無法反白選取；Word 匯出則是純文字，可正常編輯搜尋
