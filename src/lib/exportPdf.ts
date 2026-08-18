import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { MeetingMeta, TranscriptSegment } from "../types";
import { formatTimestamp } from "./format";

// 直接嵌入 CJK 字型到 PDF 需要額外的字型檔與較大的套件體積，
// 這裡改用「畫成 HTML → 截圖 → 貼進 PDF」的方式，直接借用瀏覽器/作業系統本身的中文字型，
// 不需要額外打包字型檔，繁體中文一定能正確顯示（缺點是文字不可反白選取）。
function buildContainer(segments: TranscriptSegment[], meta: MeetingMeta): HTMLDivElement {
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

  const title = document.createElement("h1");
  title.textContent = meta.title || "會議紀錄";
  title.style.fontSize = "24px";
  title.style.marginBottom = "8px";
  container.appendChild(title);

  if (meta.date) {
    const p = document.createElement("p");
    p.textContent = `日期：${meta.date}`;
    p.style.margin = "4px 0";
    container.appendChild(p);
  }
  if (meta.participants) {
    const p = document.createElement("p");
    p.textContent = `與會者：${meta.participants}`;
    p.style.margin = "4px 0";
    container.appendChild(p);
  }

  const heading = document.createElement("h2");
  heading.textContent = "逐字稿";
  heading.style.fontSize = "18px";
  heading.style.marginTop = "24px";
  container.appendChild(heading);

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

    container.appendChild(p);
  }

  return container;
}

export async function exportPdf(segments: TranscriptSegment[], meta: MeetingMeta): Promise<void> {
  const container = buildContainer(segments, meta);
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save("meeting_minutes.pdf");
  } finally {
    document.body.removeChild(container);
  }
}
