import { useState } from "react";
import type { MeetingMeta, TranscriptSegment } from "../types";
import { buildDocxBlob } from "../lib/exportDocx";
import { exportPdf } from "../lib/exportPdf";

interface Props {
  segments: TranscriptSegment[];
  meta: MeetingMeta;
  onMetaChange: (meta: MeetingMeta) => void;
}

export function ExportPanel({ segments, meta, onMetaChange }: Props) {
  const [busy, setBusy] = useState<"docx" | "pdf" | null>(null);

  if (segments.length === 0) return null;

  const handleDocx = async () => {
    setBusy("docx");
    try {
      const blob = await buildDocxBlob(segments, meta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "meeting_minutes.docx";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  };

  const handlePdf = async () => {
    setBusy("pdf");
    try {
      await exportPdf(segments, meta);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card">
      <h2>匯出會議紀錄</h2>
      <div className="export-form">
        <label className="field">
          <span>標題</span>
          <input
            type="text"
            placeholder="例：產品週會"
            value={meta.title}
            onChange={(e) => onMetaChange({ ...meta, title: e.target.value })}
          />
        </label>
        <label className="field">
          <span>日期</span>
          <input
            type="text"
            placeholder="例：2026-08-18"
            value={meta.date}
            onChange={(e) => onMetaChange({ ...meta, date: e.target.value })}
          />
        </label>
        <label className="field">
          <span>與會者</span>
          <input
            type="text"
            placeholder="例：小明、小華"
            value={meta.participants}
            onChange={(e) => onMetaChange({ ...meta, participants: e.target.value })}
          />
        </label>
        <div className="export-buttons">
          <button type="button" onClick={handleDocx} disabled={busy !== null}>
            {busy === "docx" ? "產生中…" : "匯出 Word"}
          </button>
          <button type="button" onClick={handlePdf} disabled={busy !== null}>
            {busy === "pdf" ? "產生中…" : "匯出 PDF"}
          </button>
        </div>
      </div>
    </section>
  );
}
