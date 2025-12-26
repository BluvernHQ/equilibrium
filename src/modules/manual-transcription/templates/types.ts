// src/modules/sessions/templates/types.ts

export interface PendingEntry {
  id: string;
  messageIndex: number;
  text: string;
  primaryInput: string;
  primaryList: string[];
  offsetTop?: number; // New
}

export interface TagItem {
  id: string;
  master: string | null;
  primaryList: string[];
  messageIndex: number;
  text: string;
  verticalPositions?: number[]; // New
}

export interface PendingEntry {
  id: string;
  messageIndex: number;
  text: string;
  primaryInput: string;
  primaryList: string[];
  primaryInputClosed?: boolean; // Optional field
}
