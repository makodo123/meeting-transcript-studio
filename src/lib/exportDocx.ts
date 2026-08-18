import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { MeetingMeta, TranscriptSegment } from "../types";
import { formatTimestamp } from "./format";

export async function buildDocxBlob(segments: TranscriptSegment[], meta: MeetingMeta): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({ text: meta.title || "會議紀錄", heading: HeadingLevel.HEADING_1 }),
  ];

  if (meta.date) children.push(new Paragraph(`日期：${meta.date}`));
  if (meta.participants) children.push(new Paragraph(`與會者：${meta.participants}`));

  children.push(new Paragraph({ text: "逐字稿", heading: HeadingLevel.HEADING_2 }));

  for (const seg of segments) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `[${formatTimestamp(seg.start)}] `, bold: true }),
          new TextRun({ text: seg.text }),
        ],
      }),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
