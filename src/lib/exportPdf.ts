import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { MeetingMeta, TranscriptSegment } from "../types";
import { formatTimestamp } from "./format";

const PAGE_MARGIN_PT = 24;

// 每頁是一張獨立的點陣圖，格式選擇會直接決定檔案大小：
// PNG 會被 jsPDF 以未壓縮點陣存進 PDF（一頁就要 10MB 左右），
// JPEG 則是原封不動嵌入壓縮串流，同樣畫質下檔案小一個數量級。
const PAGE_IMAGE_FORMAT = "JPEG" as const;
const PAGE_IMAGE_QUALITY = 0.92;

// 直接嵌入 CJK 字型到 PDF 需要額外的字型檔與較大的套件體積，
// 這裡改用「畫成 HTML → 截圖 → 貼進 PDF」的方式，直接借用瀏覽器/作業系統本身的中文字型，
// 不需要額外打包字型檔，繁體中文一定能正確顯示（缺點是文字不可反白選取）。
function buildContainer(
  segments: TranscriptSegment[],
  meta: MeetingMeta,
): { container: HTMLDivElement; blocks: HTMLElement[] } {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "800px",
    padding: "40px",
    background: "#ffffff",
    color: "#111111",
    fontFamily: '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
  } satisfies Partial<CSSStyleDeclaration>);

  // 每個 block 都是一個「不應該被分頁切開」的單位，分頁時只會在 block 之間下刀
  const blocks: HTMLElement[] = [];
  const add = (el: HTMLElement) => {
    container.appendChild(el);
    blocks.push(el);
  };

  const title = document.createElement("h1");
  title.textContent = meta.title || "會議紀錄";
  title.style.fontSize = "24px";
  title.style.marginBottom = "8px";
  add(title);

  if (meta.date) {
    const p = document.createElement("p");
    p.textContent = `日期：${meta.date}`;
    p.style.margin = "4px 0";
    add(p);
  }
  if (meta.participants) {
    const p = document.createElement("p");
    p.textContent = `與會者：${meta.participants}`;
    p.style.margin = "4px 0";
    add(p);
  }

  const heading = document.createElement("h2");
  heading.textContent = "逐字稿";
  heading.style.fontSize = "18px";
  heading.style.marginTop = "24px";
  add(heading);

  for (const seg of segments) {
    const p = document.createElement("p");
    p.style.margin = "6px 0";
    p.style.fontSize = "13px";
    p.style.lineHeight = "1.6";

    const ts = document.createElement("span");
    ts.textContent = `[${formatTimestamp(seg.start)}] `;
    ts.style.fontWeight = "600";
    ts.style.color = "#4f46e5";
    p.appendChild(ts);
    p.appendChild(document.createTextNode(seg.text));

    add(p);
  }

  return { container, blocks };
}

/**
 * 算出可以安全分頁的位置（畫布像素座標）。
 *
 * 取每個 block 底部與下一個 block 頂部的中間點，這樣切下去一定落在行與行的空隙，
 * 不會像固定高度硬切那樣把文字攔腰切斷。
 */
export function safeCutPoints(container: HTMLElement, blocks: HTMLElement[], pxScale: number): number[] {
  const containerTop = container.getBoundingClientRect().top;
  const cuts: number[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const bottom = blocks[i].getBoundingClientRect().bottom - containerTop;
    const nextTop = i + 1 < blocks.length ? blocks[i + 1].getBoundingClientRect().top - containerTop : bottom;
    cuts.push(((bottom + Math.max(bottom, nextTop)) / 2) * pxScale);
  }
  return cuts;
}

/**
 * 依安全切點決定每一頁的結束位置（畫布像素座標）。
 *
 * 每頁盡量塞滿，但一定切在 cuts 提供的空隙上；只有當單一段落比一整頁還高、
 * 找不到任何可用切點時，才退回硬切，避免無限迴圈。
 */
export function computePageBreaks(cuts: number[], canvasHeight: number, maxSliceHeightPx: number): number[] {
  const breaks: number[] = [];
  let y = 0;

  while (y < canvasHeight) {
    let end = 0;
    for (const cut of cuts) {
      if (cut > y && cut - y <= maxSliceHeightPx) end = cut;
    }
    if (end <= y) end = Math.min(y + maxSliceHeightPx, canvasHeight);
    end = Math.min(Math.ceil(end), canvasHeight);

    breaks.push(end);
    y = end;
  }
  return breaks;
}

export async function buildPdfBlob(segments: TranscriptSegment[], meta: MeetingMeta): Promise<Blob> {
  const { container, blocks } = buildContainer(segments, meta);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });

    // 用實際算出來的比例，不假設 html2canvas 的 scale 一定等於我們給的值
    const pxScale = canvas.height / container.offsetHeight;
    const cuts = safeCutPoints(container, blocks, pxScale);

    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // 畫布像素 → PDF 點 的換算（整份寬度貼滿頁寬，左右留白由容器自己的 padding 提供）
    const ptPerPx = pageWidth / canvas.width;
    const maxSliceHeightPx = (pageHeight - PAGE_MARGIN_PT * 2) / ptPerPx;

    const pageCanvas = document.createElement("canvas");
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) throw new Error("無法建立繪圖畫布，PDF 匯出失敗。");

    let y = 0;
    let firstPage = true;

    for (const end of computePageBreaks(cuts, canvas.height, maxSliceHeightPx)) {
      const sliceHeight = end - y;
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      if (!firstPage) pdf.addPage();
      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", PAGE_IMAGE_QUALITY),
        PAGE_IMAGE_FORMAT,
        0,
        PAGE_MARGIN_PT,
        pageWidth,
        sliceHeight * ptPerPx,
      );

      firstPage = false;
      y = end;
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportPdf(segments: TranscriptSegment[], meta: MeetingMeta): Promise<void> {
  const blob = await buildPdfBlob(segments, meta);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "meeting_minutes.pdf";
  a.click();
  URL.revokeObjectURL(url);
}
