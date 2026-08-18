import type { JobStatus } from "../types";

interface Props {
  status: JobStatus;
  progress: { done: number; total: number };
  error: string;
  notice?: string;
}

export function ProgressPanel({ status, progress, error, notice }: Props) {
  if (status === "idle") return null;

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const label =
    status === "error"
      ? "發生錯誤"
      : status === "done"
        ? "完成！"
        : progress.total > 0
          ? `處理中：第 ${progress.done}/${progress.total} 段`
          : "準備中…";

  return (
    <section className="card">
      <h2>處理進度</h2>
      <p>{label}</p>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${status === "done" ? 100 : pct}%` }} />
      </div>
      {notice && <p className="notice">{notice}</p>}
      {status === "error" && error && <p className="error">{error}</p>}
    </section>
  );
}
