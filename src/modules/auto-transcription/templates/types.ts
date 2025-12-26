export interface TranscriptEntry {
  id: number;
  name: string;
  time: string;
  text: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
}
