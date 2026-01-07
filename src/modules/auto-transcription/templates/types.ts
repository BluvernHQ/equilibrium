export type SegmentState = 'inaudible' | 'overlapping' | 'no_conversation' | 'unknown' | null;

export interface TranscriptEntry {
  id: number;
  name: string;
  state?: SegmentState;
  time: string;
  text: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}
