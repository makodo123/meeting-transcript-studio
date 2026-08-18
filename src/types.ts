export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface MeetingMeta {
  title: string;
  date: string;
  participants: string;
}

export type JobStatus = "idle" | "processing" | "done" | "error";
