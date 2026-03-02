/**
 * Shared types and constants for the Sessions module.
 */

// Type for loaded transcript data from database
export interface TranscriptBlock {
  id: string;
  speaker_label: string;
  start_time_seconds: number;
  end_time_seconds: number;
  text: string;
  order_index: number;
}

export interface LoadedTranscript {
  id: string;
  version: number;
  language: string;
  transcription_type: string;
  blocks: TranscriptBlock[];
}

export interface LoadedVideo {
  id: string;
  fileName: string;
  source_url: string;
}

// Selection range within a block for precise highlight persistence
export interface SelectionRange {
  blockId: string;
  startOffset: number;
  endOffset: number;
}

export interface SecondaryTag {
  id?: string;
  value: string;
  comment?: string;
}

export interface PrimaryTagDetail {
  id?: string;
  value: string;
  displayName?: string;
  instanceIndex?: number;
  messageIndex: number;
  blockId?: string;
  blockIds?: string[];
  comment?: string;
  impressionId?: string;
  secondaryTags?: SecondaryTag[];
  selectedText?: string;
  selectionRange?: SelectionRange;
  selectionRanges?: SelectionRange[];
}

export interface TagItem {
  id: string;
  master: string | null;
  masterTagId?: string;
  masterComment?: string;
  masterColor?: string;
  isClosed?: boolean;
  branchTags?: { id: string; name: string }[];
  primaryList: PrimaryTagDetail[];
  allText: string[];
  blockIds: string[];
  selectionRanges?: SelectionRange[];
  verticalOffset?: number;
}

export interface PendingPrimary {
  id?: string;
  value: string;
  displayName?: string;
  comment?: string;
  secondaryTags?: SecondaryTag[];
  showSecondaryInput?: boolean;
}

export interface PendingEntry {
  id: string;
  messageIndex: number;
  blockId?: string;
  blockIds?: string[];
  text: string;
  selectedText: string;
  selectionRange?: SelectionRange;
  selectionRanges?: SelectionRange[];
  primaryInput: string;
  primaryInputClosed?: boolean;
  primaryList: PendingPrimary[];
  branchTags?: { value: string }[];
  verticalOffset?: number;
}

export interface SessionDataItem {
  name: string;
  time: string;
  message: string;
  image: string;
  blockId?: string;
}

export type RowType = 'data' | 'section' | 'subsection' | 'section_close' | 'subsection_close';

export interface DisplayItem {
  id: string;
  type: RowType;
  originalData?: SessionDataItem;
  originalIndex?: number;
  title?: string;
  isEditing?: boolean;
  dbId?: string;
  parentSectionId?: string;
  startBlockIndex?: number;
  endBlockIndex?: number | null;
  isClosed?: boolean;
}

export interface DbSubsection {
  id: string;
  name: string;
  startBlockIndex: number;
  endBlockIndex: number | null;
}

export interface DbSection {
  id: string;
  name: string;
  startBlockIndex: number;
  endBlockIndex: number | null;
  subsections: DbSubsection[];
}

export interface DbTagGroup {
  id?: string;
  masterTag: {
    id: string;
    name: string;
    description?: string;
    color?: string;
    is_closed?: boolean;
  };
  branchTags?: { id: string; name: string }[];
  primaryTags: {
    id: string;
    name: string;
    instanceIndex?: number;
    displayName?: string;
    impressionId: string;
    blockIds: string[];
    selectedText?: string;
    selectionRanges?: SelectionRange[];
    secondaryTags?: { id: string; name: string }[];
    comment?: string;
  }[];
  blockIds: string[];
  selectedText?: string;
  selectionRanges?: SelectionRange[];
}

export interface VideoItem {
  key: string;
  fileName: string;
  url: string;
  size: number;
  lastModified: string;
}

export const speakerColors = [
  "#00A3AF", "#E91E63", "#9C27B0", "#673AB7",
  "#3F51B5", "#2196F3", "#009688", "#4CAF50",
  "#FF9800", "#795548", "#607D8B", "#FF5722"
];

export const masterTagColors = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#2196F3", "#00BCD4", "#009688", "#4CAF50",
  "#8BC34A", "#CDDC39", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#607D8B", "#00A3AF"
];
