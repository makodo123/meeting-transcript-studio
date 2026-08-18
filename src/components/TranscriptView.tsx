import type { TranscriptSegment } from "../types";
import { formatTimestamp } from "../lib/format";

interface Props {
  segments: TranscriptSegment[];
}

export function TranscriptView({ segments }: Props) {
  if (segments.length === 0) return null;

  return (
    <section className="card">
      <h2>逐字稿</h2>
      <div className="transcript">
        {segments.map((seg, i) => (
          <p key={i}>
            <span className="ts">[{formatTimestamp(seg.start)}]</span>
            {seg.text}
          </p>
        ))}
      </div>
    </section>
  );
}
