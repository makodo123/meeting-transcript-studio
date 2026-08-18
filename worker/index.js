// Cloudflare Worker：單純把請求轉發給 OpenAI，並加上 CORS 標頭，
// 讓部署在 GitHub Pages 的純前端網頁可以呼叫 OpenAI Whisper API（OpenAI 本身不支援瀏覽器直接呼叫）。
// 這個 Worker 不會記錄、儲存或使用你的 API 金鑰，只是原封不動轉發。

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions";

// 建議部署後把這裡改成你的 GitHub Pages 網域（例如 "https://your-name.github.io"），
// 避免任何網站都能借用這個中繼伺服器打你的額度。
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
    }

    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const upstreamHeaders = new Headers();
    upstreamHeaders.set("Authorization", authHeader);
    const contentType = request.headers.get("Content-Type");
    if (contentType) upstreamHeaders.set("Content-Type", contentType);

    const upstreamResponse = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: upstreamHeaders,
      body: request.body,
      duplex: "half",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    for (const [key, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(key, value);
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
