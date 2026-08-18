import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // 用相對路徑，不管 repo 名稱是什麼、部署到 GitHub Pages 的哪個子路徑都能正常載入資源
  base: './',
  plugins: [react()],
})
