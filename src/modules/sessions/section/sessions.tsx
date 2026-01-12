"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sessionsData } from "../data/sessions";
import {
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  PlusIcon,
  ChatBubbleBottomCenterTextIcon,
  StopIcon,
  ArrowDownIcon,
  PencilSquareIcon,
  UserIcon as UserIconOutline
} from "@heroicons/react/24/outline";
import { Speaker } from "@/modules/manual-transcription/components/speakers-carousel";
import UserIcon from "../../../../public/icons/profile-circle.png";
import MicrophoneIcon from "../../../../public/icons/spk-icon.png";
import { DeleteModal } from "../components/action-modals";
import {
  MasterTagRow,
  PrimaryTagRow,
  ReservedEditSlotRow,
  BranchTagChip,
  TagRowLayout,
  TagContextHeader,
  ActiveContextBar
} from '../components/tag-hierarchy';
import RecentTags from "../components/RecentTags";
import Link from "next/link";
import NextImage from "next/image";

// Type for loaded transcript data from database
interface TranscriptBlock {
  id: string;
  speaker_label: string;
  start_time_seconds: number;
  end_time_seconds: number;
  text: string;
  order_index: number;
}

interface LoadedTranscript {
  id: string;
  version: number;
  language: string;
  transcription_type: string;
  blocks: TranscriptBlock[];
}

interface LoadedVideo {
  id: string;
  fileName: string;
  source_url: string;
}

// --- 1. DEFINING INTERNAL TYPES ---

// Selection range within a block for precise highlight persistence
export interface SelectionRange {
  blockId: string;
  startOffset: number;
  endOffset: number;
}

interface SecondaryTag {
  id?: string;
  value: string;
  comment?: string;
}

interface PrimaryTagDetail {
  id?: string; // Database primary tag ID
  value: string;
  displayName?: string; // e.g. "Brother (1)"
  instanceIndex?: number; // e.g. 1
  messageIndex: number;
  blockId?: string; // Database block ID
  blockIds?: string[]; // Multiple block IDs
  comment?: string;
  impressionId?: string; // Database impression ID
  secondaryTags?: SecondaryTag[]; // Secondary tags under this primary
  selectedText?: string; // The exact selected text (for card preview)
  selectionRange?: SelectionRange; // Character offsets within the block
  selectionRanges?: SelectionRange[]; // Multiple ranges across blocks
}

interface TagItem {
  id: string;
  master: string | null;
  masterTagId?: string; // Database master tag ID
  masterComment?: string;
  masterColor?: string; // Stored or generated color for this master tag
  isClosed?: boolean;
  branchTags?: { id: string, name: string }[];
  primaryList: PrimaryTagDetail[];
  allText: string[];
  blockIds: string[]; // All block IDs for this tag group

  // Selection data for precise highlight persistence
  selectionRanges?: SelectionRange[];
  verticalOffset?: number; // Pixels from top of block
}

// Updated Pending Entry to support object structure in primaryList
interface PendingPrimary {
  id?: string; // Database primary tag ID if reusing existing
  value: string;
  displayName?: string; // Display name with numbering if reusing
  comment?: string;
  secondaryTags?: SecondaryTag[];
  showSecondaryInput?: boolean; // UI state for showing secondary input
}

export interface PendingEntry {
  id: string;
  messageIndex: number;
  blockId?: string; // Database block ID (legacy/single-block)
  blockIds?: string[]; // Multiple block IDs for multi-block selection
  text: string;
  selectedText: string; // The exact selected text (for display in cards)
  selectionRange?: SelectionRange; // Character offsets within the block (legacy/single-block)
  selectionRanges?: SelectionRange[]; // Character offsets across multiple blocks
  primaryInput: string;
  primaryInputClosed?: boolean;
  primaryList: PendingPrimary[];
  branchTags?: { value: string }[]; // Added branch tags support
  verticalOffset?: number; // Pixels from top of block
}

// Session data item format (compatible with both static data and loaded transcript)
interface SessionDataItem {
  name: string;
  time: string;
  message: string;
  image: string;
  blockId?: string; // Database block ID for linking
}

// Types for the mixed list (Data + Dividers)
type RowType = 'data' | 'section' | 'subsection' | 'section_close' | 'subsection_close';

interface DisplayItem {
  id: string;
  type: RowType;
  originalData?: SessionDataItem;
  originalIndex?: number;
  title?: string;
  isEditing?: boolean;
  // Database fields for sections/subsections
  dbId?: string; // Database ID
  parentSectionId?: string; // For subsections: parent section ID
  startBlockIndex?: number;
  endBlockIndex?: number | null; // null = open/unclosed
  isClosed?: boolean; // Visual indicator
}

// Database Section/Subsection types
interface DbSection {
  id: string;
  name: string;
  startBlockIndex: number;
  endBlockIndex: number | null;
  subsections: DbSubsection[];
}

interface DbSubsection {
  id: string;
  name: string;
  startBlockIndex: number;
  endBlockIndex: number | null;
}

// Database Tag Group (from API)
interface DbTagGroup {
  id?: string;
  masterTag: {
    id: string;
    name: string;
    description?: string;
    color?: string;
    is_closed?: boolean;
  };
  branchTags?: { id: string, name: string }[];
  primaryTags: {
    id: string;
    name: string;
    instanceIndex?: number;
    displayName?: string;
    impressionId: string;
    blockIds: string[];
    selectedText?: string; // The exact selected text
    selectionRanges?: SelectionRange[]; // Character offsets within blocks
    secondaryTags?: { id: string, name: string }[];
    comment?: string;
  }[];
  blockIds: string[];
  selectedText?: string;
  selectionRanges?: SelectionRange[];
}

interface VideoItem {
  key: string;
  fileName: string;
  url: string;
  size: number;
  lastModified: string;
}

// Speaker colors for avatar display
const speakerColors = [
  "#00A3AF", "#E91E63", "#9C27B0", "#673AB7",
  "#3F51B5", "#2196F3", "#009688", "#4CAF50",
  "#FF9800", "#795548", "#607D8B", "#FF5722"
];

// Master tag colors - consistent colors based on ID/name hash
const masterTagColors = [
  "#E91E63", "#9C27B0", "#673AB7", "#3F51B5",
  "#2196F3", "#00BCD4", "#009688", "#4CAF50",
  "#8BC34A", "#CDDC39", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#607D8B", "#00A3AF"
];

// Generate consistent color for a master tag based on its ID or name
function getMasterTagColor(identifier: string): string {
  // Simple hash function to get consistent index
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const index = Math.abs(hash) % masterTagColors.length;
  return masterTagColors[index];
}

// Helper to format seconds to time string (mm:ss)
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper to get speaker display name
function getSpeakerName(label: string): string {
  if (label.match(/^[A-Z]$/)) {
    return `Speaker ${label.charCodeAt(0) - 64}`;
  }
  return label;
}

export default function Sessions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = searchParams.get('videoId');

  const [activeTab, setActiveTab] = useState("current");
  const [displayItems, setDisplayItems] = useState<DisplayItem[]>([]);

  const [sessionData, setSessionData] = useState<SessionDataItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [loadedVideo, setLoadedVideo] = useState<LoadedVideo | null>(null);

  // Session name editing state
  const [isEditingSessionName, setIsEditingSessionName] = useState(false);
  const [sessionNameInput, setSessionNameInput] = useState("");
  const [savingSessionName, setSavingSessionName] = useState(false);

  // Database state
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const [transcriptBlocks, setTranscriptBlocks] = useState<TranscriptBlock[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [dbMasterTags, setDbMasterTags] = useState<{ id: string; name: string }[]>([]);
  const [dbPrimaryTags, setDbPrimaryTags] = useState<{ id: string; name: string; displayName: string; instanceIndex: number }[]>([]);
  const [dbSections, setDbSections] = useState<DbSection[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const persistSpeakersToServer = async (currentSpeakers: Speaker[]) => {
    if (!videoId) return;
    try {
      const speakerData = currentSpeakers.map((speaker) => {
        let avatarKey: string | null = null;
        if (speaker.avatar && speaker.avatar.startsWith('http')) {
          try {
            const url = new URL(speaker.avatar);
            // The key is the entire pathname minus the leading slash
            avatarKey = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
          } catch (e) { }
        }
        return {
          name: speaker.name,
          speaker_label: speaker.name,
          avatar_url: speaker.avatar || null,
          avatar_key: avatarKey,
          is_moderator: speaker.role === 'coordinator',
        };
      });

      const transcriptData = transcriptBlocks.map((block, idx) => ({
        id: idx,
        name: block.speaker_label,
        time: formatTime(block.start_time_seconds),
        text: block.text,
        startTime: block.start_time_seconds,
        endTime: block.end_time_seconds,
      }));

      await fetch("/api/transcriptions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: videoId,
          transcriptData: transcriptData,
          transcriptionType: "manual",
          speakerData: speakerData,
        }),
      });
    } catch (error) {
      console.error("Failed to persist speakers to server:", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, role: 'coordinator' | 'speaker') => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const rolePrefix = role === 'coordinator' ? 'Moderator' : 'Speaker';
      const roleNumbers = speakers
        .map(s => {
          const regex = new RegExp(`^${rolePrefix} (\\d+)$`);
          const match = s.name.match(regex);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
      const nextNumber = roleNumbers.length > 0 ? Math.max(...roleNumbers) + 1 : 1;
      const speakerName = `${rolePrefix} ${nextNumber}`;

      // 1. Optimistic UI Update: Add speaker immediately with a local preview
      const tempId = `uploaded-${Date.now()}-${file.name}`;
      const localPreviewUrl = URL.createObjectURL(file);

      const newSpeaker: Speaker = {
        id: tempId,
        name: speakerName,
        shortName: speakerName,
        avatar: localPreviewUrl,
        isDefault: false,
        role: role
      };

      setSpeakers(prev => [...prev, newSpeaker]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('speakerName', speakerName);
        if (videoId) formData.append('videoId', videoId);

        const response = await fetch('/api/speakers/upload-avatar', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          // 2. Finalize: Replace local preview with permanent server URL
          setSpeakers(prev => {
            const updated = prev.map(s => s.id === tempId ? { ...s, avatar: data.url } : s);
            persistSpeakersToServer(updated);
            return updated;
          });
        } else {
          // If upload failed, remove the optimistic speaker
          setSpeakers(prev => prev.filter(s => s.id !== tempId));
        }
      } catch (error) {
        console.error('Avatar upload error:', error);
        setSpeakers(prev => prev.filter(s => s.id !== tempId));
      } finally {
        e.target.value = "";
      }
    }
  };

  const handleUpdateAvatar = async (id: string, file: File) => {
    // 1. Optimistic UI Update
    const localPreviewUrl = URL.createObjectURL(file);
    setSpeakers(prev => prev.map(s => s.id === id ? { ...s, avatar: localPreviewUrl } : s));

    try {
      const formData = new FormData();
      formData.append('file', file);
      const speaker = speakers.find(s => s.id === id);
      if (speaker) formData.append('speakerName', speaker.name);
      if (videoId) formData.append('videoId', videoId);

      const response = await fetch('/api/speakers/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        // 2. Finalize
        setSpeakers(prev => {
          const updated = prev.map(s => s.id === id ? { ...s, avatar: data.url } : s);
          persistSpeakersToServer(updated);
          return updated;
        });
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
    }
  };

  const handleUpdateSpeaker = (id: string | number, newName: string) => {
    setSpeakers(prev => {
      const updated = prev.map(spk => spk.id === id ? {
        ...spk,
        name: newName,
        shortName: newName.length > 10 ? newName.substring(0, 8) + "..." : newName,
      } : spk);
      persistSpeakersToServer(updated);
      return updated;
    });
  };

  const handleDeleteSpeaker = async (id: string) => {
    // If it's a persistent speaker (has a real database ID), delete from server too
    if (id.length > 20 && !id.startsWith('uploaded-') && !id.startsWith('speaker-')) {
      try {
        await fetch(`/api/speakers/${id}/delete`, { method: 'DELETE' });
      } catch (error) {
        console.error("Failed to delete speaker from server:", error);
      }
    }

    setSpeakers(prev => {
      const updated = prev.filter(s => s.id !== id);
      persistSpeakersToServer(updated);
      return updated;
    });
  };

  // Function to fetch primary tags from database for search/suggestions
  const fetchPrimaryTags = useCallback(async (masterName: string, search: string = "") => {
    const master = dbMasterTags.find(t => t.name.toLowerCase() === masterName.toLowerCase());
    const masterId = master?.id;

    try {
      const url = masterId
        ? `/api/tags/primary?masterTagId=${masterId}&search=${encodeURIComponent(search)}`
        : `/api/tags/primary?masterTagName=${encodeURIComponent(masterName)}&search=${encodeURIComponent(search)}`;

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDbPrimaryTags(data.primaryTags || []);
      }
    } catch (error) {
      console.error("Error fetching primary tags:", error);
    }
  }, [dbMasterTags]);

  // --- Context Menu State ---
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    displayIndex: number;     // Index in displayItems for UI insertion
    transcriptIndex: number;  // Index in original transcript blocks for database
  } | null>(null);

  // Helper to determine hierarchy state at a specific insertion point
  const getHierarchyStateAt = useCallback((displayIndex: number) => {
    let currentSection: DisplayItem | null = null;
    let currentSubsection: DisplayItem | null = null;

    // Scan from top to displayIndex to see what "territory" we are in
    for (let i = 0; i < displayIndex; i++) {
      const item = displayItems[i];
      if (item.type === 'section') {
        currentSection = item;
        currentSubsection = null; // New section resets subsection context
      } else if (item.type === 'section_close') {
        currentSection = null;
        currentSubsection = null;
      } else if (item.type === 'subsection') {
        currentSubsection = item;
      } else if (item.type === 'subsection_close') {
        currentSubsection = null;
      }
    }

    // Also check if there's any unclosed section/subsection in the entire document
    const openSection = displayItems.find(i => i.type === 'section' && !i.isClosed);
    const openSubsection = displayItems.find(i => i.type === 'subsection' && !i.isClosed);

    return {
      activeSection: currentSection,
      activeSubsection: currentSubsection,
      hasOpenSection: !!openSection,
      hasOpenSubsection: !!openSubsection
    };
  }, [displayItems]);

  // --- Master Input State ---
  const [masterInput, setMasterInput] = useState("");
  const [masterConfirmed, setMasterConfirmed] = useState(false);
  const [masterCancelled, setMasterCancelled] = useState(false);
  const [showMasterSuggestions, setShowMasterSuggestions] = useState(false);
  const [masterComment, setMasterComment] = useState(""); // Stored value

  // --- Primary Input State ---
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [showPrimarySuggestions, setShowPrimarySuggestions] = useState<string | null>(null);

  // --- Secondary Tag Input State ---
  const [secondaryInput, setSecondaryInput] = useState<{
    entryId: string;
    primaryIndex: number;
    value: string;
  } | null>(null);

  // --- Branch Tag Input State ---
  const [branchInput, setBranchInput] = useState<{ tagId: string; value: string } | null>(null);
  const [savedPrimaryInput, setSavedPrimaryInput] = useState<{ tagId: string; value: string } | null>(null);

  // Data State
  const [tags, setTags] = useState<TagItem[]>([]);

  // Track the absolute first occurrence of each master tag by ID for sidebar headers
  // Use masterTagId to treat same-name but different-ID tags as separate entities
  const masterTagMetadata = useMemo(() => {
    const metadata: Record<string, {
      firstItemIndex: number,
      lastItemIndex: number,
      color: string,
      id: string,
      masterName: string, // Store name for display
      uniqueIndex: number, // Used for horizontal positioning of vertical lines (Name-based Lane)
      idIndexWithinLane: number, // Used to offset lines within the same lane to avoid collision
      hasDuplicateName: boolean, // True if another tag has same name but different ID
      leftmostLaneUniqueIndex?: number // Track the leftmost lane for a name group
    }> = {};

    let masterCounter = 0;
    const nameToLane = new Map<string, number>();
    const laneToIdCount = new Map<number, number>();

    // First pass: collect all master tags by ID
    const itemsWithTags: { itemIndex: number, masterName: string, masterTagId: string }[] = [];

    displayItems.forEach((item, itemIndex) => {
      if (item.type !== 'data') return;
      const dataIndex = item.originalIndex!;

      const tagsForThisRow = tags.filter(tag => {
        if (tag.primaryList.length > 0) {
          const indices = tag.primaryList.map(p => p.messageIndex);
          return dataIndex >= Math.min(...indices) && dataIndex <= Math.max(...indices);
        } else {
          return tag.blockIds.includes(item.id);
        }
      });

      tagsForThisRow.forEach((tag) => {
        const masterTagId = tag.masterTagId || tag.id;
        const masterName = tag.master || 'No Master';
        itemsWithTags.push({ itemIndex, masterName, masterTagId });
      });
    });

    // Determine unique name groups and their FIRST appearance index
    const nameToFirstIndex = new Map<string, number>();
    itemsWithTags.forEach(it => {
      if (!nameToFirstIndex.has(it.masterName)) {
        nameToFirstIndex.set(it.masterName, it.itemIndex);
      }
    });

    // Sort name groups by appearance index (descending) to avoid collisions (Rule 3.3)
    // Items appearing later vertically get lanes further to the left (smaller x)
    const sortedNames = Array.from(nameToFirstIndex.entries())
      .sort((a, b) => b[1] - a[1]) // DESCENDING index
      .map(entry => entry[0]);

    sortedNames.forEach((name, idx) => {
      nameToLane.set(name, idx);
    });

    // Second pass: build metadata with correct lane indices
    itemsWithTags.forEach(({ itemIndex, masterName, masterTagId }) => {
      if (!metadata[masterTagId]) {
        const laneIndex = nameToLane.get(masterName)!;
        const idIndex = laneToIdCount.get(laneIndex) || 0;
        laneToIdCount.set(laneIndex, idIndex + 1);

        metadata[masterTagId] = {
          firstItemIndex: itemIndex,
          lastItemIndex: itemIndex,
          color: tags.find(t => (t.masterTagId || t.id) === masterTagId)?.masterColor || getMasterTagColor(masterTagId || masterName),
          id: masterTagId,
          masterName: masterName,
          uniqueIndex: laneIndex,
          idIndexWithinLane: idIndex,
          hasDuplicateName: false
        };
      } else {
        metadata[masterTagId].lastItemIndex = itemIndex;
      }
    });

    // Second pass: detect if tags with same name have different IDs
    const nameToIds = new Map<string, Set<string>>();
    Object.values(metadata).forEach(meta => {
      if (!nameToIds.has(meta.masterName)) {
        nameToIds.set(meta.masterName, new Set());
      }
      nameToIds.get(meta.masterName)!.add(meta.id);
    });

    // Mark tags that share names with different IDs
    nameToIds.forEach((ids, name) => {
      if (ids.size > 1) {
        // Multiple IDs share this name - mark all as having duplicate names
        const laneIndex = nameToLane.get(name)!;
        ids.forEach(id => {
          if (metadata[id]) {
            metadata[id].hasDuplicateName = true;
            metadata[id].leftmostLaneUniqueIndex = laneIndex;
          }
        });
      }
    });

    return metadata;
  }, [displayItems, tags]);

  // Impression Number Rules: Impression = Nth master tag created with the same name (Rule 1.1)
  // After deletion, numbers are renumbered to reflect current state (no gaps)
  const impressionIndexes = useMemo(() => {
    const indexes: Record<string, number> = {};

    // Group tags by name and sort by messageIndex (creation order)
    const tagsByName = new Map<string, Array<{ id: string; messageIndex: number; tagIndex: number }>>();

    tags.forEach((tag, tagIndex) => {
      const name = tag.master || 'No Master';

      // Calculate messageIndex: use primary tag's messageIndex if available,
      // otherwise find the block's position in displayItems
      let messageIndex: number;
      if (tag.primaryList.length > 0 && tag.primaryList[0]?.messageIndex !== undefined) {
        messageIndex = tag.primaryList[0].messageIndex;
      } else if (tag.blockIds.length > 0) {
        const blockIndex = displayItems.findIndex(d => d.type === 'data' && d.id === tag.blockIds[0]);
        messageIndex = blockIndex >= 0 ? blockIndex : Infinity;
      } else {
        // Fallback: use tag's position in array as tiebreaker
        messageIndex = Infinity;
      }

      if (!tagsByName.has(name)) {
        tagsByName.set(name, []);
      }
      tagsByName.get(name)!.push({ id: tag.id, messageIndex, tagIndex });
    });

    // For each name group, sort by messageIndex and assign sequential impression numbers
    tagsByName.forEach((tagList, name) => {
      // Sort by messageIndex first (creation order), then by tagIndex as tiebreaker
      tagList.sort((a, b) => {
        if (a.messageIndex !== b.messageIndex) {
          return a.messageIndex - b.messageIndex;
        }
        return a.tagIndex - b.tagIndex;
      });

      // Assign sequential impression numbers (1, 2, 3...) filling gaps after deletion
      tagList.forEach((tag, index) => {
        indexes[tag.id] = index + 1;
      });
    });

    return indexes;
  }, [tags, displayItems]);


  // --- Connector Spine State & Logic ---
  const [spineOffsets, setSpineOffsets] = useState<Record<string, { top: number; height: number }>>({});
  // Dotted line connections for same-name but different-ID master tags
  const [dottedSpineOffsets, setDottedSpineOffsets] = useState<Record<string, { top: number; height: number; masterTagIds: string[]; anchors: Array<{ masterTagId: string; anchorY: number; cardLeft: number }> }>>({});

  // Recalculate spine heights from live DOM bounds whenever layout changes
  useLayoutEffect(() => {
    const container = rightContentRef.current; // Use rightContentRef since cards are positioned relative to it
    if (!container) return;

    const updateSpines = () => {
      // Access tags from the component scope
      const currentTags = tags;
      const containerRect = container.getBoundingClientRect();
      const newOffsets: Record<string, { top: number; height: number }> = {};

      // 1. Calculate SOLID spines (Same masterTagId)
      Object.keys(masterTagMetadata).forEach((masterTagId) => {
        const items = container.querySelectorAll(`[data-spine-item="${masterTagId}"]`);
        // Rule 2.1: Only draw solid spine if there are multiple impressions for this EXACT Master ID
        if (items.length < 2) return;

        let rootTop = -1;
        let lastStemTop = -1;

        items.forEach((item) => {
          const rect = item.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top + container.scrollTop;
          const stemLevel = relativeTop + 18;

          if (item.getAttribute('data-is-root') === 'true') {
            rootTop = stemLevel;
          }

          if (stemLevel > lastStemTop) {
            lastStemTop = stemLevel;
          }
        });

        if (rootTop !== -1 && lastStemTop > rootTop) {
          // Rule 2.1: Solid line from root stem to the last item's stem
          newOffsets[masterTagId] = {
            top: rootTop,
            height: lastStemTop - rootTop
          };
        }
      });

      setSpineOffsets(newOffsets);

      // 2. Calculate DOTTED spines (Same name, different masterTagId) (Rule 2.2)
      // Rule 1.1: Dotted line exists ONLY between master anchors, never extending beyond
      const dottedOffsets: Record<string, { top: number; height: number; masterTagIds: string[]; anchors: Array<{ masterTagId: string; anchorY: number; cardLeft: number }> }> = {};

      // Group tags by name to find same-name different-ID connections
      const nameToIds = new Map<string, string[]>();
      Object.keys(masterTagMetadata).forEach(masterTagId => {
        const meta = masterTagMetadata[masterTagId];
        const name = meta.masterName;
        if (!nameToIds.has(name)) {
          nameToIds.set(name, []);
        }
        if (!nameToIds.get(name)!.includes(masterTagId)) {
          nameToIds.get(name)!.push(masterTagId);
        }
      });

      // For each name group, if there are multiple master instances, draw a dotted line
      nameToIds.forEach((masterTagIds, name) => {
        if (masterTagIds.length > 1) {
          const anchorPositions: Array<{ masterTagId: string; anchorY: number; cardLeft: number }> = [];

          masterTagIds.forEach(masterTagId => {
            // Find all root items for this specific master instance
            const items = container.querySelectorAll(`[data-spine-item="${masterTagId}"][data-is-root="true"]`);
            items.forEach(item => {
              // Find the anchor element (the colored pill) for this specific master instance
              const anchorEl = item.querySelector('[data-tag-anchor="true"]');
              if (anchorEl) {
                const rect = anchorEl.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                // Calculate the exact vertical center of the anchor pill (Rule 2: Exact Anchor Points)
                const relativeTop = rect.top - containerRect.top + container.scrollTop;
                const centerY = relativeTop + (rect.height / 2);

                // Find the card element to get its CSS left position (matches cardLeft calculation)
                const cardElement = item.closest('[data-tag-id]') as HTMLElement;
                // Use CSS left value: Base 64px + master indentation 20px (matches card rendering)
                const cardLeft = 64 + 20;

                anchorPositions.push({
                  masterTagId,
                  anchorY: centerY,
                  cardLeft
                });
              }
            });
          });

          if (anchorPositions.length > 1) {
            // Sort by anchor Y position (top to bottom)
            anchorPositions.sort((a, b) => a.anchorY - b.anchorY);

            // Rule 3.1: Dotted line connects FIRST anchor to LAST anchor
            // Rule 1.1: Line exists ONLY between masters, never extending beyond
            const firstAnchorY = Math.round(anchorPositions[0].anchorY);
            const lastAnchorY = Math.round(anchorPositions[anchorPositions.length - 1].anchorY);

            dottedOffsets[`name-${name}`] = {
              top: firstAnchorY,
              height: Math.max(lastAnchorY - firstAnchorY, 1),
              masterTagIds: masterTagIds,
              anchors: anchorPositions.map(ap => ({
                masterTagId: ap.masterTagId,
                anchorY: Math.round(ap.anchorY),
                cardLeft: ap.cardLeft
              }))
            };
          }
        }
      });

      setDottedSpineOffsets(dottedOffsets);
    };

    // Use ResizeObserver for height changes (wrapping, reflows)
    const resizer = new ResizeObserver(updateSpines);
    resizer.observe(container);

    // Use MutationObserver for appended/removed nodes or text changes
    const mutator = new MutationObserver(updateSpines);
    mutator.observe(container, { childList: true, subtree: true, characterData: true });

    // Ensure we handle window resize too
    window.addEventListener('resize', updateSpines);

    // If the right list container scrolls, keep spines in sync
    container.addEventListener('scroll', updateSpines);

    // Run initial calculation
    updateSpines();

    return () => {
      resizer.disconnect();
      mutator.disconnect();
      window.removeEventListener('resize', updateSpines);
      container.removeEventListener('scroll', updateSpines);
    };
  }, [masterTagMetadata, tags, displayItems]);


  const [highlightedBlockIds, setHighlightedBlockIds] = useState<Set<string>>(new Set());

  // Toast/Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filter State
  const [hideUntagged, setHideUntagged] = useState(false);
  const [filterSection, setFilterSection] = useState<string | null>(null); // Section ID to filter by
  const [filterMaster, setFilterMaster] = useState<string | null>(null); // Master tag ID to filter by

  // Hover state for tag-to-text connection
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  const [hoveredBlockIds, setHoveredBlockIds] = useState<Set<string>>(new Set());

  // Track which master tag name is currently in "Edit Master" mode
  // CRITICAL: Use masterTagId for isolation, NOT name
  // This ensures closing one master doesn't affect others with the same name
  const [activeMasterTagId, setActiveMasterTagId] = useState<string | null>(null);
  const [visibleMasterIds, setVisibleMasterIds] = useState<string[]>([]); // Rule 4.1 - Tracking visibility independently

  // Legacy: Keep editingMasterName for backward compatibility with some checks
  // But prefer activeMasterTagId for isolation logic
  const [editingMasterName, setEditingMasterName] = useState<string | null>(null);

  // Refs for scrolling to blocks
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Inline Edit State
  // State for expanded tag groups (branch tags and secondary tags)
  const [expandedTagGroups, setExpandedTagGroups] = useState<Set<string>>(new Set());

  const toggleTagGroupExpansion = useCallback((groupId: string) => {
    setExpandedTagGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const [editingItem, setEditingItem] = useState<{
    id: string | null;
    type: 'master' | 'primary' | 'master_branch' | 'secondary' | 'master_comment' | 'primary_comment' | 'pending_master_comment' | 'pending_primary' | 'pending_primary_comment' | null;
    index: number | null;
    tempValue: string;
  }>({ id: null, type: null, index: null, tempValue: "" });

  // Delete Modal State
  const [deleteState, setDeleteState] = useState<{
    isOpen: boolean;
    type: 'master' | 'primary';
    tagId: string;
    primaryIndex?: number;
    impressionId?: string;
  }>({ isOpen: false, type: 'master', tagId: '' });

  // Layout Refs
  const [leftRowHeights, setLeftRowHeights] = useState<number[]>([]);
  const leftListRef = useRef<HTMLDivElement | null>(null);
  const rightListRef = useRef<HTMLDivElement | null>(null);
  const rightContentRef = useRef<HTMLDivElement | null>(null);
  const leftRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sharedScrollRootRef = useRef<HTMLDivElement | null>(null); // Shared scroll container for both panes

  // Geometry-driven alignment system
  // Coordinate system: Transcript is source of truth, Sidebar follows
  const [elementPositions, setElementPositions] = useState<Map<number, {
    top: number;
    height: number;
    selectionTop?: number; // For tag alignment with selected text
  }>>(new Map());

  // Collision detection for sidebar tags
  const [tagPositions, setTagPositions] = useState<Map<string, {
    top: number;
    height: number;
    adjustedTop: number; // After collision handling
  }>>(new Map());

  // Find the last open section/subsection for closing
  const findLastOpenSection = useCallback(() => {
    for (let i = displayItems.length - 1; i >= 0; i--) {
      const item = displayItems[i];
      if ((item.type === 'section' || item.type === 'subsection') && !item.isClosed) {
        return { item, index: i };
      }
    }
    return null;
  }, [displayItems]);

  // Find section/subsection context for a given block index
  const findSectionContext = useCallback((blockIndex: number): { sectionId?: string; subsectionId?: string } => {
    let sectionId: string | undefined;
    let subsectionId: string | undefined;

    // Find the section and subsection that contains this block index
    for (let i = 0; i < displayItems.length; i++) {
      const item = displayItems[i];

      if (item.type === 'section' && item.dbId) {
        const start = item.startBlockIndex || 0;
        const end = item.endBlockIndex ?? Infinity;
        if (blockIndex >= start && blockIndex <= end) {
          sectionId = item.dbId;
          subsectionId = undefined; // Reset subsection when entering new section
        }
      }

      if (item.type === 'subsection' && item.dbId) {
        const start = item.startBlockIndex || 0;
        const end = item.endBlockIndex ?? Infinity;
        if (blockIndex >= start && blockIndex <= end) {
          subsectionId = item.dbId;
        }
      }
    }

    return { sectionId, subsectionId };
  }, [displayItems]);

  // --- Active Context State (Single Source of Truth) ---
  // Tracks the current active context for persistent display
  // Computed reactively based on editing state and block positions
  const activeContext = useMemo(() => {
    // Only compute context when in editing mode
    if (!(pending.length > 0 || editingMasterName)) {
      return { sectionName: undefined, subSectionName: undefined, masterTagName: undefined };
    }

    let referenceBlockIndex = -1;

    if (pending.length > 0) {
      referenceBlockIndex = pending[0].messageIndex;
    } else if (activeMasterTagId) {
      // Find the tag by ID to determine context (Rule 1.1)
      const tag = tags.find(t => (t.masterTagId || t.id) === activeMasterTagId);
      if (tag && tag.blockIds.length > 0) {
        const blockItem = displayItems.find(d => d.type === 'data' && d.id === tag.blockIds[0]);
        if (blockItem && blockItem.originalIndex !== undefined) {
          referenceBlockIndex = blockItem.originalIndex;
        }
      }
    }

    let currentSectionName: string | undefined;
    let currentSubSectionName: string | undefined;

    if (referenceBlockIndex !== -1) {
      // Use the existing helper to find section/subsection IDs
      const ctx = findSectionContext(referenceBlockIndex);

      if (ctx.sectionId) {
        const sectionItem = displayItems.find(d => d.type === 'section' && d.dbId === ctx.sectionId);
        // Use title property for section name
        currentSectionName = (sectionItem as any)?.title || (sectionItem as any)?.name;
      }

      if (ctx.subsectionId) {
        const subsectionItem = displayItems.find(d => d.type === 'subsection' && d.dbId === ctx.subsectionId);
        // Use title property for subsection name
        currentSubSectionName = (subsectionItem as any)?.title || (subsectionItem as any)?.name;
      }
    }

    // Determine current master tag name
    let currentMasterTagName: string | undefined = undefined;
    if (editingMasterName) {
      currentMasterTagName = editingMasterName;
    } else if (pending.length > 0) {
      // If pending master confirmed
      if (masterConfirmed) {
        currentMasterTagName = masterInput;
      }
    }

    return {
      sectionName: currentSectionName,
      subSectionName: currentSubSectionName,
      masterTagName: currentMasterTagName,
    };
  }, [pending, editingMasterName, activeMasterTagId, tags, displayItems, findSectionContext, masterConfirmed, masterInput]);

  // Handle tag hover - highlight corresponding blocks in transcript
  const handleTagHover = useCallback((tagId: string | null, blockIds: string[] = []) => {
    setHoveredTagId(tagId);
    setHoveredBlockIds(new Set(blockIds));
  }, []);

  // Scroll to and highlight a tag's first block when clicked
  const scrollToTagBlock = useCallback((blockIds: string[]) => {
    if (blockIds.length === 0) return;

    const firstBlockId = blockIds[0];
    const blockRef = blockRefs.current.get(firstBlockId);

    if (blockRef) {
      blockRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Flash animation
      blockRef.classList.add('flash-highlight');
      setTimeout(() => blockRef.classList.remove('flash-highlight'), 1500);
    }
  }, []);

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Save session name
  const saveSessionName = useCallback(async () => {
    const newName = sessionNameInput.trim();
    if (!newName || !videoId) {
      setIsEditingSessionName(false);
      return;
    }

    setSavingSessionName(true);
    try {
      const response = await fetch('/api/videos/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, fileName: newName }),
      });

      if (response.ok) {
        setLoadedVideo(prev => prev ? { ...prev, fileName: newName } : null);
        showToast("Session name updated!", "success");
      } else {
        showToast("Failed to update session name", "error");
      }
    } catch (error) {
      showToast("Error updating session name", "error");
    } finally {
      setSavingSessionName(false);
    }

    setIsEditingSessionName(false);
  }, [sessionNameInput, videoId, showToast]);

  // Get all unique sections for filtering
  const availableSections = useMemo(() => {
    return displayItems
      .filter(item => item.type === 'section' && item.dbId)
      .map(item => ({ id: item.dbId!, name: item.title || 'Untitled' }));
  }, [displayItems]);

  // Filtered display items based on filters
  const filteredDisplayItems = useMemo(() => {
    if (!hideUntagged && !filterSection && !filterMaster) {
      return displayItems;
    }

    // Get tagged block IDs for hide untagged filter
    const taggedBlockIds = new Set(tags.flatMap(t => t.blockIds || []));

    // Get block IDs for master tag filter
    const masterBlockIds = filterMaster
      ? new Set(tags.filter(t => t.masterTagId === filterMaster || t.master === filterMaster).flatMap(t => t.blockIds))
      : null;

    // Track current section for section filtering
    let currentSectionId: string | null = null;
    let inFilteredSection = false;

    return displayItems.filter((item, index) => {
      // Track section context
      if (item.type === 'section') {
        currentSectionId = item.dbId || null;
        inFilteredSection = !filterSection || currentSectionId === filterSection;

        // Always show section headers if we're filtering by that section
        if (filterSection && currentSectionId === filterSection) {
          return true;
        }
        // If filtering by section, hide other section headers
        if (filterSection && currentSectionId !== filterSection) {
          return false;
        }
        return !filterSection; // Show all sections if no filter
      }

      if (item.type === 'section_close') {
        const matchesFilter = !filterSection || item.dbId === filterSection;
        // Don't reset currentSectionId here yet, because the marker itself might need to be shown
        const result = matchesFilter;
        // Reset context after deciding if to show
        currentSectionId = null;
        inFilteredSection = !filterSection;
        return result;
      }

      // Show subsections within filtered section
      if (item.type === 'subsection' || item.type === 'subsection_close') {
        if (filterSection) {
          return inFilteredSection;
        }
        return true;
      }

      // Data items
      const blockId = item.originalData?.blockId;

      // Apply section filter
      if (filterSection && !inFilteredSection) {
        return false;
      }

      // Apply master tag filter
      if (filterMaster && masterBlockIds) {
        if (!blockId || !masterBlockIds.has(blockId)) {
          return false;
        }
      }

      // Apply hide untagged filter
      if (hideUntagged) {
        if (!blockId || !taggedBlockIds.has(blockId)) {
          return false;
        }
      }

      return true;
    });
  }, [displayItems, hideUntagged, filterSection, filterMaster, tags]);

  // Load transcript from database if videoId is provided
  useEffect(() => {
    if (!videoId) {
      // No videoId, use static demo data
      setSessionData(sessionsData);
      setTranscriptId(null);
      return;
    }

    const fetchTranscript = async () => {
      setLoadingTranscript(true);
      try {
        // Fetch transcript with blocks
        const response = await fetch(`/api/transcriptions/load/${videoId}`);
        if (!response.ok) {
          console.error("Failed to load transcript");
          setSessionData(sessionsData);
          return;
        }

        const data = await response.json();

        if (data.transcription?.blocks && data.transcription.blocks.length > 0) {
          // Store transcript ID and blocks
          setTranscriptId(data.transcription.id);
          setTranscriptBlocks(data.transcription.blocks);

          // Build speaker color map and avatar map from database
          const speakerColorMap = new Map<string, string>();
          const speakerAvatarMap = new Map<string, string>();
          let colorIndex = 0;

          // Load speaker avatars from API response
          if (data.speakers && Array.isArray(data.speakers)) {
            const convertedSpeakers: Speaker[] = data.speakers.map((s: any) => ({
              id: s.id,
              name: s.name,
              shortName: s.name.length > 10 ? s.name.substring(0, 8) + "..." : s.name,
              avatar: s.avatar_url || "",
              isDefault: false,
              role: s.is_moderator ? "coordinator" : "speaker"
            }));
            setSpeakers(convertedSpeakers);

            data.speakers.forEach((speaker: any) => {
              const speakerLabel = speaker.speaker_label || speaker.name;
              if (speaker.avatar_url) {
                speakerAvatarMap.set(speakerLabel, speaker.avatar_url);
              }
            });
          }

          // Convert transcript blocks to session data format with block IDs
          const convertedData: SessionDataItem[] = data.transcription.blocks.map((block: TranscriptBlock) => {
            const speakerLabel = block.speaker_label || "A";

            // Assign color to speaker
            if (!speakerColorMap.has(speakerLabel)) {
              speakerColorMap.set(speakerLabel, speakerColors[colorIndex % speakerColors.length]);
              colorIndex++;
            }

            // Get avatar URL from map, or use empty string (will show placeholder)
            const avatarUrl = speakerAvatarMap.get(speakerLabel) || "";

            return {
              name: getSpeakerName(speakerLabel),
              time: formatTime(block.start_time_seconds),
              message: block.text,
              image: avatarUrl, // Use avatar from database if available
              blockId: block.id, // Store block ID for database linking
            };
          });

          setSessionData(convertedData);

          // Set video info
          if (data.video) {
            setLoadedVideo({
              id: data.video.id,
              fileName: data.video.fileName || "Loaded Video",
              source_url: data.video.source_url || "",
            });
          }

          // Load existing tags and sections for this transcript
          await loadTagsFromDatabase(data.transcription.id, data.transcription.blocks);
        } else {
          // No blocks found, use static demo data
          setSessionData(sessionsData);
        }
      } catch (error) {
        console.error("Failed to fetch transcript:", error);
        setSessionData(sessionsData);
      } finally {
        setLoadingTranscript(false);
      }
    };

    fetchTranscript();
  }, [videoId]);

  // Load tags and sections from database
  const loadTagsFromDatabase = async (tId: string, blocks: TranscriptBlock[]) => {
    try {
      const response = await fetch(`/api/tags/load/${tId}`);
      if (!response.ok) return;

      const data = await response.json();

      // Create a map of block IDs to their indices for messageIndex lookup
      const blockIdToIndex = new Map<string, number>();
      blocks.forEach((block, index) => {
        blockIdToIndex.set(block.id, index);
      });

      // Convert database tag groups to local TagItem format
      if (data.tagGroups && data.tagGroups.length > 0) {
        const loadedTags: TagItem[] = [];

        data.tagGroups.forEach((group: DbTagGroup) => {
          // Check if this group has primary tags
          if (group.primaryTags && group.primaryTags.length > 0) {
            // Each primary tag (impression) should be its own TagItem for independent positioning
            group.primaryTags.forEach((pt) => {
              const allSelectionRanges = pt.selectionRanges || (pt.blockIds[0] ? [{ blockId: pt.blockIds[0], startOffset: 0, endOffset: 0 }] : []);

              // Calculate vertical offset if possible (requires DOM access, might need to be deferred)
              // For now, we'll store the selection data and calculate offset during render or via a helper

              loadedTags.push({
                id: pt.impressionId || pt.id,
                master: group.masterTag.name,
                masterTagId: group.masterTag.id,
                masterComment: group.masterTag.description || undefined,
                masterColor: group.masterTag.color || getMasterTagColor(group.masterTag.id),
                isClosed: group.masterTag.is_closed,
                branchTags: group.branchTags,
                primaryList: [{
                  id: pt.id,
                  value: pt.name,
                  displayName: pt.displayName,
                  instanceIndex: pt.instanceIndex,
                  messageIndex: blockIdToIndex.get(pt.blockIds[0]) ?? -1,
                  blockId: pt.blockIds[0],
                  impressionId: pt.impressionId,
                  comment: pt.comment,
                  secondaryTags: pt.secondaryTags?.map(s => ({ id: s.id, value: s.name })),
                  selectedText: pt.selectedText,
                  selectionRange: pt.selectionRanges?.[0],
                }],
                allText: [pt.selectedText || ""],
                blockIds: pt.blockIds,
                selectionRanges: pt.selectionRanges,
              });
            });
          } else {
            // Master tag without primary tags - create a TagItem with empty primaryList
            // Use the first block ID for messageIndex lookup
            const firstBlockId = group.blockIds && group.blockIds.length > 0 ? group.blockIds[0] : null;

            loadedTags.push({
              id: group.id || `master-${group.masterTag.id}`,
              master: group.masterTag.name,
              masterTagId: group.masterTag.id,
              masterComment: group.masterTag.description || undefined,
              masterColor: group.masterTag.color || getMasterTagColor(group.masterTag.id),
              isClosed: group.masterTag.is_closed,
              branchTags: group.branchTags,
              primaryList: [], // Empty primary list for master-only tags
              allText: [group.selectedText || ""],
              blockIds: group.blockIds || [],
              selectionRanges: group.selectionRanges || [],
            });
          }
        });

        // Sort tags by messageIndex to ensure consistent impression numbering (Rule 2.1)
        loadedTags.sort((a, b) => {
          const aIndex = a.primaryList[0]?.messageIndex ?? 0;
          const bIndex = b.primaryList[0]?.messageIndex ?? 0;
          return aIndex - bIndex;
        });

        setTags(loadedTags);

        // Initialize visibleMasterIds with all unique master IDs (Rule 4.1)
        const uniqueMasterIds = Array.from(new Set(loadedTags.map(t => t.masterTagId || t.id)));
        setVisibleMasterIds(uniqueMasterIds);

        // Set highlight texts to the actual selected texts (not full blocks)
        const allBlockIds = data.tagGroups.flatMap((g: DbTagGroup) => g.blockIds);
        setHighlightedBlockIds(new Set(allBlockIds));
      } else {
        // No tags in database, clear highlights
        setTags([]);
        setVisibleMasterIds([]);
        setHighlightedBlockIds(new Set());
      }

      // Load sections into displayItems (will be merged with data items)
      if (data.sections && data.sections.length > 0) {
        setDbSections(data.sections);
        console.log("Loaded sections:", data.sections);
      } else {
        setDbSections([]);
      }

      // Collect all existing master/primary tags for autocomplete
      const masterTags = data.tagGroups?.map((g: DbTagGroup) => ({
        id: g.masterTag.id,
        name: g.masterTag.name
      })) || [];
      setDbMasterTags(masterTags);

    } catch (error) {
      console.error("Failed to load tags from database:", error);
    }
  };

  // Initialize Display Items when sessionData or dbSections changes
  useEffect(() => {
    if (sessionData.length === 0) return;

    // Start with all data items
    let items: DisplayItem[] = sessionData.map((data, index) => ({
      id: data.blockId || `data-${index}`,
      type: 'data',
      originalData: data,
      originalIndex: index
    }));

    // If we have sections from database, insert them at correct positions
    if (dbSections.length > 0) {
      // Sort sections by start index desc to insert from end to beginning
      // this keeps indices stable while inserting
      const markers: { index: number; item: DisplayItem }[] = [];

      dbSections.forEach(section => {
        // Add section start
        markers.push({
          index: section.startBlockIndex,
          item: {
            id: section.id,
            dbId: section.id,
            type: 'section',
            title: section.name,
            startBlockIndex: section.startBlockIndex,
            endBlockIndex: section.endBlockIndex,
            isClosed: section.endBlockIndex !== null,
            isEditing: false
          }
        });

        // Add section close if it has an end index
        if (section.endBlockIndex !== null) {
          markers.push({
            index: section.endBlockIndex,
            item: {
              id: `${section.id}-close`,
              dbId: section.id,
              type: 'section_close',
              title: section.name,
              startBlockIndex: section.startBlockIndex,
              endBlockIndex: section.endBlockIndex,
              isClosed: true,
              isEditing: false
            }
          });
        }

        // Add subsections
        section.subsections?.forEach(sub => {
          markers.push({
            index: sub.startBlockIndex,
            item: {
              id: sub.id,
              dbId: sub.id,
              type: 'subsection',
              title: sub.name,
              parentSectionId: section.id,
              startBlockIndex: sub.startBlockIndex,
              endBlockIndex: sub.endBlockIndex,
              isClosed: sub.endBlockIndex !== null,
              isEditing: false
            }
          });

          if (sub.endBlockIndex !== null) {
            markers.push({
              index: sub.endBlockIndex,
              item: {
                id: `${sub.id}-close`,
                dbId: sub.id,
                type: 'subsection_close',
                title: sub.name,
                parentSectionId: section.id,
                startBlockIndex: sub.startBlockIndex,
                endBlockIndex: sub.endBlockIndex,
                isClosed: true,
                isEditing: false
              }
            });
          }
        });
      });

      // Sort markers by index desc to insert without shifting following indices
      // For same index: Close markers before Headers, Section headers last (to appear first)
      markers.sort((a, b) => {
        if (b.index !== a.index) return b.index - a.index;

        const isCloseA = a.item.type.includes('close');
        const isCloseB = b.item.type.includes('close');

        if (isCloseA !== isCloseB) {
          return isCloseA ? -1 : 1; // Close markers first in sorted array
        }

        if (isCloseA) {
          // Both are close markers: Section close before Subsection close
          return a.item.type === 'section_close' ? -1 : 1;
        } else {
          // Both are headers: Subsection header before Section header
          return a.item.type === 'subsection' ? -1 : 1;
        }
      });

      // Insert markers
      markers.forEach(marker => {
        // Find the index in the current items list
        // Since we are inserting from the end, the originalIndex of data items still works
        // We need to find the item that has originalIndex === marker.index
        let insertAt = items.findIndex(item => item.type === 'data' && item.originalIndex === marker.index);

        if (insertAt !== -1) {
          // If it's a close marker, insert AFTER the block
          if (marker.item.type.includes('close')) {
            insertAt += 1;
          }
          items.splice(insertAt, 0, marker.item);
        }
      });
    }

    setDisplayItems(items);
  }, [sessionData, dbSections]);

  // Combined master suggestions from local tags AND database tags
  const masterSuggestions = [
    ...tags.map((t) => t.master),
    ...dbMasterTags.map((t) => t.name),
  ]
    .filter((m): m is string => !!m)
    .filter((m, i, arr) => arr.indexOf(m) === i) // Remove duplicates
    .filter((m) => masterInput && m.toLowerCase().includes(masterInput.toLowerCase()));

  const getPrimarySuggestions = (entryId: string) => {
    const entry = pending.find((p) => p.id === entryId);
    if (!entry) return [];

    // Return the list of primary tag instances fetched from the DB
    return dbPrimaryTags;
  };

  useEffect(() => {
    const heights = displayItems.map((item) => leftRowRefs.current.get(item.id)?.offsetHeight || 0);
    setLeftRowHeights(heights);
  }, [pending, tags, displayItems]);

  // ============================================
  // GEOMETRY-DRIVEN COORDINATE SYSTEM
  // ============================================
  // 
  // CRITICAL PRINCIPLE: Measurement-Driven, Not Layout-Driven
  // 
  // This function ALWAYS uses live DOM measurements via getBoundingClientRect().
  // Positions are NEVER cached or assumed. Every calculation reads from the
  // current state of the DOM, ensuring perfect alignment even after:
  // - Text reflow (wrapping, font changes)
  // - Window resize
  // - Zoom changes
  // - Orientation changes
  // - Font loading
  // - Content updates
  //
  // The Transcript pane is the source of truth. The Sidebar mirrors it.
  // ============================================

  const calculateElementPositions = useCallback(() => {
    const transcriptContainer = leftListRef.current;
    const sidebarContainer = rightListRef.current;
    const sidebarContent = rightContentRef.current;
    const sharedScrollRoot = sharedScrollRootRef.current;

    if (!transcriptContainer || !sidebarContainer || !sidebarContent || !sharedScrollRoot) return;

    // CRITICAL: Use shared scroll root as the SINGLE coordinate origin
    const scrollRootRect = sharedScrollRoot.getBoundingClientRect();

    // Use the actual content container in the sidebar as the target coordinate origin
    // This ensures that 'top: 0' in the sidebar matches the top of the scrollable content
    const sidebarContentRect = sidebarContent.getBoundingClientRect();
    const sidebarOffsetInScrollRoot = sidebarContentRect.top - scrollRootRect.top + sharedScrollRoot.scrollTop;

    const newPositions = new Map<number, { top: number; height: number; selectionTop?: number }>();

    // Calculate positions for each display item using CURRENT DOM state
    displayItems.forEach((item, index) => {
      const element = leftRowRefs.current.get(item.id);
      if (!element) {
        // Element not yet rendered - skip but don't break
        return;
      }

      // CRITICAL: Always measure fresh - getBoundingClientRect() is live
      const elementRect = element.getBoundingClientRect();

      // Calculate top relative to SHARED SCROLL ROOT (single coordinate origin)
      // This ensures transcript and sidebar use the same coordinate system
      const relativeTop = elementRect.top - scrollRootRect.top + sharedScrollRoot.scrollTop;
      const height = elementRect.height; // Live height measurement

      // For sidebar positioning: subtract sidebar container's offset
      // This gives us position relative to sidebar container's content area
      const sidebarRelativeTop = relativeTop - sidebarOffsetInScrollRoot;

      // For data items, also calculate selection position if there's a pending entry
      let selectionTop: number | undefined;
      if (item.type === 'data') {
        const dataIndex = item.originalIndex!;
        const pendingEntry = pending.find(p => p.messageIndex === dataIndex);

        if (pendingEntry && pendingEntry.verticalOffset !== undefined) {
          // Recalculate selection position from current element state
          // This ensures selection stays aligned even after text reflow
          const blockElement = element.querySelector('[data-block-text]') || element;
          if (blockElement) {
            // Try to find the actual selection range in the DOM
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              if (blockElement.contains(range.commonAncestorContainer)) {
                const rangeRect = range.getBoundingClientRect();
                const blockRect = blockElement.getBoundingClientRect();
                const liveOffset = rangeRect.top - blockRect.top;
                // Measure selection top relative to scroll root, then adjust for sidebar
                selectionTop = (rangeRect.top - scrollRootRect.top + sharedScrollRoot.scrollTop) - sidebarOffsetInScrollRoot;
              } else {
                // Fallback to stored offset
                selectionTop = sidebarRelativeTop + pendingEntry.verticalOffset;
              }
            } else {
              // No active selection, use stored offset
              selectionTop = sidebarRelativeTop + pendingEntry.verticalOffset;
            }
          } else {
            // Fallback to stored offset
            selectionTop = sidebarRelativeTop + pendingEntry.verticalOffset;
          }
        }
      }

      newPositions.set(index, {
        top: sidebarRelativeTop, // Position relative to sidebar container
        height,
        selectionTop
      });
    });

    // Update positions state - this triggers re-render with new coordinates
    setElementPositions(newPositions);

    // Calculate tag positions with collision detection using fresh measurements
    calculateTagPositions(newPositions, sidebarContainer);
  }, [displayItems, pending, tags]);

  // Calculate tag positions with collision detection
  const calculateTagPositions = useCallback((
    elementPositions: Map<number, { top: number; height: number; selectionTop?: number }>,
    sidebarContainer: HTMLDivElement
  ) => {
    const sidebarRect = sidebarContainer.getBoundingClientRect();
    const newTagPositions = new Map<string, { top: number; height: number; adjustedTop: number }>();
    const occupiedRanges: Array<{ top: number; bottom: number }> = [];
    const MIN_SPACING = 10; // Minimum spacing between tags (px)

    // Process tags in order of their appearance
    const sortedTags = [...tags].sort((a, b) => {
      const getTagMinIndex = (tag: TagItem) => {
        if (tag.primaryList.length > 0) {
          return Math.min(...tag.primaryList.map(p => {
            const itemIndex = displayItems.findIndex(d => d.type === 'data' && d.originalIndex === p.messageIndex);
            return itemIndex >= 0 ? itemIndex : Infinity;
          }));
        } else if (tag.blockIds && tag.blockIds.length > 0) {
          const itemIndex = displayItems.findIndex(d => d.type === 'data' && d.id === tag.blockIds[0]);
          return itemIndex >= 0 ? itemIndex : Infinity;
        }
        return Infinity;
      };
      return getTagMinIndex(a) - getTagMinIndex(b);
    });

    sortedTags.forEach((tag) => {
      // Find the tag's position (using first primary or first block ID)
      const firstPrimary = tag.primaryList[0];
      let itemIndex = -1;

      if (firstPrimary) {
        itemIndex = displayItems.findIndex(d => d.type === 'data' && d.originalIndex === firstPrimary.messageIndex);
      } else if (tag.blockIds && tag.blockIds.length > 0) {
        itemIndex = displayItems.findIndex(d => d.type === 'data' && d.id === tag.blockIds[0]);
      }

      if (itemIndex < 0) return;

      const elementPos = elementPositions.get(itemIndex);
      if (!elementPos) return;

      // Use selection top if available, otherwise use element top
      const intendedTop = elementPos.selectionTop ?? elementPos.top;

      // Measure actual tag height from DOM if available, otherwise estimate
      const tagElement = sidebarContainer.querySelector(`[data-tag-id="${tag.id}"]`) as HTMLElement;
      const actualHeight = tagElement ? tagElement.offsetHeight : 120; // Fallback estimate

      // Check for collisions and adjust
      let adjustedTop = intendedTop;
      let hasCollision = true;
      let iterations = 0;
      const MAX_ITERATIONS = 100; // Safety limit

      while (hasCollision && iterations < MAX_ITERATIONS) {
        iterations++;
        hasCollision = false;
        const adjustedBottom = adjustedTop + actualHeight;

        // Check against all occupied ranges
        for (const range of occupiedRanges) {
          if (
            (adjustedTop >= range.top && adjustedTop < range.bottom) ||
            (adjustedBottom > range.top && adjustedBottom <= range.bottom) ||
            (adjustedTop <= range.top && adjustedBottom >= range.bottom)
          ) {
            // Collision detected, push down
            adjustedTop = range.bottom + MIN_SPACING;
            hasCollision = true;
            break;
          }
        }
      }

      // Record this tag's occupied range
      occupiedRanges.push({
        top: adjustedTop,
        bottom: adjustedTop + actualHeight
      });

      newTagPositions.set(tag.id, {
        top: intendedTop,
        height: actualHeight,
        adjustedTop
      });
    });

    setTagPositions(newTagPositions);
  }, [tags, displayItems]);

  // Real-time position recalculation with observers - FULLY RESPONSIVE
  useLayoutEffect(() => {
    const transcriptContainer = leftListRef.current;
    const sidebarContainer = rightListRef.current;
    const sidebarContent = rightContentRef.current;
    const sharedScrollRoot = sharedScrollRootRef.current;

    if (!transcriptContainer || !sidebarContainer || !sidebarContent || !sharedScrollRoot) return;

    // Debounced calculation to batch rapid updates
    let rafId: number | null = null;
    const scheduleCalculation = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        calculateElementPositions();
        rafId = null;
      });
    };

    // Initial calculation after a brief delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      calculateElementPositions();
    }, 0);

    // ============================================
    // 1. RESIZE OBSERVERS (Container & Content)
    // ============================================

    // CRITICAL: Observe shared scroll root - this is the coordinate origin
    const scrollRootResizer = new ResizeObserver(scheduleCalculation);
    scrollRootResizer.observe(sharedScrollRoot);

    // ResizeObserver for transcript container (width/height changes)
    const transcriptResizer = new ResizeObserver(scheduleCalculation);
    transcriptResizer.observe(transcriptContainer);

    // ResizeObserver for sidebar container (width changes affect layout)
    const sidebarResizer = new ResizeObserver(scheduleCalculation);
    sidebarResizer.observe(sidebarContainer);
    sidebarResizer.observe(sidebarContent);

    // ResizeObserver for individual transcript elements (text reflow)
    const elementResizers = new ResizeObserver(scheduleCalculation);
    const observeElements = () => {
      leftRowRefs.current.forEach((el) => {
        if (el) {
          elementResizers.observe(el);
          // Also observe text content within blocks for reflow
          const textElements = el.querySelectorAll('p, span, div[data-block-text]');
          textElements.forEach((textEl) => {
            elementResizers.observe(textEl);
          });
        }
      });
    };
    observeElements();

    // ResizeObserver for tag elements in sidebar (height changes)
    const tagResizers = new ResizeObserver(scheduleCalculation);
    const observeTags = () => {
      const tagElements = sidebarContainer.querySelectorAll('[data-tag-id]');
      tagElements.forEach((el) => {
        tagResizers.observe(el);
      });
    };
    observeTags();

    // ============================================
    // 2. SCROLL & VIEWPORT EVENTS
    // ============================================

    // CRITICAL: Scroll listener on SHARED SCROLL ROOT (single coordinate origin)
    // Both transcript and sidebar scroll together in this container
    const handleScroll = () => {
      scheduleCalculation();
    };
    sharedScrollRoot.addEventListener('scroll', handleScroll, { passive: true });

    // Visual Viewport API for mobile zoom and viewport changes
    let visualViewport: VisualViewport | null = null;
    if (typeof window !== 'undefined' && window.visualViewport) {
      visualViewport = window.visualViewport;
      visualViewport.addEventListener('resize', scheduleCalculation);
      visualViewport.addEventListener('scroll', scheduleCalculation);
    }

    // ============================================
    // 3. WINDOW & ORIENTATION EVENTS
    // ============================================

    // Window resize listener (desktop)
    const handleResize = () => {
      scheduleCalculation();
    };
    window.addEventListener('resize', handleResize);

    // Orientation change (mobile/tablet)
    const handleOrientationChange = () => {
      // Delay slightly to allow layout to settle
      setTimeout(scheduleCalculation, 100);
    };
    window.addEventListener('orientationchange', handleOrientationChange);

    // ============================================
    // 4. FONT LOAD EVENTS
    // ============================================

    // Font load detection - recalculate when fonts finish loading
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        scheduleCalculation();
      });

      // Also listen for individual font loads
      document.fonts.addEventListener('loadingdone', scheduleCalculation);
    }

    // ============================================
    // 5. MUTATION OBSERVERS (DOM Changes)
    // ============================================

    // Also observe shared scroll root for structural changes
    const scrollRootMutator = new MutationObserver(scheduleCalculation);
    scrollRootMutator.observe(sharedScrollRoot, {
      childList: true,
      subtree: false, // Only direct children
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // MutationObserver for transcript content changes (text edits, wrapping)
    const transcriptMutator = new MutationObserver((mutations) => {
      // Check for text content changes that might cause reflow
      const hasContentChanges = mutations.some(m =>
        m.type === 'characterData' ||
        m.type === 'childList' ||
        (m.type === 'attributes' && (m.attributeName === 'style' || m.attributeName === 'class'))
      );

      if (hasContentChanges) {
        // Re-observe elements that may have changed
        observeElements();
        scheduleCalculation();
      }
    });
    transcriptMutator.observe(transcriptContainer, {
      childList: true,
      subtree: true,
      characterData: true, // Text node changes
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // MutationObserver for sidebar changes (tag creation/deletion)
    const sidebarMutator = new MutationObserver((mutations) => {
      // Check if tags were added/removed
      const hasTagChanges = mutations.some(m =>
        Array.from(m.addedNodes).some(n => (n as Element)?.hasAttribute?.('data-tag-id')) ||
        Array.from(m.removedNodes).some(n => (n as Element)?.hasAttribute?.('data-tag-id'))
      );

      if (hasTagChanges) {
        // Re-observe new tag elements
        observeTags();
        scheduleCalculation();
      } else {
        // Even if no tag changes, recalculate for other DOM changes
        scheduleCalculation();
      }
    });
    sidebarMutator.observe(sidebarContainer, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    // ============================================
    // 6. MEDIA QUERY CHANGES (Optional but helpful)
    // ============================================

    // Listen for media query changes (if using CSS breakpoints)
    let mediaQueryList: MediaQueryList | null = null;
    if (typeof window !== 'undefined' && window.matchMedia) {
      // Example: watch for common breakpoint changes
      const queries = [
        window.matchMedia('(max-width: 768px)'),
        window.matchMedia('(max-width: 1024px)'),
        window.matchMedia('(prefers-reduced-motion: reduce)')
      ];

      queries.forEach(mq => {
        mq.addEventListener('change', scheduleCalculation);
      });

      mediaQueryList = queries[0]; // Store for cleanup
    }

    // ============================================
    // CLEANUP
    // ============================================

    return () => {
      clearTimeout(timeoutId);
      if (rafId !== null) cancelAnimationFrame(rafId);

      // Disconnect observers
      scrollRootResizer.disconnect();
      transcriptResizer.disconnect();
      sidebarResizer.disconnect();
      elementResizers.disconnect();
      tagResizers.disconnect();
      scrollRootMutator.disconnect();
      transcriptMutator.disconnect();
      sidebarMutator.disconnect();

      // Remove event listeners
      sharedScrollRoot.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);

      if (visualViewport) {
        visualViewport.removeEventListener('resize', scheduleCalculation);
        visualViewport.removeEventListener('scroll', scheduleCalculation);
      }

      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.removeEventListener('loadingdone', scheduleCalculation);
      }

      if (mediaQueryList && typeof window !== 'undefined' && window.matchMedia) {
        const queries = [
          window.matchMedia('(max-width: 768px)'),
          window.matchMedia('(max-width: 1024px)'),
          window.matchMedia('(prefers-reduced-motion: reduce)')
        ];
        queries.forEach(mq => {
          mq.removeEventListener('change', scheduleCalculation);
        });
      }
    };
  }, [calculateElementPositions, displayItems, tags, pending]);

  // Force recalculation when displayItems change (new sections, subsections, etc.)
  useEffect(() => {
    // Small delay to ensure DOM has updated
    const timeoutId = setTimeout(() => {
      calculateElementPositions();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [displayItems.length, calculateElementPositions]);

  // Only load from localStorage when NOT loading from database (no videoId)
  useEffect(() => {
    if (videoId) return; // Skip localStorage when we have a videoId (will load from DB)

    const saved = localStorage.getItem("selectedTags_v7");
    if (saved) {
      try {
        const parsed: TagItem[] = JSON.parse(saved);
        setTags(parsed || []);
        setHighlightedBlockIds(new Set(parsed.flatMap((t) => t.blockIds || [])));
      } catch {
        // ignore parse errors
      }
    }
  }, [videoId]);

  // Only save to localStorage when NOT using database (no videoId)
  useEffect(() => {
    if (videoId) return; // Don't save to localStorage when using database
    localStorage.setItem("selectedTags_v7", JSON.stringify(tags));
  }, [tags, videoId]);

  // Fetch uploaded videos
  useEffect(() => {
    const fetchVideos = async () => {
      setLoadingVideos(true);
      try {
        const response = await fetch("/api/videos");
        if (response.ok) {
          const data = await response.json();
          setVideos(data.videos || []);
        }
      } catch (error) {
        console.error("Failed to fetch videos:", error);
      } finally {
        setLoadingVideos(false);
      }
    };

    fetchVideos();
  }, []);

  // Fetch global master tags for autocomplete
  useEffect(() => {
    const fetchGlobalMasterTags = async () => {
      try {
        const res = await fetch("/api/tags/master");
        if (res.ok) {
          const data = await res.json();
          setDbMasterTags(data.masterTags || []);
        }
      } catch (error) {
        console.error("Error fetching master tags:", error);
      }
    };
    fetchGlobalMasterTags();
  }, []);

  // --- CONTEXT MENU HANDLERS ---
  const handleContextMenu = (e: React.MouseEvent, displayIndex: number, transcriptIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      displayIndex,
      transcriptIndex
    });
  };

  const handleAddDivider = (type: 'section' | 'subsection') => {
    if (!contextMenu) return;
    const { displayIndex, transcriptIndex } = contextMenu;

    // Rule-driven validation at the state level using displayIndex for layout scanning
    const { activeSection, activeSubsection, hasOpenSection, hasOpenSubsection } = getHierarchyStateAt(displayIndex);

    if (type === 'section') {
      // ❌ Rule: A Section cannot be created inside another Section (open or closed).
      if (activeSection) {
        showToast("Sections cannot be nested. Move outside the current Section boundaries.", "error");
        setContextMenu(null);
        return;
      }
      // ❌ Rule: A new Section cannot be created if there is an unclosed Section elsewhere.
      if (hasOpenSection) {
        showToast("Close the currently open Section before starting a new one.", "error");
        setContextMenu(null);
        return;
      }
    }

    if (type === 'subsection') {
      // ❌ Rule: A Subsection can only exist inside a Section.
      if (!activeSection) {
        showToast("Subsections can only be created inside a Section.", "error");
        setContextMenu(null);
        return;
      }
      // ❌ Rule: A Subsection cannot be created if another Subsection is already open in this territory.
      if (activeSubsection) {
        showToast("Subsections cannot be nested. Close the current Subsection first.", "error");
        setContextMenu(null);
        return;
      }
      // ❌ Rule: Only one subsection open at a time globally.
      if (hasOpenSubsection) {
        showToast("Close the currently open Subsection before starting a new one.", "error");
        setContextMenu(null);
        return;
      }
    }

    // For subsections, the parent is the currently active section (even if closed)
    const parentSectionId = activeSection ? (activeSection.dbId || activeSection.id) : undefined;

    const newItems = [...displayItems];
    const newItem: DisplayItem = {
      id: `${type}-${Date.now()}`,
      type: type,
      title: "",
      isEditing: true,
      startBlockIndex: transcriptIndex, // Use the real transcript index for data
      endBlockIndex: null, // Open by default
      isClosed: false,
      parentSectionId: parentSectionId,
    };
    newItems.splice(displayIndex, 0, newItem); // Use displayIndex for UI position
    setDisplayItems(newItems);
    setContextMenu(null);
  };

  const updateSectionTitle = (id: string, newTitle: string) => {
    setDisplayItems(prev => prev.map(item =>
      item.id === id ? { ...item, title: newTitle } : item
    ));
  };

  // Save section/subsection to database
  const saveSectionTitle = async (id: string) => {
    const item = displayItems.find(i => i.id === id);
    if (!item || !item.title?.trim()) {
      // If no title, just close editing mode and remove the item
      setDisplayItems(prev => prev.filter(i => i.id !== id));
      showToast("Section name is required", "error");
      return;
    }

    const trimmedTitle = item.title.trim();

    // Frontend validation: Check for duplicate section names within the same transcript
    if (item.type === 'section' && transcriptId) {
      const trimmedName = trimmedTitle.toLowerCase();
      const existingSection = dbSections.find(
        (section: any) => section.name.toLowerCase() === trimmedName
      );

      if (existingSection && existingSection.id !== item.dbId) {
        showToast("Section name must be unique within the same transcript", "error");
        return;
      }
    }

    // Only save to database if we have a transcriptId
    if (transcriptId) {
      try {
        const isSubsection = item.type === 'subsection';
        const endpoint = isSubsection ? '/api/subsections' : '/api/sections';

        // If item has dbId, it's an update (PUT), otherwise it's a create (POST)
        const isUpdate = !!item.dbId;
        const method = isUpdate ? 'PUT' : 'POST';

        const requestBody = isUpdate
          ? {
            id: item.dbId,
            name: trimmedTitle,
            startBlockIndex: item.startBlockIndex,
            endBlockIndex: item.endBlockIndex,
          }
          : {
            transcriptId,
            name: trimmedTitle,
            startBlockIndex: item.startBlockIndex || 0,
            endBlockIndex: item.endBlockIndex,
            // Include parentSectionId for subsections
            ...(isSubsection ? { sectionId: item.parentSectionId } : {})
          };

        const response = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          const data = await response.json();

          if (isUpdate) {
            // Update existing section/subsection in dbSections
            setDbSections(prev => {
              if (!isSubsection) {
                return prev.map(s => s.id === item.dbId
                  ? { ...s, name: data.section.name, startBlockIndex: data.section.startBlockIndex, endBlockIndex: data.section.endBlockIndex }
                  : s
                );
              }
              return prev.map(s => ({
                ...s,
                subsections: s.subsections?.map(sub =>
                  sub.id === item.dbId
                    ? { ...sub, name: data.subsection.name, startBlockIndex: data.subsection.startBlockIndex, endBlockIndex: data.subsection.endBlockIndex }
                    : sub
                ) || []
              }));
            });

            // Update display item
            setDisplayItems(prev => prev.map(i =>
              i.id === id ? { ...i, isEditing: false, title: trimmedTitle } : i
            ));
            showToast(isSubsection ? "Subsection updated" : "Section updated", "success");
          } else {
            // Create new section/subsection
            setDbSections(prev => {
              if (!isSubsection) {
                return [...prev, { ...data.section, subsections: [] }];
              }
              return prev.map(s => s.id === item.parentSectionId
                ? { ...s, subsections: [...(s.subsections || []), data.subsection] }
                : s
              );
            });

            // Update with database ID
            setDisplayItems(prev => prev.map(i =>
              i.id === id ? { ...i, isEditing: false, dbId: isSubsection ? data.subsection?.id : data.section?.id } : i
            ));
            showToast(isSubsection ? "Subsection created" : "Section created", "success");
          }
          return;
        } else {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to save");
        }
      } catch (error: any) {
        console.error("Failed to save section/subsection:", error);
        showToast(error.message || "Failed to save. Please try again.", "error");
        setDisplayItems(prev => prev.filter(i => i.id !== id));
      }
    }

    // Fallback: just close editing mode (for demo/non-db mode)
    setDisplayItems(prev => prev.map(i =>
      i.id === id ? { ...i, isEditing: false } : i
    ));
  };

  // Close a section/subsection (set the endBlockIndex)
  const closeSectionOrSubsection = async (id: string, targetDisplayIndex: number) => {
    const itemIndex = displayItems.findIndex(i => i.id === id);
    const item = displayItems[itemIndex];
    if (!item) return;

    // ❌ Rule: The closing must occur after its creation point in the document flow.
    if (targetDisplayIndex <= itemIndex) {
      showToast(`Cannot close a ${item.type} before its start point.`, "error");
      return;
    }

    // Find the original block index for this position
    // The section ends at the block immediately preceding the insertion point
    let blockIndex = 0;
    for (let i = targetDisplayIndex - 1; i >= 0; i--) {
      if (displayItems[i]?.type === 'data') {
        blockIndex = displayItems[i].originalIndex ?? 0;
        break;
      }
    }

    // ❌ Rule: Subsection cannot extend beyond its parent Section.
    // ❌ Rule: Subsection cannot extend beyond its parent Section.
    if (item.type === 'subsection') {
      const parentSection = displayItems.find(i => i.type === 'section' && (i.id === item.parentSectionId || (i.dbId && i.dbId === item.parentSectionId)));
      if (parentSection && parentSection.isClosed && parentSection.endBlockIndex !== null && parentSection.endBlockIndex !== undefined) {
        if (blockIndex > parentSection.endBlockIndex) {
          showToast("Subsection cannot be closed outside of its parent Section range.", "error");
          return;
        }
      }
    }

    // ❌ Rule: Section cannot be closed before its Subsections end.
    if (item.type === 'section') {
      const subsections = displayItems.filter(i => i.type === 'subsection' && (i.parentSectionId === item.id || (item.dbId && i.parentSectionId === item.dbId)));
      for (const sub of subsections) {
        if (sub.isClosed && sub.endBlockIndex !== null && sub.endBlockIndex !== undefined) {
          if (sub.endBlockIndex > blockIndex) {
            showToast(`Cannot close Section before its Subsection "${sub.title}" ends.`, "error");
            return;
          }
        } else if (!sub.isClosed) {
          showToast(`Please close the open Subsection "${sub.title}" first.`, "error");
          return;
        }
      }
    }

    // Update in database if we have dbId
    if (item.dbId && transcriptId) {
      try {
        const endpoint = item.type === 'section' ? '/api/sections' : '/api/subsections';
        await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: item.dbId,
            endBlockIndex: blockIndex,
          }),
        });
      } catch (error) {
        console.error("Failed to close section/subsection:", error);
      }
    }

    // Update dbSections so it persists through displayItems refresh
    setDbSections(prev => prev.map(s => {
      if (item.type === 'section' && s.id === item.dbId) {
        return { ...s, endBlockIndex: blockIndex };
      }
      if (item.type === 'subsection' && s.subsections) {
        return {
          ...s,
          subsections: s.subsections.map(sub =>
            sub.id === item.dbId ? { ...sub, endBlockIndex: blockIndex } : sub
          )
        };
      }
      return s;
    }));

    // Update local state: 
    // 1. Update the original header item
    // 2. Insert a closing marker at targetDisplayIndex
    setDisplayItems(prev => {
      const updated = prev.map(i =>
        i.id === id ? { ...i, endBlockIndex: blockIndex, isClosed: true } : i
      );

      const closeMarker: DisplayItem = {
        id: `${id}-close`,
        dbId: item.dbId,
        type: item.type === 'section' ? 'section_close' : 'subsection_close',
        title: item.title,
        startBlockIndex: item.startBlockIndex,
        endBlockIndex: blockIndex,
        isClosed: true,
        isEditing: false
      };

      // Insert EXACTLY where the user clicked (this shifts the item at this index down)
      updated.splice(targetDisplayIndex, 0, closeMarker);
      return updated;
    });
  };

  // Handler for closing at a specific position
  const handleCloseSection = (displayIndex: number) => {
    const openItem = findLastOpenSection();
    if (!openItem) return;

    // Rule: LIFO Order - Close Subsection → then close Section
    // If we are trying to close a section but a subsection is open, we must block it.
    // findLastOpenSection already finds the innermost open item (LIFO).

    // Check if there's an open subsection BEFORE this section closure point
    // This is handled by findLastOpenSection returning the SUBSECTION if one is open.

    closeSectionOrSubsection(openItem.item.id, displayIndex);
  };

  const toggleSectionEdit = (id: string) => {
    setDisplayItems(prev => prev.map(item =>
      item.id === id ? { ...item, isEditing: true } : item
    ));
  };

  const deleteDisplayItem = async (id: string) => {
    const item = displayItems.find(i => i.id === id);
    if (!item) return;

    const isCloseMarker = item.type === 'section_close' || item.type === 'subsection_close';
    const baseId = isCloseMarker ? id.replace('-close', '') : id;

    // If it's a close marker, we just need to update the opening marker to be unclosed in the database and local state
    if (isCloseMarker) {
      const openItem = displayItems.find(i => i.id === baseId);
      if (openItem && openItem.dbId && transcriptId) {
        try {
          const endpoint = openItem.type === 'section' ? '/api/sections' : '/api/subsections';
          await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: openItem.dbId,
              endBlockIndex: null, // Re-open
            }),
          });
        } catch (error) {
          console.error("Failed to re-open section/subsection:", error);
        }
      }

      // Update dbSections to set endBlockIndex to null
      setDbSections(prev => prev.map(s => {
        if (openItem?.type === 'section' && s.id === openItem.dbId) {
          return { ...s, endBlockIndex: null };
        }
        if (openItem?.type === 'subsection' && s.subsections) {
          return {
            ...s,
            subsections: s.subsections.map(sub =>
              sub.id === openItem.dbId ? { ...sub, endBlockIndex: null } : sub
            )
          };
        }
        return s;
      }));

      // Remove only the close marker and mark opening as unclosed
      setDisplayItems(prev => prev
        .filter(i => i.id !== id)
        .map(i => i.id === baseId ? { ...i, isClosed: false, endBlockIndex: null } : i)
      );
      return;
    }

    // If it's an opening marker, delete the whole thing (including close marker)
    // ❌ Rule: Hierarchy is a contract. If a Section is deleted, its Subsections must be handled.
    // To maintain "A Subsection can only exist inside a Section", we delete nested items.

    if (item.dbId && transcriptId) {
      try {
        const endpoint = item.type === 'section' ? '/api/sections' : '/api/subsections';
        await fetch(`${endpoint}?id=${item.dbId}`, { method: 'DELETE' });

        // If deleting a section, also delete all its subsections in the DB
        if (item.type === 'section') {
          const section = dbSections.find(s => s.id === item.dbId);
          if (section?.subsections) {
            for (const sub of section.subsections) {
              await fetch(`/api/subsections?id=${sub.id}`, { method: 'DELETE' });
            }
          }
        }
      } catch (error) {
        console.error("Failed to delete section/subsection:", error);
      }
    }

    // Update dbSections
    setDbSections(prev => {
      if (item?.type === 'section') {
        return prev.filter(s => s.id !== item.dbId);
      }
      return prev.map(s => ({
        ...s,
        subsections: s.subsections?.filter(sub => sub.id !== item?.dbId)
      }));
    });

    setDisplayItems(prev => {
      if (item.type === 'section') {
        // If deleting a section, find all items belonging to it (subsections, closes)
        const itemsToRemove = new Set<string>();
        itemsToRemove.add(id);
        itemsToRemove.add(`${id}-close`);

        // Find all subsections that had this section as parent
        prev.forEach(i => {
          if (i.parentSectionId === (item.dbId || item.id)) {
            itemsToRemove.add(i.id);
            itemsToRemove.add(`${i.id}-close`);
          }
        });

        return prev.filter(i => !itemsToRemove.has(i.id));
      }
      return prev.filter(i => i.id !== id && i.id !== `${id}-close`);
    });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);


  const getOffsetInBlock = useCallback((blockElement: Element, targetNode: Node, targetOffset: number): number => {
    const treeWalker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT, null);
    let charCount = 0;
    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      if (node === targetNode) {
        return charCount + targetOffset;
      }
      charCount += node.textContent?.length || 0;
    }
    // If targetNode is not a text node (e.g. an element node)
    if (blockElement.contains(targetNode) && targetNode.nodeType !== Node.TEXT_NODE) {
      // Find the text node at the offset or just return charCount
      return targetOffset === 0 ? 0 : charCount;
    }
    return charCount;
  }, []);

  const handleTextSelection = useCallback((messageIndex: number, blockId?: string) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    if (!text || !selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);

    // Reset cancelled state if a new selection is made
    if (masterCancelled) {
      setMasterCancelled(false);
      setMasterConfirmed(false);
    }

    // Find all blocks spanned by the selection
    const blockElements = Array.from(document.querySelectorAll('[data-block-id]'));
    const initialSelectionRanges: SelectionRange[] = [];
    let firstMessageIndex: number | undefined;

    blockElements.forEach((el) => {
      const bId = el.getAttribute('data-block-id')!;

      // Check if this block is part of the selection
      if (range.intersectsNode(el) || el.contains(range.startContainer) || el.contains(range.endContainer)) {
        let startOffset = 0;
        let endOffset = el.textContent?.length || 0;

        if (el.contains(range.startContainer)) {
          startOffset = getOffsetInBlock(el, range.startContainer, range.startOffset);
        }

        if (el.contains(range.endContainer)) {
          endOffset = getOffsetInBlock(el, range.endContainer, range.endOffset);
        }

        if (endOffset > startOffset) {
          initialSelectionRanges.push({
            blockId: bId,
            startOffset,
            endOffset
          });

          // Find message index for this block
          const item = displayItems.find(i => i.originalData?.blockId === bId);
          if (item && firstMessageIndex === undefined) {
            firstMessageIndex = item.originalIndex;
          }
        }
      }
    });

    // Fallback if discovery failed but we have a direct blockId from the event
    if (initialSelectionRanges.length === 0 && blockId) {
      initialSelectionRanges.push({
        blockId,
        startOffset: 0,
        endOffset: text.length
      });
      firstMessageIndex = messageIndex;
    }

    if (initialSelectionRanges.length === 0) return;

    // --- Boundary Enforcement Law ---
    // A selection MUST NOT cross Section or Subsection boundaries.

    const firstBlockId = initialSelectionRanges[0].blockId;
    const firstBlockItem = displayItems.find(i => i.originalData?.blockId === firstBlockId);
    const startIdx = firstBlockItem?.originalIndex ?? -1;

    // Find containing section/subsection for the start point
    const activeSection = dbSections.find(s =>
      startIdx >= s.startBlockIndex &&
      (s.endBlockIndex === null || startIdx <= s.endBlockIndex)
    );

    const activeSubsection = activeSection?.subsections?.find(sub =>
      startIdx >= sub.startBlockIndex &&
      (sub.endBlockIndex === null || startIdx <= sub.endBlockIndex)
    );

    // Filter ranges to stay within these boundaries
    const filteredSelectionRanges: SelectionRange[] = [];
    const finalBlockIds: string[] = [];
    let textAfterFiltering = "";
    let boundaryReached = false;

    for (const sRange of initialSelectionRanges) {
      if (boundaryReached) break;

      const item = displayItems.find(i => i.originalData?.blockId === sRange.blockId);
      const idx = item?.originalIndex ?? -1;

      // Check if block is still within the SAME section
      const isInSection = activeSection
        ? (idx >= activeSection.startBlockIndex && (activeSection.endBlockIndex === null || idx <= activeSection.endBlockIndex))
        : !dbSections.some(s => idx >= s.startBlockIndex && (s.endBlockIndex === null || idx <= s.endBlockIndex));

      // Check if block is still within the SAME subsection
      const isInSubsection = activeSubsection
        ? (idx >= activeSubsection.startBlockIndex && (activeSubsection.endBlockIndex === null || idx <= activeSubsection.endBlockIndex))
        : !activeSection?.subsections?.some(sub => idx >= sub.startBlockIndex && (sub.endBlockIndex === null || idx <= sub.endBlockIndex));

      if (isInSection && isInSubsection) {
        filteredSelectionRanges.push(sRange);
        finalBlockIds.push(sRange.blockId);

        const blockEl = blockElements.find(el => el.getAttribute('data-block-id') === sRange.blockId);
        if (blockEl) {
          const blockText = blockEl.textContent || "";
          textAfterFiltering += blockText.substring(sRange.startOffset, sRange.endOffset) + " ";
        }
      } else {
        boundaryReached = true;
      }
    }

    const finalText = textAfterFiltering.trim();
    if (filteredSelectionRanges.length === 0 || !finalText) return;

    // Check if this selection already exists in pending
    const selectionKey = JSON.stringify(filteredSelectionRanges);
    const exists = pending.some(p => JSON.stringify(p.selectionRanges) === selectionKey);
    if (exists) {
      window.getSelection()?.removeAllRanges();
      return;
    }

    // Calculate vertical offset relative to the first block element
    let verticalOffset = 0;
    const rect = range.getBoundingClientRect();
    const firstBlockEl = document.querySelector(`[data-block-id="${filteredSelectionRanges[0].blockId}"]`);
    if (firstBlockEl) {
      const blockRect = firstBlockEl.getBoundingClientRect();
      verticalOffset = rect.top - blockRect.top;
    }

    const newEntry: PendingEntry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      messageIndex: firstMessageIndex ?? messageIndex,
      blockIds: finalBlockIds,
      text: finalText,
      selectedText: finalText,
      selectionRanges: filteredSelectionRanges,
      primaryInput: "",
      primaryList: [],
      verticalOffset,
    };

    // If we are currently editing a specific Master Tag, pre-fill it and confirm it
    if (activeMasterTagId) {
      const activeMaster = tags.find(t => (t.masterTagId || t.id) === activeMasterTagId);
      if (activeMaster) {
        setMasterInput(activeMaster.master || "");
        setMasterConfirmed(true);
        setMasterComment(activeMaster.masterComment || "");
      }
    }

    setPending((prev) => [...prev, newEntry]);


    // Track all highlighted block IDs
    setHighlightedBlockIds((prev: Set<string>) => {
      const next = new Set(prev);
      finalBlockIds.forEach((id: string) => next.add(id));
      return next;
    });

    window.getSelection()?.removeAllRanges();
  }, [pending, masterCancelled, activeMasterTagId, tags, displayItems, getOffsetInBlock]);

  const handlePrimaryChange = (id: string, value: string) => {
    setPending((prev) =>
      prev.map((p) => (p.id === id ? { ...p, primaryInput: value } : p))
    );

    // Fetch primary tags from DB based on master tag and current input
    // Fetch even if value is empty to get the "top" tags
    if (masterInput.trim()) {
      fetchPrimaryTags(masterInput.trim(), value);
    }
  };

  // ------------------------------------------------------------------
  // --- PRIMARY TAG: POPUP & ADD LOGIC ---
  // ------------------------------------------------------------------

  const handleSelectPrimaryInstance = (entryId: string, instance: { id: string; name: string; displayName: string; secondaryTags?: any[] }) => {
    // Add directly without popup
    setPending((prev) =>
      prev.map((p) => {
        if (p.id !== entryId) return p;

        return {
          ...p,
          primaryList: [...p.primaryList, {
            id: instance.id,
            value: instance.name,
            displayName: instance.displayName,
            secondaryTags: (instance.secondaryTags || []).map(s => ({ id: s.id, value: s.name }))
          }],
          primaryInput: "",
          primaryInputClosed: true,
        };
      })
    );
    setShowPrimarySuggestions(null);
  };

  const handleInitiateAddPrimary = (id: string) => {
    const entry = pending.find(p => p.id === id);
    if (!entry) return;
    const trimmed = entry.primaryInput.trim();
    if (!trimmed) return;

    // Add directly without popup
    setPending((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;

        return {
          ...p,
          primaryList: [...p.primaryList, {
            value: trimmed,
          }],
          primaryInput: "",
          primaryInputClosed: true,
        };
      })
    );
    setShowPrimarySuggestions(null);
  };

  // ------------------------------------------------------------------
  // --- SECONDARY TAG HANDLERS ---
  // ------------------------------------------------------------------

  const toggleSecondaryInput = (entryId: string, primaryIndex: number) => {
    if (secondaryInput?.entryId === entryId && secondaryInput?.primaryIndex === primaryIndex) {
      setSecondaryInput(null);
    } else {
      setSecondaryInput({ entryId, primaryIndex, value: '' });
    }
  };

  const addSecondaryTag = async (entryId: string, primaryIndex: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // 1. Handle saved tag (database update)
    const tag = tags.find(t => t.id === entryId);
    if (tag) {
      const primary = tag.primaryList[primaryIndex];

      const primaryTagId = primary?.id;
      if (primaryTagId) {
        try {
          const res = await fetch('/api/tags/secondary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ primaryTagId, name: trimmed })
          });
          if (res.ok) {
            const data = await res.json();
            setTags(prev => prev.map(t => {
              if (t.id !== entryId) return t;
              const newList = [...t.primaryList];
              newList[primaryIndex] = {
                ...newList[primaryIndex],
                secondaryTags: [...(newList[primaryIndex].secondaryTags || []), { id: data.secondaryTag.id, value: trimmed }] // Append new secondary tag
              };
              return { ...t, primaryList: newList };
            }));
            // Clear input value but keep it open
            setSecondaryInput({ entryId, primaryIndex, value: '' });
          }
        } catch (error) {
          console.error("Error adding secondary tag:", error);
        }
      }
    }

    // 2. Handle pending tag (state update only)
    setPending(prev => prev.map(p => {
      if (p.id !== entryId) return p;

      const newPrimaryList = [...p.primaryList];
      const primary = newPrimaryList[primaryIndex];
      if (primary) {
        newPrimaryList[primaryIndex] = {
          ...primary,
          secondaryTags: [...(primary.secondaryTags || []), { value: trimmed }] // Append new secondary tag
        };
      }
      return { ...p, primaryList: newPrimaryList };
    }));

    // Clear input value but keep it open for adding more tags
    setSecondaryInput({ entryId, primaryIndex, value: '' });
  };

  const removePrimaryTag = async (entryId: string, primaryIndex: number) => {
    // 1. Handle saved tag (database update logic via modal)
    const tag = tags.find(t => t.id === entryId);
    if (tag) {
      const primary = tag.primaryList[primaryIndex];
      if (primary) {
        setDeleteState({
          isOpen: true,
          type: 'primary',
          tagId: entryId,
          primaryIndex: primaryIndex,
          impressionId: primary.impressionId || ''
        });
        return;
      }
    }

    // 2. Handle pending tag (state update directly)
    setPending(prev => prev.map(p => {
      if (p.id !== entryId) return p;

      const newPrimaryList = p.primaryList.filter((_, idx) => idx !== primaryIndex);
      return { ...p, primaryList: newPrimaryList };
    }));
  };

  const removeSecondaryTag = async (entryId: string, primaryIndex: number, secondaryIndex: number) => {
    // 1. Handle saved tag (database update)
    const tag = tags.find(t => t.id === entryId);
    if (tag) {
      const secTagId = tag.primaryList[primaryIndex]?.secondaryTags?.[secondaryIndex]?.id;
      if (secTagId) {
        try {
          await fetch(`/api/tags/secondary?id=${secTagId}`, { method: 'DELETE' });
        } catch (error) {
          console.error("Error deleting secondary tag:", error);
        }
      }

      setTags(prev => prev.map(t => {
        if (t.id !== entryId) return t;
        const newList = [...t.primaryList];
        if (newList[primaryIndex]?.secondaryTags) {
          newList[primaryIndex] = {
            ...newList[primaryIndex],
            secondaryTags: newList[primaryIndex].secondaryTags!.filter((_, idx) => idx !== secondaryIndex)
          };
        }
        return { ...t, primaryList: newList };
      }));
    }

    // 2. Handle pending tag
    setPending(prev => prev.map(p => {
      if (p.id !== entryId) return p;

      const newPrimaryList = [...p.primaryList];
      const primary = newPrimaryList[primaryIndex];
      if (primary?.secondaryTags) {
        newPrimaryList[primaryIndex] = {
          ...primary,
          secondaryTags: primary.secondaryTags.filter((_, idx) => idx !== secondaryIndex)
        };
      }
      return { ...p, primaryList: newPrimaryList };
    }));
  };

  const toggleBranchInput = (tagId: string) => {
    if (branchInput?.tagId === tagId) {
      setBranchInput(null);
    } else {
      setBranchInput({ tagId, value: '' });
    }
  };

  const addBranchTag = async (tagId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // 1. Handle saved tag (database update)
    const tag = tags.find(t => t.id === tagId);
    if (tag) {
      const masterTagId = tag?.masterTagId;

      if (masterTagId) {
        try {
          const res = await fetch('/api/tags/branch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ masterTagId, name: trimmed })
          });
          if (res.ok) {
            const data = await res.json();
            setTags(prev => prev.map(t => {
              if (t.id !== tagId) return t;
              return {
                ...t,
                branchTags: [...(t.branchTags || []), { id: data.branchTag.id, name: trimmed }] // Append new branch tag
              };
            }));
            // Clear input value but keep it open
            setBranchInput({ tagId, value: '' });
          } else {
            const err = await res.json();
            showToast(err.error || "Failed to add branch tag", "error");
          }
        } catch (error) {
          console.error("Error adding branch tag:", error);
        }
      }
    }

    // 2. Handle pending tag (state update only)
    setPending(prev => prev.map(p => {
      if (p.id !== tagId) return p;
      return {
        ...p,
        branchTags: [...(p.branchTags || []), { value: trimmed }] // Append new branch tag
      };
    }));

    // Clear input value but keep it open for adding more tags
    setBranchInput({ tagId, value: '' });
  };

  const removeBranchTag = async (tagId: string, branchId?: string, branchIdx?: number) => {
    // 1. Handle saved tag
    const tag = tags.find(t => t.id === tagId);
    if (tag && branchId) {
      try {
        await fetch(`/api/tags/branch?id=${branchId}`, { method: 'DELETE' });
        setTags(prev => prev.map(t => {
          if (t.id !== tagId) return t;
          return {
            ...t,
            branchTags: (t.branchTags || []).filter(b => b.id !== branchId)
          };
        }));
      } catch (error) {
        console.error("Error deleting branch tag:", error);
      }
    }

    // 2. Handle pending tag
    setPending(prev => prev.map(p => {
      if (p.id !== tagId) return p;
      const newBranchTags = (p.branchTags || []).filter((_, idx) => idx !== branchIdx);
      return { ...p, branchTags: newBranchTags };
    }));
  };

  const addPrimaryToSavedTag = async (tagId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const tag = tags.find(t => t.id === tagId);
    if (!tag || !tag.masterTagId || tag.blockIds.length === 0) return;

    try {
      const res = await fetch('/api/tags/impressions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptId,
          blockIds: tag.blockIds,
          masterTagName: tag.master,
          primaryTags: [{
            name: trimmed,
            blockIds: tag.blockIds,
            selectionRanges: tag.selectionRanges,
            selectedText: tag.allText?.join(' ')
          }],
          selectionRanges: tag.selectionRanges,
          selectedText: tag.allText?.join(' ')
        })
      });

      if (res.ok) {
        const data = await res.json();
        const imp = data.impressions?.[0];
        if (imp) {
          setTags(prev => prev.map(t => {
            if (t.id !== tagId) return t;
            return {
              ...t,
              primaryList: [...t.primaryList, {
                id: imp.primaryTagId,
                value: imp.primaryTagName,
                displayName: imp.displayName,
                instanceIndex: imp.instanceIndex,
                impressionId: imp.id,
                messageIndex: displayItems.find(d => d.id === imp.blockIds[0])?.originalIndex ?? 0,
                blockId: imp.blockIds[0],
                selectedText: imp.selectedText,
                selectionRange: imp.selectionRanges?.[0]
              }]
            };
          }));
          setSavedPrimaryInput(null);
          showToast("Primary tag added!", "success");
        }
      }
    } catch (error) {
      console.error("Error adding primary to saved tag:", error);
      showToast("Failed to add primary tag", "error");
    }
  };

  const togglePrimaryInput = (tagId: string) => {
    if (savedPrimaryInput?.tagId === tagId) {
      setSavedPrimaryInput(null);
    } else {
      setSavedPrimaryInput({ tagId, value: '' });
    }
  };

  // ------------------------------------------------------------------
  // --- MASTER TAG: POPUP & ADD LOGIC ---
  // ------------------------------------------------------------------

  const handleMasterAddClick = () => {
    const trimmed = masterInput.trim();

    // If empty, just confirm as empty
    if (!trimmed) {
      setMasterConfirmed(true);
      setMasterCancelled(false);
      return;
    }

    // Rule 1.1 & 1.2: Same name does NOT mean same instance.
    // We allow multiple Master Tags with the same name. They will be treated as separate entities.
    // Unique ID (derived from the impression/database) will distinguish them.

    // Check if this Master Tag is closed - but only if we are specifically editing it.
    // If just typing a name, assume we might be creating a new one with same name if it's already used.
    /*
    const existingMasterTag = tags.find(t => t.master?.toLowerCase() === trimmed.toLowerCase());
    if (existingMasterTag?.isClosed && editingMasterName !== existingMasterTag.master) {
      showToast(`Master Tag "${trimmed}" is closed. Enter "Edit Master" mode on the existing tag to add more primary tags.`, "error");
      return;
    }
    */


    // Confirm directly without popup
    confirmMasterAdd("");
  };

  const confirmMasterAdd = (finalComment: string | null) => {
    setMasterComment(finalComment || "");
    setMasterConfirmed(true);
    setMasterCancelled(false);

    // Pre-fetch top primary tags for this master to show in suggestions
    if (masterInput.trim()) {
      fetchPrimaryTags(masterInput.trim(), "");
    }
  };



  const handleMasterCancelAction = () => {
    // This is the "Cancel" button next to "Add" (not the popup cancel)
    // Get all pending block IDs before clearing
    const pendingBlockIds = pending.flatMap(p => {
      const ids: string[] = [];
      if (p.blockId) ids.push(p.blockId);
      if (p.blockIds) ids.push(...p.blockIds);
      return ids;
    });
    const pendingTexts = pending.map(p => p.text);

    // Get block IDs and texts that are still in saved tags
    const taggedBlockIds = new Set(tags.flatMap(t => t.blockIds || []));
    const taggedTexts = new Set(tags.flatMap(t => t.allText || []));

    // Remove only the highlights that aren't in saved tags

    setHighlightedBlockIds(prev => {
      const newSet = new Set(prev);
      pendingBlockIds.forEach(id => {
        if (!taggedBlockIds.has(id)) {
          newSet.delete(id);
        }
      });
      return newSet;
    });

    setMasterInput("");
    setMasterComment("");
    setMasterConfirmed(false);
    setMasterCancelled(true);
    setDbPrimaryTags([]); // Clear suggestions
    setActiveMasterTagId(null); // Clear active master (isolation fix)
    setEditingMasterName(null); // Clear editing context
  };

  const handleEditMaster = () => {
    setMasterConfirmed(false);
    setDbPrimaryTags([]); // Clear suggestions when editing master
    // We do NOT assume we are renaming the tag name here. 
    // This function sets up the "Workspace" for adding primaries/branches to this master tag.
  };

  // ------------------------------------------------------------------
  // --- OVERALL SUBMIT ---
  // ------------------------------------------------------------------

  const handleOverallAdd = async () => {
    // Rule 3.1 & 4.1: Only clear active master, don't affect visible masters
    const currentActiveMasterId = activeMasterTagId;
    setActiveMasterTagId(null);

    setEditingMasterName(null);
    cancelEditing();


    const masterToApply = masterCancelled
      ? null
      : (masterConfirmed || masterInput.trim())
        ? masterInput.trim() || null
        : null;

    // Allow saving if we have a master tag confirmed, OR if we have primary tags
    const hasPrimaryTags = pending.some(p => p.primaryList.length > 0);
    const hasMasterTag = masterToApply !== null;

    if (!hasPrimaryTags && !hasMasterTag) return;

    // Use all pending entries if we are saving a master tag independently
    const activeEntries = hasPrimaryTags ? pending.filter(p => p.primaryList.length > 0) : pending;

    // Collect all block IDs from active entries
    const blockIds = activeEntries.flatMap((p) => {
      const ids: string[] = [];
      if (p.blockId) ids.push(p.blockId);
      if (p.blockIds) ids.push(...p.blockIds);
      return Array.from(new Set(ids)); // Deduplicate
    });

    // Collect all selection ranges for precise highlight persistence
    const selectionRanges: SelectionRange[] = activeEntries.flatMap((p) => {
      const ranges: SelectionRange[] = [];
      if (p.selectionRange) ranges.push(p.selectionRange);
      if (p.selectionRanges) ranges.push(...p.selectionRanges);
      return ranges;
    });

    // Combine all selected texts for the API
    const combinedSelectedText = activeEntries.map((p) => p.selectedText).join(' ');

    const allPrimaries: PrimaryTagDetail[] = activeEntries.flatMap((p) =>
      p.primaryList.map(val => ({
        id: val.id, // Database primary tag ID if reusing
        value: val.value,
        comment: val.comment,
        messageIndex: p.messageIndex,
        blockId: p.blockId || (p.blockIds && p.blockIds[0]),
        blockIds: p.blockIds, // Pass multiple block IDs
        secondaryTags: val.secondaryTags, // Include secondary tags
        selectedText: p.selectedText, // Store selected text per primary
        selectionRange: p.selectionRange, // Store selection range per primary
        selectionRanges: p.selectionRanges, // Pass multiple ranges
      }))
    );

    // Collect branch tags from the first entry (branch tags belong to the master tag)
    const branchNamesToApply = activeEntries[0]?.branchTags?.map(b => b.value) || [];

    // Find section context for the first block (tags span the same context)
    const firstEntry = activeEntries[0];
    const sectionContext = firstEntry ? findSectionContext(firstEntry.messageIndex) : {};

    // Save to database if we have transcriptId and a master tag
    let savedMasterTagId: string | undefined;
    const savedImpressions: Array<{
      impressionId: string;
      primaryTagName: string;
      instanceIndex?: number;
      displayName?: string;
      blockIds: string[];
    }> = [];

    if (transcriptId && masterToApply && blockIds.length > 0) {
      setSavingTags(true);
      try {
        const response = await fetch('/api/tags/impressions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcriptId,
            blockIds,
            masterTagName: masterToApply,
            masterTagId: currentActiveMasterId, // Rule 1.1 & 1.2: Pass explicit ID to prevent auto-merge
            masterTagDescription: masterComment || null,
            branchNames: branchNamesToApply, // Pass branch tag names

            primaryTags: allPrimaries.map(p => ({
              id: p.id, // Send primary tag ID for reuse
              name: p.value,
              comment: p.comment,
              secondaryTags: p.secondaryTags?.map(s => s.value) || [], // Pass secondary tag names
              selectedText: p.selectedText, // The exact selected text
              selectionRange: p.selectionRange, // Character offsets within the block
              selectionRanges: p.selectionRanges, // Multiple ranges
              blockId: p.blockId, // Send specific block ID for this highlight
              blockIds: p.blockIds, // Multiple block IDs
            })),
            // Selection data for precise highlight persistence
            selectedText: combinedSelectedText,
            selectionRanges,
            // Pass section context for analytics
            sectionId: sectionContext.sectionId,
            subsectionId: sectionContext.subsectionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          savedMasterTagId = data.masterTag?.id;

          // Update dbMasterTags for autocomplete
          if (data.masterTag && !dbMasterTags.find(t => t.id === data.masterTag.id)) {
            setDbMasterTags(prev => [...prev, { id: data.masterTag.id, name: data.masterTag.name }]);
          }

          // Track impressions
          if (data.impressions) {
            for (const imp of data.impressions) {
              savedImpressions.push({
                impressionId: imp.id,
                primaryTagName: imp.primaryTagName,
                instanceIndex: imp.instanceIndex,
                displayName: imp.displayName,
                blockIds: imp.blockIds || [],
              });
            }
          }

          showToast("Tags saved successfully!", "success");
          console.log("Tags saved to database:", data);
        } else {
          const errorData = await response.json();
          showToast(errorData.error || "Failed to save tags", "error");
          console.error("Failed to save tags to database");
        }
      } catch (error) {
        showToast("Error saving tags to database", "error");
        console.error("Error saving tags to database:", error);
      } finally {
        setSavingTags(false);
      }
    }

    // Create SEPARATE TagItems for DIFFERENT selections to allow independent positioning
    const newTags: TagItem[] = activeEntries.map((p, pIdx) => {
      const firstBlockId = p.blockId || (p.blockIds && p.blockIds[0]) || "";

      // Find matching saved impression
      const savedImp = savedImpressions.find(imp => {
        const impBlockIds = imp.blockIds || [];

        // Match by block ID overlap
        const hasBlockOverlap = (p.blockId && impBlockIds.includes(p.blockId)) ||
          (p.blockIds && p.blockIds.some(id => impBlockIds.includes(id)));

        if (p.primaryList.length > 0) {
          // If has primaries, match by first primary name
          return imp.primaryTagName === p.primaryList[0]?.value && hasBlockOverlap;
        } else {
          // If master-only, match by any null primary impression with block overlap
          return imp.primaryTagName === null && hasBlockOverlap;
        }
      });

      const tagId = savedImp?.impressionId || Date.now().toString() + Math.random().toString(36).slice(2, 6) + pIdx;

      return {
        id: tagId,
        master: masterToApply,
        masterTagId: savedMasterTagId,
        masterComment: masterComment || undefined,
        masterColor: getMasterTagColor(savedMasterTagId || masterToApply || tagId),
        branchTags: p.branchTags?.map(b => ({ id: Math.random().toString(36).slice(2, 9), name: b.value })), // Local branch tags
        primaryList: p.primaryList.map(val => {
          const imp = savedImpressions.find(si => {
            const siBlockIds = si.blockIds || [];
            return si.primaryTagName === val.value && (
              (p.blockId && siBlockIds.includes(p.blockId)) ||
              (p.blockIds && p.blockIds.some(id => siBlockIds.includes(id)))
            );
          });
          return {
            id: val.id,
            value: val.value,
            comment: val.comment,
            messageIndex: p.messageIndex,
            blockId: p.blockId || firstBlockId,
            secondaryTags: val.secondaryTags,
            selectedText: p.selectedText,
            selectionRange: p.selectionRange,
            impressionId: imp?.impressionId,
            instanceIndex: imp?.instanceIndex,
            displayName: imp?.displayName,
          };
        }),
        allText: [p.selectedText],
        blockIds: p.blockIds || (p.blockId ? [p.blockId] : []),
        selectionRanges: p.selectionRanges || (p.selectionRange ? [p.selectionRange] : []),
        verticalOffset: p.verticalOffset,
      };
    });

    setTags((prev) => [...prev, ...newTags]);

    // Add new master IDs to visible list (Rule 4.1)
    const newMasterIds = newTags.map(t => t.masterTagId || t.id);
    setVisibleMasterIds(prev => Array.from(new Set([...prev, ...newMasterIds])));


    // Track highlighted block IDs
    setHighlightedBlockIds(prev => {
      const newSet = new Set(prev);
      blockIds.forEach(id => newSet.add(id));
      return newSet;
    });

    setPending([]);
    setMasterInput("");
    setMasterComment("");
    setMasterConfirmed(false);
    setMasterCancelled(false);
    setActiveMasterTagId(null); // Clear active master (isolation fix)
    setEditingMasterName(null);
  };

  // Get selection ranges for a specific block from all tags
  const getSelectionRangesForBlock = useCallback((blockId: string): Array<{ start: number; end: number }> => {
    const ranges: Array<{ start: number; end: number }> = [];

    // Check pending entries
    pending.forEach(entry => {
      if (entry.selectionRange?.blockId === blockId) {
        ranges.push({
          start: entry.selectionRange.startOffset,
          end: entry.selectionRange.endOffset
        });
      }
      // Check multi-block ranges
      entry.selectionRanges?.forEach(sr => {
        if (sr.blockId === blockId) {
          ranges.push({
            start: sr.startOffset,
            end: sr.endOffset
          });
        }
      });
    });

    // Check saved tags
    tags.forEach(tag => {
      tag.selectionRanges?.forEach(sr => {
        if (sr.blockId === blockId) {
          ranges.push({
            start: sr.startOffset,
            end: sr.endOffset
          });
        }
      });
      // Also check primary list for individual selection ranges
      tag.primaryList.forEach(primary => {
        if (primary.selectionRange?.blockId === blockId) {
          ranges.push({
            start: primary.selectionRange.startOffset,
            end: primary.selectionRange.endOffset
          });
        }
        // Check multi-block primary ranges
        primary.selectionRanges?.forEach(sr => {
          if (sr.blockId === blockId) {
            ranges.push({
              start: sr.startOffset,
              end: sr.endOffset
            });
          }
        });
      });
    });

    // Sort and merge overlapping ranges
    if (ranges.length === 0) return [];

    ranges.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    let current = ranges[0];

    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i].start <= current.end) {
        current.end = Math.max(current.end, ranges[i].end);
      } else {
        merged.push(current);
        current = ranges[i];
      }
    }
    merged.push(current);

    return merged;
  }, [pending, tags]);

  // Highlight text using selection ranges (offset-based) when available
  const highlightTextWithRanges = useCallback((text: string, blockId?: string) => {
    // First try offset-based highlighting if we have a blockId
    if (blockId) {
      const ranges = getSelectionRangesForBlock(blockId);
      if (ranges.length > 0) {
        const parts: Array<{ text: string; highlighted: boolean; isHovered?: boolean; hoverColor?: string }> = [];
        let lastEnd = 0;

        ranges.forEach(range => {
          // Add non-highlighted text before this range
          if (range.start > lastEnd) {
            parts.push({ text: text.slice(lastEnd, range.start), highlighted: false });
          }

          // Check if this specific range belongs to the currently hovered tag
          const hoveredTag = tags.find(t =>
            t.id === hoveredTagId &&
            (t.selectionRanges?.some(sr => sr.blockId === blockId && sr.startOffset === range.start) ||
              t.primaryList.some(p =>
                (p.selectionRange?.blockId === blockId && p.selectionRange?.startOffset === range.start) ||
                p.selectionRanges?.some(sr => sr.blockId === blockId && sr.startOffset === range.start)
              ))
          );

          // Add highlighted text
          parts.push({
            text: text.slice(range.start, range.end),
            highlighted: true,
            isHovered: !!hoveredTag,
            hoverColor: hoveredTag ? (hoveredTag.masterColor || getMasterTagColor(hoveredTag.masterTagId || hoveredTag.id || hoveredTag.master || '')) : undefined
          });
          lastEnd = range.end;
        });

        // Add remaining non-highlighted text
        if (lastEnd < text.length) {
          parts.push({ text: text.slice(lastEnd), highlighted: false });
        }

        return (
          <>
            {parts.map((part, i) =>
              part.highlighted ? (
                <span
                  key={i}
                  className={`transition-all duration-200 ${part.isHovered
                    ? "shadow-sm ring-1 z-10 relative px-0.5 rounded-sm"
                    : "bg-[#BFE8EB]"
                    }`}
                  style={part.isHovered ? {
                    backgroundColor: part.hoverColor,
                    boxShadow: `0 0 0 1px ${part.hoverColor}66`,
                    color: '#fff',
                    textShadow: '0 1px 1px rgba(0,0,0,0.2)'
                  } : {}}
                >
                  {part.text}
                </span>
              ) : (
                <span key={i}>{part.text}</span>
              )
            )}
          </>
        );
      }
    }

    // Rule: No automatic highlighting of similar texts (User request)
    return <>{text}</>;
  }, [getSelectionRangesForBlock, tags, hoveredTagId]);



  // Legacy function for backward compatibility (text-only highlighting)
  const highlightTextJSX = (text: string) => {
    return highlightTextWithRanges(text, undefined);
  };

  // When user clicks the "Edit" button on a Master Tag row
  // CRITICAL FIX: Use masterTagId for isolation, not name
  const handleMasterEditClick = (tag: TagItem) => {
    // 1. Enter Workspace Mode: Enable text selection for this Master Tag
    const masterTagId = tag.masterTagId || tag.id;
    setActiveMasterTagId(masterTagId); // Use ID for isolation - ensures closing one master doesn't affect others
    setEditingMasterName(tag.master); // Keep for backward compatibility
    setMasterInput(tag.master || "");
    setMasterComment(tag.masterComment || "");
    setMasterConfirmed(true); // Treat as confirmed so we can add primaries
    setMasterCancelled(false);

    // 2. Set UI State to 'editing' to show tool buttons (Add Branch, Add Primary, etc.)
    // Note: MasterTagRow will see this but keep the name READ-ONLY until the explicit rename pencil is clicked.
    startEditing(tag.id, 'master', tag.master || "");

    // Clear any previous selection
    window.getSelection()?.removeAllRanges();
  };

  const startEditing = (id: string, type: 'master' | 'primary' | 'master_branch' | 'secondary' | 'master_comment' | 'primary_comment' | 'pending_master_comment' | 'pending_primary' | 'pending_primary_comment', currentValue: string, index: number | null = null) => {
    // Allow master tag name editing to start immediately
    // Also allow independent editing of primary/secondary tags without master edit mode
    // if (type !== 'master' && (type === 'primary' || type === 'master_comment' || type === 'primary_comment' || type === 'master_branch' || type === 'secondary')) {
    //   const tag = tags.find(t => t.id === id);
    //   if (editingMasterName !== tag?.master) {
    //     showToast("Enter Edit mode on the Master Tag first to make changes.", "info");
    //     return;
    //   }
    // }
    setEditingItem({ id, type, index, tempValue: currentValue });
  };

  const cancelEditing = () => {
    setEditingItem({ id: null, type: null, index: null, tempValue: "" });
  };

  const saveEditing = async () => {
    const { id, type, index, tempValue } = editingItem;
    if (!id || !type) return;

    const trimmedVal = tempValue.trim();

    try {
      if (type === 'master') {
        // 1. Update Master Tag record in DB
        const masterTagId = tags.find(t => t.id === id)?.masterTagId;
        if (masterTagId) {
          await fetch('/api/tags/master', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: masterTagId, name: trimmedVal })
          });
        }
        // 2. Update local state for ALL tags sharing this masterTagId (Rule 2.2)
        const targetMasterId = tags.find(t => t.id === id)?.masterTagId || id;
        setTags(prev => prev.map(t => (t.masterTagId === targetMasterId || t.id === targetMasterId) ? { ...t, master: trimmedVal } : t));

        // 3. Exit Master Workspace Mode (Close Master)

        // CRITICAL: Only clear activeMasterTagId, don't affect other masters
        setActiveMasterTagId(null);
        setEditingMasterName(null);
      }
      else if (type === 'master_comment') {
        const masterTagId = tags.find(t => t.id === id)?.masterTagId;
        if (masterTagId) {
          await fetch('/api/tags/master', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: masterTagId, description: trimmedVal })
          });
        }
        const targetMasterId = tags.find(t => t.id === id)?.masterTagId || id;
        setTags(prev => prev.map(t => (t.masterTagId === targetMasterId || t.id === targetMasterId) ? { ...t, masterComment: trimmedVal } : t));

      }
      else if (type === 'primary' && index !== null) {
        // 1. Update Primary Tag record in DB
        const tag = tags.find(t => t.id === id);
        const primaryTagId = tag?.primaryList[index]?.id;
        if (primaryTagId) {
          await fetch('/api/tags/primary', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: primaryTagId, name: trimmedVal })
          });
        }
        // 2. Update local state
        setTags(prev => prev.map(t => {
          if (t.id !== id) return t;
          if (!trimmedVal) return t;
          const newList = [...t.primaryList];
          newList[index] = { ...newList[index], value: trimmedVal };
          return { ...t, primaryList: newList };
        }));
      }
      else if (type === 'primary_comment' && index !== null) {
        const tag = tags.find(t => t.id === id);
        const impressionId = tag?.primaryList[index]?.impressionId;
        if (impressionId) {
          await fetch('/api/tags/impressions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: impressionId, comment: trimmedVal })
          });
        }
        setTags(prev => prev.map(t => {
          if (t.id !== id) return t;
          const newList = [...t.primaryList];
          newList[index] = { ...newList[index], comment: trimmedVal || undefined };
          return { ...t, primaryList: newList };
        }));
      }
      else if (type === 'pending_master_comment') {
        setMasterComment(trimmedVal);
      }
      else if (type === 'pending_primary' && index !== null) {
        setPending(prev => prev.map(p => {
          if (p.id !== id) return p;
          const newList = [...p.primaryList];
          newList[index] = { ...newList[index], value: trimmedVal };
          return { ...p, primaryList: newList };
        }));
      }
      else if (type === 'pending_primary_comment' && index !== null) {
        setPending(prev => prev.map(p => {
          if (p.id !== id) return p;
          const newList = [...p.primaryList];
          newList[index] = { ...newList[index], comment: trimmedVal || undefined };
          return { ...p, primaryList: newList };
        }));
      }
      else if (type === 'master_branch' && index !== null) {
        const tag = tags.find(t => t.id === id);
        const branchTagId = tag?.branchTags?.[index]?.id;
        if (branchTagId) {
          await fetch('/api/tags/branch', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: branchTagId, name: trimmedVal })
          });
        }
        setTags(prev => prev.map(t => {
          if (t.id !== id || !t.branchTags) return t;
          const newList = [...t.branchTags];
          newList[index] = { ...newList[index], name: trimmedVal };
          return { ...t, branchTags: newList };
        }));
      }
      else if (type === 'secondary' && index !== null) {
        const primaryIdx = Math.floor(index / 100);
        const secIdx = index % 100;
        const tag = tags.find(t => t.id === id);
        const secTagId = tag?.primaryList[primaryIdx]?.secondaryTags?.[secIdx]?.id;
        if (secTagId) {
          await fetch('/api/tags/secondary', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: secTagId, name: trimmedVal })
          });
        }
        setTags(prev => prev.map(t => {
          if (t.id !== id) return t;
          const newPrimaryList = [...t.primaryList];
          const newSecTags = [...(newPrimaryList[primaryIdx].secondaryTags || [])];
          newSecTags[secIdx] = { ...newSecTags[secIdx], value: trimmedVal };
          newPrimaryList[primaryIdx] = { ...newPrimaryList[primaryIdx], secondaryTags: newSecTags };
          return { ...t, primaryList: newPrimaryList };
        }));
      }
    } catch (error) {
      console.error("Save editing error:", error);
      showToast("Failed to save changes", "error");
    }
    cancelEditing();
  };

  const initiateDeleteMaster = (id: string) => {
    const tagToDelete = tags.find(t => t.id === id);
    if (!tagToDelete) return;

    // Find all TagItems that refer to the same Master Tag (by ID or exact name)
    const masterTagId = tagToDelete.masterTagId;
    let relatedTags = [tagToDelete];

    if (masterTagId) {
      relatedTags = tags.filter(t => t.masterTagId === masterTagId);
    } else if (tagToDelete.master) {
      relatedTags = tags.filter(t => t.master === tagToDelete.master);
    }

    // Collect ALL impression IDs from all related distinct UI items
    const impressionIds = relatedTags.flatMap(t => {
      const ids: string[] = [];

      // 1. If it has primary tags, collect those impression IDs
      if (t.primaryList && t.primaryList.length > 0) {
        t.primaryList.forEach(p => {
          if (p.impressionId) ids.push(p.impressionId);
        });
      } else {
        // 2. If it's a master-only tag, the tag.id itself is the impressionId
        // (See loadTagsFromDatabase: id is set to group.id which is the first imp.id)
        if (t.id && !t.id.startsWith('master-')) {
          ids.push(t.id);
        }
      }
      return ids;
    });

    // Deduplicate IDs
    const uniqueImpressionIds = Array.from(new Set(impressionIds));

    setDeleteState({ isOpen: true, type: 'master', tagId: id, impressionId: uniqueImpressionIds.join(',') });
  };

  const initiateDeletePrimary = (tagId: string, index: number, impressionId?: string) => {
    const tag = tags.find(t => t.id === tagId);
    setDeleteState({ isOpen: true, type: 'primary', tagId: tagId, primaryIndex: index, impressionId });
  };

  const handleConfirmDelete = async () => {
    // 1. Delete Impressions from database first
    if (deleteState.impressionId && transcriptId) {
      try {
        const impressionIds = deleteState.impressionId.split(',').filter(Boolean);
        console.log(`Deleting ${impressionIds.length} impressions:`, impressionIds);

        // Execute deletions in parallel
        const results = await Promise.all(impressionIds.map(async impId => {
          try {
            const res = await fetch(`/api/tags/impressions?id=${impId}`, { method: 'DELETE' });
            if (!res.ok) {
              const errData = await res.json();
              console.error(`Failed to delete impression ${impId}:`, errData.error);
              return false;
            }
            return true;
          } catch (e) {
            console.error(`Error fetching delete impression ${impId}:`, e);
            return false;
          }
        }));

        const successCount = results.filter(Boolean).length;
        console.log(`Successfully deleted ${successCount}/${impressionIds.length} impressions`);
      } catch (error) {
        console.error("Failed to delete tag impressions from database:", error);
      }
    }

    if (deleteState.type === 'master') {
      // Get the tag being deleted
      const deletedTag = tags.find(t => t.id === deleteState.tagId);
      const masterTagIdToDelete = deletedTag?.masterTagId;

      // 2. Delete Master Tag from DB (if it exists)
      // This is crucial for permanent deletion
      if (masterTagIdToDelete) {
        try {
          console.log(`Deleting master tag record: ${masterTagIdToDelete}`);
          const res = await fetch(`/api/tags/master?id=${masterTagIdToDelete}`, { method: 'DELETE' });
          if (!res.ok) {
            const errData = await res.json();
            console.error(`Failed to delete master tag record ${masterTagIdToDelete}:`, errData.error);
          } else {
            console.log(`Successfully deleted master tag record ${masterTagIdToDelete}`);
          }
        } catch (err) {
          console.error("Failed to delete master tag record:", err);
        }
      }

      // 3. Remove ONLY TagItems that match this Master Tag ID from local state
      // Rule 1.1: Master Tags are unique by ID, not by name.
      setTags(prev => {
        return prev.filter((t: TagItem) => {
          // If IDs match, exclude it
          if (masterTagIdToDelete && t.masterTagId === masterTagIdToDelete) return false;
          // Fallback: exclude the specific ID clicked
          if (t.id === deleteState.tagId) return false;
          return true;
        });
      });

      // Update visibleMasterIds
      if (masterTagIdToDelete) {
        setVisibleMasterIds(prev => prev.filter(id => id !== masterTagIdToDelete));
      }

      // Recalculate highlighted block IDs immediately using the new state logic
      setHighlightedBlockIds(prev => {
        const remaining = tags.filter((t: TagItem) => {
          if (masterTagIdToDelete && t.masterTagId === masterTagIdToDelete) return false;
          if (t.id === deleteState.tagId) return false;
          return true;
        }).flatMap(t => t.blockIds || []);
        return new Set(remaining);
      });
    }
    else if (deleteState.type === 'primary' && typeof deleteState.primaryIndex === 'number') {
      // Logic for deleting a single primary tag instance
      setTags(prev => {
        const updatedTags = prev.map((t: TagItem) => {
          if (t.id !== deleteState.tagId) return t;

          // Filter out the deleted primary tag
          const newPrimaryList = t.primaryList.filter((_, idx) => idx !== deleteState.primaryIndex);

          // Update blockIds
          const remainingBlockIds = newPrimaryList
            .map(p => p.blockId)
            .filter((id): id is string => !!id);

          return {
            ...t,
            primaryList: newPrimaryList,
            blockIds: [...new Set(remainingBlockIds)],
            allText: t.allText
          };
        });

        // Remove empty master tags
        return updatedTags.filter(t =>
          t.primaryList.length > 0 || (t.selectionRanges && t.selectionRanges.length > 0)
        );
      });

      // Update highlights immediately
      setHighlightedBlockIds(prev => {
        const remaining = tags.flatMap(t => {
          if (t.id !== deleteState.tagId) return t.blockIds;
          return t.primaryList
            .filter((_, idx) => idx !== deleteState.primaryIndex)
            .map(p => p.blockId)
            .filter((id): id is string => !!id);
        });
        return new Set(remaining);
      });
    }

    setDeleteState({ ...deleteState, isOpen: false });
    setActiveMasterTagId(null);
    setEditingMasterName(null);
  };

  const handleDeletePendingPrimary = (entryId: string, primaryIndex: number) => {
    setPending((prev) =>
      prev.map((p) =>
        p.id === entryId
          ? {
            ...p,
            primaryList: p.primaryList.filter((_, i) => i !== primaryIndex),
          }
          : p
      )
    );
  };

  // Remove a pending entry entirely and its highlight
  const handleRemovePendingEntry = (entryId: string) => {
    const entry = pending.find(p => p.id === entryId);
    if (entry) {
      // Remove the text from highlighted texts


      // Collect all block IDs associated with this entry
      const blocksToRemove = new Set<string>();
      if (entry.blockId) blocksToRemove.add(entry.blockId);
      if (entry.blockIds) entry.blockIds.forEach(id => blocksToRemove.add(id));

      if (blocksToRemove.size > 0) {
        setHighlightedBlockIds(prev => {
          const next = new Set(prev);
          blocksToRemove.forEach(blockId => {
            // Only remove if no other pending entries or tags reference this block
            const otherPendingWithBlock = pending.find(p => p.id !== entryId && (p.blockId === blockId || p.blockIds?.includes(blockId)));
            const tagsWithBlock = tags.some(t => t.blockIds.includes(blockId));

            if (!otherPendingWithBlock && !tagsWithBlock) {
              next.delete(blockId);
            }
          });
          return next;
        });
      }
    }
    setPending(prev => prev.filter(p => p.id !== entryId));
  };

  useEffect(() => {
    const container = document.querySelector('main > div');
    const left = leftListRef.current;
    const right = rightListRef.current;
    if (!container || !left || !right) return;
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#F9FAFB]">

      {/* --- TOAST NOTIFICATION --- */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in ${toast.type === 'success' ? 'bg-emerald-500 text-white' :
            toast.type === 'error' ? 'bg-rose-500 text-white' :
              'bg-gray-800 text-white'
            }`}
        >
          {toast.type === 'success' && (
            <CheckIcon className="w-5 h-5" />
          )}
          {toast.type === 'error' && (
            <XMarkIcon className="w-5 h-5" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 hover:opacity-70"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- CUSTOM CONTEXT MENU --- */}
      {contextMenu && (() => {
        const { activeSection, activeSubsection, hasOpenSection, hasOpenSubsection } = getHierarchyStateAt(contextMenu.displayIndex);

        // canAddSection: NOT inside any section AND no unclosed section exists globally
        const canAddSection = !activeSection && !hasOpenSection;

        // canAddSubsection: INSIDE a section AND NOT inside any subsection AND no unclosed subsection exists globally
        const canAddSubsection = activeSection && !activeSubsection && !hasOpenSubsection;

        const lastOpen = findLastOpenSection();
        const canClose = lastOpen && contextMenu.displayIndex > lastOpen.index;

        return (
          <div
            className="fixed bg-white border border-gray-200 shadow-xl rounded-xl py-2 z-50 min-w-[240px] backdrop-blur-sm"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Insert
            </div>

            <button
              disabled={!canAddSection}
              onClick={() => handleAddDivider('section')}
              className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${canAddSection
                ? 'hover:bg-[#00A3AF]/10 text-gray-700'
                : 'opacity-50 cursor-not-allowed bg-gray-50'
                }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${canAddSection ? 'bg-[#00A3AF]' : 'bg-gray-300'}`} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">Section</span>
                {!canAddSection && (
                  <span className="text-[9px] text-rose-500 font-bold uppercase tracking-tighter">
                    {activeSection ? `Forbidden: Inside ${activeSection.title || 'Section'}` : 'Forbidden: Close Open Section First'}
                  </span>
                )}
              </div>
            </button>

            <button
              disabled={!canAddSubsection}
              onClick={() => handleAddDivider('subsection')}
              className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${canAddSubsection
                ? 'hover:bg-amber-50 text-gray-700'
                : 'opacity-50 cursor-not-allowed bg-gray-50'
                }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ml-0.5 ${canAddSubsection ? 'bg-amber-500' : 'bg-gray-300'}`} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">Sub Section</span>
                {!canAddSubsection && (
                  <span className="text-[9px] text-rose-500 font-bold uppercase tracking-tighter">
                    {!activeSection
                      ? 'Requires Section'
                      : activeSubsection
                        ? `Forbidden: Inside ${activeSubsection.title || 'Subsection'}`
                        : 'Close Open Subsection First'}
                  </span>
                )}
              </div>
            </button>

            {lastOpen && (
              <>
                <div className="h-px bg-gray-100 my-1"></div>
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Close
                </div>
                <button
                  disabled={!canClose}
                  onClick={() => {
                    if (canClose) {
                      handleCloseSection(contextMenu.displayIndex);
                      setContextMenu(null);
                    }
                  }}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${canClose
                    ? 'hover:bg-rose-50 text-gray-700'
                    : 'opacity-50 cursor-not-allowed bg-gray-50'
                    }`}
                >
                  <StopIcon className={`w-3.5 h-3.5 shrink-0 ${!canClose ? 'text-gray-300' : lastOpen.item.type === 'subsection' ? 'text-amber-500' : 'text-rose-500'}`} />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium">
                      Close {lastOpen.item.type === 'subsection' ? 'Sub Section' : 'Section'}
                    </span>
                    {!canClose ? (
                      <span className="text-[9px] text-rose-500 font-bold uppercase tracking-tighter">
                        Must close AFTER start point
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 truncate italic">
                        "{lastOpen.item.title || 'Untitled'}"
                      </span>
                    )}
                  </div>
                </button>
              </>
            )}
          </div>
        );
      })()}

      <DeleteModal
        isOpen={deleteState.isOpen}
        title={deleteState.type === 'master' ? "Delete Tag Group" : "Delete Primary Tag"}
        message={deleteState.type === 'master'
          ? "Are you sure you want to delete this Master tag? This will remove all associated primary tags."
          : "Are you sure you want to delete this primary tag?"}
        onClose={() => setDeleteState({ ...deleteState, isOpen: false })}
        onConfirm={handleConfirmDelete}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="sticky top-0 z-50 w-full h-[60px] bg-white border-b border-[#F0F0F0] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="hover:opacity-70 transition flex items-center"
              aria-label="Go back"
            >
              <img src="/icons/arrow-left.png" alt="Back" className="w-[24px] h-[24px] cursor-pointer" />
            </button>
            <div className="flex flex-col justify-center">
              <h1 className="text-[24px] font-medium text-[#111827] leading-tight">Sessions</h1>
              {loadedVideo && (
                isEditingSessionName ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <input
                      autoFocus
                      type="text"
                      value={sessionNameInput}
                      onChange={(e) => setSessionNameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveSessionName();
                        if (e.key === 'Escape') setIsEditingSessionName(false);
                      }}
                      onBlur={saveSessionName}
                      className="text-xs text-gray-700 px-2 py-1 border border-[#00A3AF] rounded focus:outline-none w-[200px] leading-tight"
                      placeholder="Session name..."
                    />
                    <button
                      onClick={saveSessionName}
                      className="p-1 bg-[#E0F7FA] rounded hover:bg-[#B2EBF2] flex items-center justify-center"
                    >
                      <CheckIcon className="w-3 h-3 text-[#00A3AF]" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setSessionNameInput(loadedVideo.fileName || '');
                      setIsEditingSessionName(true);
                    }}
                    className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5 truncate max-w-[300px] hover:text-[#00A3AF] group"
                    title="Click to rename session"
                  >
                    <span className="truncate leading-tight">{loadedVideo.fileName || 'Untitled Session'}</span>
                    <PencilIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Context Panel: Persistent Context Header */}
            {/* Single source of truth - computed reactively via useMemo */}
            <ActiveContextBar
              sectionName={activeContext.sectionName}
              subSectionName={activeContext.subSectionName}
              masterTagName={activeContext.masterTagName}
              mode="edit"
              className="mr-2"
            />
            {loadingTranscript && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading transcript...
              </div>
            )}
            {(pending.length > 0 || editingMasterName) && (
              <button
                onClick={pending.length > 0 ? handleOverallAdd : () => { setActiveMasterTagId(null); setEditingMasterName(null); cancelEditing(); }}
                disabled={savingTags}
                className={`px-4 py-2 text-white rounded-lg shadow-sm text-sm transition-all duration-200 flex items-center gap-2 ${savingTags
                  ? 'bg-gray-400 cursor-not-allowed'
                  : editingMasterName && pending.length === 0
                    ? 'bg-gray-800 hover:bg-black'
                    : 'bg-[#00A3AF] hover:bg-[#008C97] hover:shadow-md'
                  }`}
              >
                {savingTags ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  pending.length > 0 ? 'Close Master' : 'Exit Edit Mode'
                )}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto" ref={sharedScrollRootRef} data-transcript-scroll-root>
          {/* Senior Layout Engineer Fix: 
              Wrap both panes in a 'flex min-h-full w-full items-stretch' container.
              By using 'flex' on the scroll root and 'min-h-full' + 'items-stretch' on this wrapper,
              both the Transcript and Right Sidebar are forced to match the height of the tallest 
              content (the Transcript), ensuring the sidebar border and background persist to the bottom. */}
          <div className="flex w-full min-h-full items-stretch">
            {/* Left Side: Transcript */}
            <div className="flex-1 p-6" ref={leftListRef}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[#111827] text-lg font-semibold">
                  {loadedVideo ? "Transcription" : "Auto Transcription"}
                </h2>
                <div className="flex items-center gap-3">
                  {loadedVideo && (
                    <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                      {sessionData.length} blocks
                    </span>
                  )}

                  {/* Filter Controls */}
                  <div className="flex items-center gap-2">
                    {/* Hide Untagged Toggle */}
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hideUntagged}
                        onChange={(e) => setHideUntagged(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-[#00A3AF] focus:ring-[#00A3AF] flex-shrink-0"
                      />
                      <span className="leading-tight">Hide Untagged</span>
                    </label>

                    {/* Section Filter */}
                    {availableSections.length > 0 && (
                      <select
                        value={filterSection || ''}
                        onChange={(e) => setFilterSection(e.target.value || null)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3AF]"
                      >
                        <option value="">All Sections</option>
                        {availableSections.map(section => (
                          <option key={section.id} value={section.id}>{section.name}</option>
                        ))}
                      </select>
                    )}

                    {/* Master Tag Filter */}
                    {tags.length > 0 && (
                      <select
                        value={filterMaster || ''}
                        onChange={(e) => setFilterMaster(e.target.value || null)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#00A3AF]"
                      >
                        <option value="">All Tags</option>
                        {(() => {
                          // Group tags by master name for a cleaner filter list
                          const uniqueMasterTags = new Map<string, string>();
                          tags.forEach(t => {
                            const name = t.master || 'Unnamed';
                            // Store by name, using masterTagId or name as the filter value
                            if (!uniqueMasterTags.has(name)) {
                              uniqueMasterTags.set(name, t.masterTagId || name);
                            }
                          });

                          return Array.from(uniqueMasterTags.entries())
                            .sort((a, b) => a[0].localeCompare(b[0]))
                            .map(([name, val]) => (
                              <option key={val} value={val}>{name}</option>
                            ));
                        })()}
                      </select>
                    )}

                    {/* Clear Filters */}
                    {(hideUntagged || filterSection || filterMaster) && (
                      <button
                        onClick={() => {
                          setHideUntagged(false);
                          setFilterSection(null);
                          setFilterMaster(null);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl shadow-sm">
                {/* Add section/subsection before first item */}
                {filteredDisplayItems.length > 0 && !hideUntagged && !filterSection && !filterMaster && (
                  <div
                    className="relative h-[30px] mb-2 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200 z-30"
                    onClick={(e) => handleContextMenu(e, 0, 0)}
                  >
                    <div className="w-full h-[2px] bg-[#00A3AF] relative flex items-center justify-center">
                      <div className="bg-[#00A3AF] text-white rounded-full p-0.5 shadow-sm transform transition-transform hover:scale-110">
                        <PlusIcon className="w-3 h-3" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Show message when filtering results in empty list */}
                {filteredDisplayItems.length === 0 && displayItems.length > 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p className="text-sm">No items match the current filters.</p>
                    <button
                      onClick={() => {
                        setHideUntagged(false);
                        setFilterSection(null);
                        setFilterMaster(null);
                      }}
                      className="mt-2 text-[#00A3AF] text-sm underline"
                    >
                      Clear filters
                    </button>
                  </div>
                )}

                {filteredDisplayItems.map((item, index) => {
                  // Find the original index for context menu operations
                  const originalIndex = displayItems.findIndex(d => d.id === item.id);
                  const isFiltered = hideUntagged || filterSection || filterMaster;

                  if (item.type === 'section_close') {
                    const dataIndex = item.endBlockIndex ?? 0;
                    return (
                      <div key={item.id} className="relative group/wrapper">
                        <div
                          ref={(el) => { if (el) leftRowRefs.current.set(item.id, el); else leftRowRefs.current.delete(item.id); }}
                          className="my-4 flex items-center gap-2 animate-fade-in group relative"
                        >
                          <div className="w-2 h-2 bg-gray-300 rounded-full flex-shrink-0" />
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight">
                            {item.title || 'Section'}
                          </span>
                          <div className="flex-1 h-px bg-gray-300 border-dashed border-t" />
                          <button
                            onClick={() => deleteDisplayItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded flex items-center justify-center flex-shrink-0"
                            title="Delete Close Line"
                          >
                            <TrashIcon className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                        {/* Show + button after section close - hide when filtering */}
                        {!isFiltered && (
                          <div
                            className="absolute bottom-[-15px] left-0 w-full h-[30px] z-30 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
                            onClick={(e) => handleContextMenu(e, originalIndex + 1, dataIndex + 1)}
                          >
                            <div className="w-full h-[2px] bg-[#00A3AF] relative flex items-center justify-center">
                              <div className="bg-[#00A3AF] text-white rounded-full p-0.5 shadow-sm transform transition-transform hover:scale-110">
                                <PlusIcon className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (item.type === 'subsection_close') {
                    const dataIndex = item.endBlockIndex ?? 0;
                    return (
                      <div key={item.id} className="relative group/wrapper">
                        <div
                          ref={(el) => { if (el) leftRowRefs.current.set(item.id, el); else leftRowRefs.current.delete(item.id); }}
                          className="my-4 flex items-center gap-2 animate-fade-in group relative ml-4"
                        >
                          <div className="w-1.5 h-1.5 bg-amber-300 rounded-full flex-shrink-0" />
                          <span className="text-xs font-medium text-amber-500 uppercase tracking-wider leading-tight">
                            {item.title || 'Subsection'}
                          </span>
                          <div className="flex-1 h-px bg-amber-100 border-dashed border-t" />
                          <button
                            onClick={() => deleteDisplayItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded flex items-center justify-center flex-shrink-0"
                            title="Delete Close Line"
                          >
                            <TrashIcon className="w-3 h-3 text-red-400" />
                          </button>
                        </div>
                        {/* Show + button after subsection close - hide when filtering */}
                        {!isFiltered && (
                          <div
                            className="absolute bottom-[-15px] left-0 w-full h-[30px] z-30 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
                            onClick={(e) => handleContextMenu(e, originalIndex + 1, dataIndex + 1)}
                          >
                            <div className="w-full h-[2px] bg-[#00A3AF] relative flex items-center justify-center">
                              <div className="bg-[#00A3AF] text-white rounded-full p-0.5 shadow-sm transform transition-transform hover:scale-110">
                                <PlusIcon className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (item.type === 'section') {
                    const isOpen = !item.isClosed;
                    return (
                      <div
                        key={item.id}
                        ref={(el) => { if (el) leftRowRefs.current.set(item.id, el); else leftRowRefs.current.delete(item.id); }}
                        className={`my-4 flex items-center gap-2 animate-fade-in group relative ${item.isClosed ? 'opacity-75' : ''}`}
                      >
                        {item.isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <div className="w-2 h-2 rounded-full bg-[#00A3AF] flex-shrink-0" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Enter name"
                              className="border-b border-[#00A3AF] focus:outline-none text-xs font-semibold text-[#00A3AF] uppercase tracking-wider min-w-[150px]"
                              value={item.title || ""}
                              onChange={(e) => updateSectionTitle(item.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSectionTitle(item.id);
                              }}
                              onBlur={() => saveSectionTitle(item.id)}
                            />
                            <div className="flex-1 h-px bg-[#00A3AF]/30" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <div className="w-2 h-2 rounded-full bg-[#00A3AF] flex-shrink-0" />
                            <span className="text-xs font-semibold text-[#00A3AF] uppercase tracking-wider leading-tight">
                              {item.title || 'Section'}
                              {item.isClosed && <span className="text-[10px] text-gray-400 ml-1 font-normal">(closed)</span>}
                            </span>
                            <div className={`flex-1 h-px ${item.isClosed ? 'bg-gray-300' : 'bg-[#00A3AF]/30'}`} />
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={() => toggleSectionEdit(item.id)} className="p-1 hover:bg-gray-100 rounded flex items-center justify-center" title="Edit">
                                <PencilIcon className="w-3 h-3 text-gray-400" />
                              </button>
                              <button onClick={() => deleteDisplayItem(item.id)} className="p-1 hover:bg-red-50 rounded flex items-center justify-center" title="Delete">
                                <TrashIcon className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (item.type === 'subsection') {
                    const isOpen = !item.isClosed;
                    return (
                      <div
                        key={item.id}
                        ref={(el) => { if (el) leftRowRefs.current.set(item.id, el); else leftRowRefs.current.delete(item.id); }}
                        className={`my-4 flex items-center gap-2 animate-fade-in group relative ml-4 ${item.isClosed ? 'opacity-75' : ''}`}
                      >
                        {item.isEditing ? (
                          <div className="flex items-center gap-2 w-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Enter name"
                              className="border-b border-amber-500 focus:outline-none text-xs font-medium text-amber-600 uppercase tracking-wider min-w-[150px]"
                              value={item.title || ""}
                              onChange={(e) => updateSectionTitle(item.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSectionTitle(item.id);
                              }}
                              onBlur={() => saveSectionTitle(item.id)}
                            />
                            <div className="flex-1 h-px bg-amber-300/50" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 w-full">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                            <span className="text-xs font-medium text-amber-600 uppercase tracking-wider leading-tight">
                              {item.title || 'Subsection'}
                              {item.isClosed && <span className="text-[10px] text-gray-400 ml-1 font-normal">(closed)</span>}
                            </span>
                            <div className={`flex-1 h-px ${item.isClosed ? 'bg-amber-100' : 'bg-amber-300/50'}`} />
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={() => toggleSectionEdit(item.id)} className="p-1 hover:bg-gray-100 rounded flex items-center justify-center" title="Edit">
                                <PencilIcon className="w-3 h-3 text-gray-400" />
                              </button>
                              <button onClick={() => deleteDisplayItem(item.id)} className="p-1 hover:bg-red-50 rounded flex items-center justify-center" title="Delete">
                                <TrashIcon className="w-3 h-3 text-red-400" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  const data = item.originalData!;
                  const dataIndex = item.originalIndex!;
                  const blockId = data.blockId;
                  const isHighlighted = blockId && highlightedBlockIds.has(blockId);
                  const isHoveredFromTag = blockId && hoveredBlockIds.has(blockId);

                  return (
                    <div key={item.id} className="relative group/wrapper">
                      <div
                        ref={(el) => {
                          if (el) leftRowRefs.current.set(item.id, el);
                          else leftRowRefs.current.delete(item.id);
                          // Also store ref for block-based scrolling
                          if (blockId && el) {
                            blockRefs.current.set(blockId, el);
                          }
                        }}
                        className={`mb-5 cursor-context-menu transition-all duration-200 rounded-lg ${isHoveredFromTag
                          ? 'ring-2 ring-amber-400 bg-amber-50 scale-[1.01] shadow-lg'
                          : isHighlighted
                            ? 'ring-2 ring-[#00A3AF]/30 bg-[#00A3AF]/5'
                            : ''
                          }`}
                        onMouseUp={() => handleTextSelection(dataIndex, blockId)}
                        onContextMenu={(e) => !isFiltered && handleContextMenu(e, originalIndex, dataIndex)}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {data.image && data.image.trim() ? (
                            <img src={data.image} alt={data.name} className="w-[26px] h-[26px] rounded-full flex-shrink-0 object-cover" />
                          ) : (
                            <div className="w-[26px] h-[26px] rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                              <NextImage
                                src={data.name.startsWith('Moderator') ? MicrophoneIcon : UserIcon}
                                alt="avatar"
                                width={16}
                                height={16}
                                className="opacity-60"
                              />
                            </div>
                          )}
                          <span className="font-semibold text-sm leading-tight">{data.name}</span>
                          <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                            <img src="/icons/clock-1.png" alt="Clock" className="w-[14px] h-[14px] object-contain" />
                            <span className="text-gray-400 text-xs leading-tight">{data.time}</span>
                          </span>
                        </div>
                        <div className="rounded-[10px] p-[12px]">
                          <p
                            className="text-sm leading-relaxed text-gray-600 text-justify"
                            data-block-text={data.message}
                            data-block-id={blockId}
                          >
                            {highlightTextWithRanges(data.message, blockId)}
                          </p>
                        </div>
                      </div>
                      {/* Show + button between items - hide when filtering */}
                      {!isFiltered && (
                        <div
                          className="absolute bottom-[-15px] left-0 w-full h-[30px] z-30 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
                          onClick={(e) => handleContextMenu(e, originalIndex + 1, dataIndex + 1)}
                        >
                          <div className="w-full h-[2px] bg-[#00A3AF] relative flex items-center justify-center">
                            <div className="bg-[#00A3AF] text-white rounded-full p-0.5 shadow-sm transform transition-transform hover:scale-110">
                              <PlusIcon className="w-3 h-3" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Side: Tags */}
            <div className="w-[420px] border-l border-gray-200 p-6 flex flex-col overflow-visible min-h-full" ref={rightListRef}>
              <div className="flex border-b border-gray-200 w-full mb-4">
                <button
                  onClick={() => setActiveTab("current")}
                  className={`flex-1 text-sm font-medium py-2 ${activeTab === "current" ? "text-[#00A3AF] border-b-2 border-[#00A3AF]" : "text-gray-500"}`}
                >
                  Current
                </button>
                <button
                  onClick={() => setActiveTab("recent")}
                  className={`flex-1 text-sm font-medium py-2 ${activeTab === "recent" ? "text-[#00A3AF] border-b-2 border-[#00A3AF]" : "text-gray-500"}`}
                >
                  Recent
                </button>
                <button
                  onClick={() => setActiveTab("recordings")}
                  className={`flex-1 text-sm font-medium py-2 ${activeTab === "recordings" ? "text-[#00A3AF] border-b-2 border-[#00A3AF]" : "text-gray-500"}`}
                >
                  Recordings
                </button>
              </div>

              {activeTab === "current" && (
                <div
                  className="relative flex-1 flex flex-col"
                  style={{ position: 'relative' }}
                  ref={rightContentRef}
                >
                  {displayItems.map((item, index) => {
                    const LANE_WIDTH = 12;

                    if (item.type !== 'data') {
                      // Geometry-driven: Get position from transcript element
                      const elementPos = elementPositions.get(index);
                      if (!elementPos) return null; // Wait for position calculation

                      // Collect all active master names that should pass through this section spacer
                      const activeMasterNames = Object.entries(masterTagMetadata)
                        .filter(([_, meta]) => index >= meta.firstItemIndex && index <= meta.lastItemIndex)
                        .map(([name, _]) => name);

                      // Section/Subsection spacer - absolutely positioned
                      return (
                        <div
                          key={item.id}
                          style={{
                            position: 'absolute',
                            top: `${elementPos.top}px`,
                            left: 0,
                            right: 0,
                            height: `${elementPos.height}px`,
                            pointerEvents: 'none' // Allow clicks to pass through to tags below
                          }}
                          className="w-full"
                        >
                          {/* Show section indicator in right panel */}
                          {item.type === 'section' && (
                            <div className="flex items-center gap-2 px-2 py-1 pointer-events-auto">
                              <div className="w-2 h-2 rounded-full bg-[#00A3AF]" />
                              <span className="text-xs font-semibold text-[#00A3AF] uppercase tracking-wider">
                                {item.title || 'Section'}
                              </span>
                              <div className="flex-1 h-px bg-[#00A3AF]/30" />
                            </div>
                          )}
                          {item.type === 'subsection' && (
                            <div className="flex items-center gap-2 px-2 py-1 ml-4 pointer-events-auto">
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">
                                {item.title || 'Subsection'}
                              </span>
                              <div className="flex-1 h-px bg-amber-300/50" />
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Geometry-driven: Tags are rendered absolutely, not in rows
                    // Return null here - tags will be rendered separately
                    return null;
                  })}

                  {/* Render all tags with absolute positioning */}
                  {tags
                    .filter(tag => {
                      // Rule 4.1 - Visibility is independent
                      const masterTagId = tag.masterTagId || tag.id;
                      if (visibleMasterIds.length === 0) return true; // Default to showing all if list is empty
                      return visibleMasterIds.includes(masterTagId);
                    })
                    .map((tag) => {

                      const LANE_WIDTH = 48; // Significantly increased to prevent lane collision
                      // For independent master tags (no primaries), use the first block index for positioning
                      const firstPrimary = tag.primaryList[0];
                      let itemIndex = -1;

                      if (firstPrimary) {
                        itemIndex = displayItems.findIndex(d => d.type === 'data' && d.originalIndex === firstPrimary.messageIndex);
                      } else if (tag.blockIds.length > 0) {
                        // Fallback: use the first block associated with this master tag
                        itemIndex = displayItems.findIndex(d => d.type === 'data' && d.id === tag.blockIds[0]);
                      }

                      if (itemIndex < 0) return null;

                      // Get position from coordinate system
                      const elementPos = elementPositions.get(itemIndex);
                      const tagPos = tagPositions.get(tag.id);

                      if (!elementPos || !tagPos) return null; // Wait for position calculation

                      // Use adjusted top from collision detection
                      const topPosition = tagPos.adjustedTop;

                      // CRITICAL: Use masterTagId for connection logic (not name)
                      // Rule: Solid line = same masterTagId, No connection = different masterTagId
                      // Same name but different ID = separate masters (no connection by default)
                      const masterTagId = tag.masterTagId || tag.id;
                      const meta = masterTagMetadata[masterTagId];
                      // Division of Lines: Offset solid lines within the same lane to avoid collision
                      const laneBaseLeft = (meta?.uniqueIndex || 0) * LANE_WIDTH + 12;
                      // First master is offset by 4px, subsequent ones by 6px increments
                      const laneOffset = 4 + (meta?.idIndexWithinLane || 0) * 6;
                      const masterLaneLeft = laneBaseLeft + laneOffset;

                      const tagColor = tag.masterColor || getMasterTagColor(masterTagId || tag.master || '');
                      const isDuplicateName = meta?.hasDuplicateName || false;

                      // Check if this is the first occurrence
                      const isFirstRowForTag = itemIndex === meta?.firstItemIndex;
                      const isFirstInstance = tag.id === meta?.id || tags.find(t => (t.masterTagId || t.id) === masterTagId)?.id === tag.id;
                      const shouldShowHeader = isFirstRowForTag && isFirstInstance;

                      // Get all primaries for this tag
                      const allPrimaries = tag.primaryList.map((p, i) => ({ ...p, originalIndex: i }));

                      // Calculate card indentation based on hierarchy
                      // Master tags (with header) should be indented, primary-only cards should be more indented
                      const cardIndentation = shouldShowHeader ? 20 : 40; // 20px for master, 40px for primary-only
                      const cardLeft = 64 + cardIndentation; // Base left (64px for tree lines) + indentation

                      return (
                        <div
                          key={tag.id}
                          data-tag-id={tag.id}
                          style={{
                            position: 'absolute',
                            top: `${topPosition}px`,
                            left: `${cardLeft}px`, // Indent entire card based on hierarchy
                            right: '24px',
                            zIndex: hoveredTagId === tag.id ? 30 : 10
                          }}
                          className="relative cursor-pointer"
                          data-spine-item={masterTagId}
                          data-spine-name={tag.master || 'No Master'}
                          data-is-root={shouldShowHeader}
                          onClick={(e) => {
                            // Prevent scroll when clicking interactive elements
                            if ((e.target as HTMLElement).closest('button, input')) return;
                            scrollToTagBlock(tag.blockIds);
                          }}
                        >
                          {/* Vertical Spine - Solid line for same masterTagId */}
                          {shouldShowHeader && spineOffsets[masterTagId] && (
                            <div
                              className="absolute w-[1.5px] transition-all duration-300 pointer-events-none z-0"
                              style={{
                                left: `-${64 + cardIndentation - masterLaneLeft}px`,
                                top: '18px',
                                height: `${spineOffsets[masterTagId].height}px`,
                                backgroundColor: tagColor,
                                opacity: 0.4
                              }}
                            />
                          )}

                          {/* Render all primary tags for this master tag */}
                          <div className="flex flex-col gap-0.5 bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden">
                            {/* 1. Header Logic: Rendered ONCE per tag group if it's the root */}
                            <React.Fragment>
                              {/* Horizontal Stem for the card's first row */}
                              {/* Division of Lines: Horizontal stems start from the base lane position to bridge dotted spine */}
                              <div
                                className="absolute h-[1.5px] pointer-events-none"
                                style={{
                                  // Start from the base lane (where the dotted spine is)
                                  left: `${-(64 + cardIndentation - laneBaseLeft)}px`,
                                  // Width extends from base lane to the card edge (0px)
                                  width: `${64 + cardIndentation - laneBaseLeft}px`,
                                  top: '18px',
                                  backgroundColor: tagColor,
                                  opacity: 0.4,
                                  backgroundImage: 'none'
                                }}
                              />


                              {shouldShowHeader && (
                                <React.Fragment>
                                  <MasterTagRow
                                    name={tag.master || "No Master"}
                                    selectedText={tag.primaryList.length === 0 ? (tag.allText?.[0] || '') : undefined}
                                    isEditing={editingItem.id === tag.id && editingItem.type === 'master'}
                                    isHighlighted={activeMasterTagId === masterTagId}
                                    color={tagColor}
                                    impressionCount={impressionIndexes[tag.id] || 1}
                                    onEdit={() => handleMasterEditClick(tag)}
                                    onClick={() => {
                                      // CRITICAL: Use masterTagId for isolation
                                      if (activeMasterTagId === masterTagId) {
                                        setActiveMasterTagId(null);
                                        setEditingMasterName(null);
                                      } else {
                                        const tagId = tag.masterTagId || tag.id;
                                        setActiveMasterTagId(tagId);
                                        setEditingMasterName(tag.master);
                                      }
                                    }}
                                    onDelete={() => initiateDeleteMaster(tag.id)}
                                    onAdd={() => toggleBranchInput(tag.id)}
                                    onAddPrimary={tag.primaryList.length === 0 ? () => togglePrimaryInput(tag.id) : undefined}
                                    onSave={(newName) => {
                                      setEditingItem(prev => ({ ...prev, tempValue: newName }));
                                      saveEditing();
                                    }}
                                    onCancel={() => {
                                      // CRITICAL: Only clear activeMasterTagId if it matches this tag
                                      if (activeMasterTagId === masterTagId) {
                                        setActiveMasterTagId(null);
                                        setEditingMasterName(null);
                                      }
                                      cancelEditing();
                                    }}
                                  />

                                  {/* Branch Tags (Master level) */}
                                  {tag.branchTags && tag.branchTags.length > 0 && (
                                    <TagRowLayout level={2} className="mt-0.5">
                                      <div className="flex flex-wrap gap-1.5 items-center min-h-[32px]">
                                        {(() => {
                                          const groupId = `${tag.id}-master-branches`;
                                          const isExpanded = expandedTagGroups.has(groupId);
                                          const visibleTags = isExpanded ? tag.branchTags : tag.branchTags.slice(0, 3);
                                          const remainingCount = tag.branchTags.length - visibleTags.length;

                                          return (
                                            <>
                                              {visibleTags.map((b, idx) => (
                                                <BranchTagChip
                                                  key={b.id || idx}
                                                  name={b.name}
                                                  variant="master"
                                                  isEditing={editingItem.id === tag.id && editingItem.type === 'master_branch' && editingItem.index === idx}
                                                  onEdit={() => startEditing(tag.id, 'master_branch', b.name, idx)}
                                                  onDelete={() => removeBranchTag(tag.id, b.id)}
                                                  onSave={(newName) => {
                                                    setEditingItem(prev => ({ ...prev, tempValue: newName }));
                                                    saveEditing();
                                                  }}
                                                  onCancel={cancelEditing}
                                                />
                                              ))}
                                              {tag.branchTags.length > 3 && (
                                                <button
                                                  onClick={() => toggleTagGroupExpansion(groupId)}
                                                  className="text-[10px] text-gray-400 hover:text-[#00A3AF] font-medium px-1 py-0.5 rounded hover:bg-cyan-50 transition-colors"
                                                >
                                                  {isExpanded ? 'Show Less' : `+${remainingCount} more`}
                                                </button>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </TagRowLayout>
                                  )}

                                  {/* Branch Input Slot */}
                                  {branchInput?.tagId === tag.id && (
                                    <ReservedEditSlotRow
                                      level={2}
                                      placeholder="Add branch tag..."
                                      onSave={(val: string) => addBranchTag(tag.id, val)}
                                      onCancel={() => setBranchInput(null)}
                                    />
                                  )}

                                  {/* Primary Input slot (for empty master) */}
                                  {tag.primaryList.length === 0 && savedPrimaryInput?.tagId === tag.id && (
                                    <ReservedEditSlotRow
                                      level={2}
                                      placeholder="Add primary tag..."
                                      onSave={(val: string) => addPrimaryToSavedTag(tag.id, val)}
                                      onCancel={() => setSavedPrimaryInput(null)}
                                    />
                                  )}
                                </React.Fragment>
                              )}
                            </React.Fragment>

                            {/* 2. Primaries Logic: Rendered ONLY if they exist */}
                            {allPrimaries.map((p, i) => {
                              // Calculate exact vertical position for each primary tag's horizontal stem
                              // MasterTagRow: min-h-[32px], center at ~16px from row top
                              // Gap between rows: 2px (gap-0.5)
                              // PrimaryTagRow: min-h-[32px], center at ~16px from row top
                              // Formula: master height + gap + (i * (primary height + gap)) + primary center
                              let primaryTopPosition = 18; // Default for first primary when no header
                              if (shouldShowHeader) {
                                // Each primary tag gets its own horizontal stem connecting to the vertical line
                                const masterRowHeight = 32;
                                const gap = 2;
                                const primaryRowHeight = 32;
                                const primaryRowCenter = 16;
                                // Position = master row + gap + cumulative primary rows + current primary center
                                primaryTopPosition = masterRowHeight + gap + (i * (primaryRowHeight + gap)) + primaryRowCenter;
                              } else {
                                // No master header, calculate from start
                                primaryTopPosition = 18 + (i * 34); // 32px row + 2px gap, center at 16px
                              }

                              return (
                                <React.Fragment key={p.impressionId || `${p.value}-${i}`}>
                                  {/* Horizontal Stem connecting vertical spine to primary tag - L-shaped connection */}
                                  {/* Rule 3: Primary tags attach only to their parent master - use solid line */}
                                  {(i > 0 || shouldShowHeader) && (
                                    <div
                                      className="absolute h-[1.5px] pointer-events-none"
                                      style={{
                                        // Start from the right edge of the vertical spine (1.5px wide)
                                        left: `${-(64 + cardIndentation - masterLaneLeft) + 1.5}px`,
                                        // Width extends from spine to card edge (0px)
                                        width: `${64 + cardIndentation - masterLaneLeft - 1.5}px`,
                                        top: `${primaryTopPosition}px`,
                                        backgroundColor: tagColor,
                                        opacity: 0.4,
                                        backgroundImage: 'none'
                                      }}
                                    />
                                  )}

                                  {/* Primary Row */}
                                  {(() => {
                                    const isEditingPrimary = editingItem.id === tag.id && editingItem.type === 'primary' && editingItem.index === p.originalIndex;
                                    return (
                                      <div data-primary-row>
                                        <PrimaryTagRow
                                          name={p.value}
                                          selectedText={p.selectedText}
                                          isEditing={isEditingPrimary}
                                          onEdit={() => startEditing(tag.id, 'primary', p.value, p.originalIndex)}
                                          onDelete={() => initiateDeletePrimary(tag.id, p.originalIndex, p.impressionId)}
                                          onComment={() => startEditing(tag.id, 'primary_comment', p.comment || "", p.originalIndex)}
                                          onAdd={isEditingPrimary ? () => toggleSecondaryInput(tag.id, p.originalIndex) : undefined}
                                          onSave={(newName) => {
                                            setEditingItem(prev => ({ ...prev, tempValue: newName }));
                                            saveEditing();
                                          }}
                                          onCancel={cancelEditing}
                                        />
                                      </div>
                                    );
                                  })()}

                                  {/* Primary Comment (if exists and not editing) */}
                                  {p.comment && !(editingItem.id === tag.id && editingItem.type === 'primary_comment' && editingItem.index === p.originalIndex) && (
                                    <div className="pl-6 pr-2 py-1 bg-blue-50/30 border-l-2 border-blue-200">
                                      <p className="text-[10px] text-blue-600 italic truncate">
                                        "{p.comment}"
                                      </p>
                                    </div>
                                  )}

                                  {/* Secondary Tags (Primary level) - Horizontal Wrap */}
                                  {p.secondaryTags && p.secondaryTags.length > 0 && (
                                    <TagRowLayout level={2}>
                                      <div className="flex flex-wrap gap-1.5 items-center min-h-[32px]">
                                        {(() => {
                                          const groupId = `${tag.id}-${p.originalIndex}-secondary-branches`;
                                          const isExpanded = expandedTagGroups.has(groupId);
                                          const visibleTags = isExpanded ? p.secondaryTags : p.secondaryTags.slice(0, 3);
                                          const remainingCount = p.secondaryTags.length - visibleTags.length;

                                          return (
                                            <>
                                              {visibleTags.map((sec, secIdx) => (
                                                <BranchTagChip
                                                  key={sec.id || secIdx}
                                                  name={sec.value}
                                                  variant="primary"
                                                  isEditing={editingItem.id === tag.id && editingItem.type === 'secondary' && editingItem.index === (p.originalIndex * 100 + secIdx)}
                                                  onEdit={() => startEditing(tag.id, 'secondary', sec.value, p.originalIndex * 100 + secIdx)}
                                                  onDelete={() => removeSecondaryTag(tag.id, p.originalIndex, secIdx)}
                                                  onSave={(newName) => {
                                                    setEditingItem(prev => ({ ...prev, tempValue: newName }));
                                                    saveEditing();
                                                  }}
                                                  onCancel={cancelEditing}
                                                />
                                              ))}
                                              {p.secondaryTags.length > 3 && (
                                                <button
                                                  onClick={() => toggleTagGroupExpansion(groupId)}
                                                  className="text-[10px] text-gray-400 hover:text-[#00A3AF] font-medium px-1 py-0.5 rounded hover:bg-cyan-50 transition-colors"
                                                >
                                                  {isExpanded ? 'Show Less' : `+${remainingCount} more`}
                                                </button>
                                              )}
                                            </>
                                          );
                                        })()}
                                      </div>
                                    </TagRowLayout>
                                  )}

                                  {/* Secondary Tag Input Slot */}
                                  {secondaryInput?.entryId === tag.id && secondaryInput?.primaryIndex === p.originalIndex && (
                                    <ReservedEditSlotRow
                                      level={2}
                                      placeholder="Add secondary tag..."
                                      onSave={(val: string) => addSecondaryTag(tag.id, p.originalIndex, val)}
                                      onCancel={() => setSecondaryInput(null)}
                                    />
                                  )}

                                  {/* Primary Comment Input Slot */}
                                  {editingItem.id === tag.id && editingItem.type === 'primary_comment' && editingItem.index === p.originalIndex && (
                                    <ReservedEditSlotRow
                                      level={2}
                                      isComment={true}
                                      placeholder="Primary tag comment..."
                                      initialValue={editingItem.tempValue}
                                      onSave={(val: string) => {
                                        setEditingItem(prev => ({ ...prev, tempValue: val }));
                                        saveEditing();
                                      }}
                                      onCancel={cancelEditing}
                                    />
                                  )}

                                </React.Fragment>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                  {/* Dotted Line Connections for Same-Name but Different-ID Masters */}
                  {/* Rule 1.1: Dotted line exists ONLY between master anchors, never extending beyond */}
                  {Object.entries(dottedSpineOffsets).map(([connectionKey, connection]) => {
                    const LANE_WIDTH = 48; // Significantly increased to prevent lane collision
                    if (connection.masterTagIds.length < 2 || !connection.anchors || connection.anchors.length < 2) return null;

                    // Get all metadata for the same-name masters
                    const sameNameMetas = connection.masterTagIds
                      .map(id => masterTagMetadata[id])
                      .filter(Boolean);
                    if (sameNameMetas.length < 2) return null;

                    // Find leftmost position for alignment
                    const leftmostLane = Math.min(...sameNameMetas.map(m => (m.uniqueIndex || 0) * LANE_WIDTH + 12));

                    // Get the color from the first master
                    const firstMasterId = connection.masterTagIds[0];
                    const firstTag = tags.find(t => (t.masterTagId || t.id) === firstMasterId);
                    const connectionColor = firstTag?.masterColor || getMasterTagColor(firstMasterId || '');

                    // Rule 3.1: Vertical line segment from first anchor to last anchor
                    // Anchors are already sorted by Y position
                    const firstAnchor = connection.anchors[0];
                    const lastAnchor = connection.anchors[connection.anchors.length - 1];
                    const firstAnchorY = firstAnchor.anchorY;
                    const lastAnchorY = lastAnchor.anchorY;

                    return (
                      <React.Fragment key={connectionKey}>
                        {/* Rule 3.1: Vertical Dotted Line - starts at first anchor, ends at last anchor */}
                        {/* Rule 1.1: Never extends beyond these bounds */}
                        <div
                          className="absolute pointer-events-none z-[1] overflow-hidden"
                          style={{
                            left: `${leftmostLane}px`,
                            top: `${firstAnchorY}px`,
                            height: `${Math.max(lastAnchorY - firstAnchorY, 1)}px`,
                            width: '1.5px'
                          }}
                        >
                          <div
                            className="absolute w-full h-full"
                            style={{
                              backgroundColor: 'transparent',
                              backgroundImage: `repeating-linear-gradient(180deg, ${connectionColor} 0px, ${connectionColor} 3px, transparent 3px, transparent 7px)`,
                              backgroundSize: '1.5px 7px',
                              backgroundRepeat: 'repeat-y',
                              opacity: 0.4
                            }}
                          />
                        </div>

                        {/* Rule 4.1: Horizontal Stubs - Short connectors from dotted line to each anchor */}
                        {/* Rule 4.2: Stubs end exactly at card boundary, never overshoot */}
                        {connection.anchors.map((anchor, idx) => {
                          // Stub length: from dotted line to card edge
                          // Use actual cardLeft from anchor data, but ensure minimum 12px
                          const stubLength = Math.max(anchor.cardLeft - leftmostLane - 1.5, 12);

                          return (
                            <div
                              key={`stub-${anchor.masterTagId}-${idx}`}
                              className="absolute pointer-events-none z-[1]"
                              style={{
                                left: `${leftmostLane}px`,
                                top: `${anchor.anchorY}px`,
                                width: `${stubLength}px`,
                                height: '1.5px',
                                backgroundColor: connectionColor,
                                opacity: 0.4
                              }}
                            />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}

                  {/* Render pending entries with absolute positioning */}
                  {pending.map((entry) => {
                    const itemIndex = displayItems.findIndex(d => d.type === 'data' && d.originalIndex === entry.messageIndex);
                    if (itemIndex < 0) return null;

                    const elementPos = elementPositions.get(itemIndex);
                    if (!elementPos) return null;

                    // Use selection top if available, otherwise element top
                    const topPosition = elementPos.selectionTop ?? elementPos.top;

                    // Pending entries are always primary-level, so indent 40px
                    const pendingCardLeft = 64 + 40; // Base left (64px for tree lines) + 40px for primary indentation

                    return (
                      <div
                        key={entry.id}
                        style={{
                          position: 'absolute',
                          top: `${topPosition}px`,
                          left: `${pendingCardLeft}px`,
                          right: '24px',
                          zIndex: 20
                        }}
                        className="relative"
                      >
                        {/* PENDING ENTRY FORM */}
                        {entry && (
                          <div className="p-4 rounded-xl bg-white border-2 border-[#E0F7FA] shadow-md relative z-30 mt-2">
                            {/* Remove Entry Button */}
                            <button
                              onClick={() => handleRemovePendingEntry(entry.id)}
                              className="absolute -top-2 -right-2 p-1.5 bg-white border border-gray-200 shadow-md hover:bg-red-50 rounded-full transition-all duration-200 group z-40 hover:scale-110"
                              title="Remove selection"
                            >
                              <XMarkIcon className="w-4 h-4 text-gray-500 group-hover:text-red-500" />
                            </button>
                            {/* --- MASTER INPUT AREA --- */}
                            {pending[0]?.id === entry.id &&
                              !masterConfirmed &&
                              !masterCancelled && (
                                <div className="flex flex-col w-full relative mb-2">
                                  <div className="flex items-center gap-2 w-full">
                                    <div className="relative flex-1">
                                      <input
                                        type="text"
                                        placeholder="Master"
                                        value={masterInput}
                                        onChange={(e) => {
                                          setMasterInput(e.target.value);
                                          setShowMasterSuggestions(true);
                                        }}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A3AF]"
                                      />
                                      {showMasterSuggestions && masterInput && masterSuggestions.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-48 overflow-y-auto">
                                          {masterSuggestions.map((s, i) => (
                                            <div key={i} className="px-4 py-2 text-sm cursor-pointer hover:bg-[#E7FAFC] hover:text-[#00A3AF]"
                                              onClick={() => { setMasterInput(s!); setShowMasterSuggestions(false); }}>
                                              {s}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                    <button onClick={handleMasterAddClick} className="px-4 py-2 bg-[#00A3AF] text-white rounded-lg text-sm font-medium">+</button>
                                    <button onClick={handleMasterCancelAction} className="px-3 py-2 border text-gray-600 rounded-lg text-sm bg-white hover:bg-gray-50">Cancel</button>
                                  </div>
                                </div>
                              )}

                            {/* --- CONFIRMED MASTER DISPLAY --- */}
                            {pending[0]?.id === entry.id && masterConfirmed && !masterCancelled && (
                              <div className="flex items-center justify-between bg-[#F0FDFA] px-3 py-2 rounded border border-[#CCFBF1] mb-2">
                                <div className="flex items-center gap-2 flex-1 flex-wrap">
                                  <div className="text-sm font-bold text-[#0F766E]">{masterInput || "Master (empty)"}</div>

                                  {/* Branch Tags Display for Pending */}
                                  {entry.branchTags && entry.branchTags.length > 0 && (
                                    <div className="flex items-center gap-1">
                                      {entry.branchTags.map((b, bIdx) => (
                                        <span key={bIdx} className="text-[9px] bg-[#00A3AF]/10 text-[#00A3AF] px-1.5 py-0.5 rounded border border-[#00A3AF]/20 flex items-center gap-1 group/pbranch">
                                          {b.value}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removeBranchTag(entry.id, undefined, bIdx); }}
                                            className="text-red-400 opacity-0 group-hover/pbranch:opacity-100 transition-opacity"
                                          >
                                            <XMarkIcon className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Add Branch Button for Pending - Support multiple */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleBranchInput(entry.id); }}
                                    className="p-0.5 bg-white/50 hover:bg-white rounded text-[#00A3AF] transition-colors"
                                    title={entry.branchTags && entry.branchTags.length > 0 ? "Add another branch tag" : "Add branch tag"}
                                  >
                                    <PlusIcon className="w-3 h-3" />
                                  </button>

                                  {/* Branch Tag Input for Pending */}
                                  {branchInput?.tagId === entry.id && (
                                    <div className="flex items-center gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        autoFocus
                                        type="text"
                                        placeholder="Branch..."
                                        value={branchInput.value}
                                        onChange={(e) => setBranchInput({ ...branchInput, value: e.target.value })}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addBranchTag(entry.id, branchInput.value);
                                          if (e.key === 'Escape') setBranchInput(null);
                                        }}
                                        className="px-2 py-0.5 text-[10px] border border-[#00A3AF] rounded focus:outline-none w-20"
                                      />
                                      <button onClick={() => addBranchTag(entry.id, branchInput.value)} className="p-0.5 hover:bg-[#E0F7FA] rounded">
                                        <CheckIcon className="w-3.5 h-3.5 text-[#00A3AF]" />
                                      </button>
                                      <button onClick={() => setBranchInput(null)} className="p-0.5 hover:bg-gray-100 rounded">
                                        <XMarkIcon className="w-3.5 h-3.5 text-gray-400" />
                                      </button>
                                    </div>
                                  )}

                                  {editingItem.id === entry.id && editingItem.type === 'pending_master_comment' ? (
                                    <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        autoFocus
                                        type="text"
                                        placeholder="Add master comment..."
                                        value={editingItem.tempValue}
                                        onChange={(e) => setEditingItem({ ...editingItem, tempValue: e.target.value })}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveEditing();
                                          if (e.key === 'Escape') cancelEditing();
                                        }}
                                        className="flex-1 px-2 py-1 text-[10px] border border-[#00A3AF] rounded focus:outline-none"
                                      />
                                      <button onClick={saveEditing} className="p-0.5 hover:bg-[#E0F7FA] rounded">
                                        <CheckIcon className="w-3 h-3 text-[#00A3AF]" />
                                      </button>
                                      <button onClick={cancelEditing} className="p-0.5 hover:bg-gray-100 rounded">
                                        <XMarkIcon className="w-3 h-3 text-gray-500" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative group/tooltip">
                                      <button
                                        onClick={() => startEditing(entry.id, 'pending_master_comment', masterComment || "")}
                                        className="p-1 hover:bg-[#E0F7FA] rounded"
                                      >
                                        <ChatBubbleBottomCenterTextIcon
                                          className={`w-4 h-4 cursor-pointer ${masterComment ? 'text-[#00A3AF]' : 'text-gray-300'}`}
                                        />
                                      </button>
                                      {masterComment && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-max max-w-[200px] hidden group-hover/tooltip:block z-50">
                                          <div className="bg-black text-white text-xs rounded py-1 px-2 shadow-lg relative">
                                            {masterComment}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-black"></div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={handleEditMaster}
                                  className="p-1 text-gray-400 hover:text-[#0F766E] hover:bg-[#0F766E]/10 rounded transition-colors"
                                  title="Edit Master"
                                >
                                  <PencilSquareIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {!entry.primaryInputClosed && (
                              <div className="flex flex-col w-full relative">
                                <div className="flex items-center gap-2 w-full">
                                  <div className="relative flex-1">
                                    <input
                                      type="text"
                                      placeholder={`Primary tag (optional)...`}
                                      value={entry.primaryInput}
                                      onFocus={() => {
                                        setShowPrimarySuggestions(entry.id);
                                        if (masterInput.trim()) fetchPrimaryTags(masterInput.trim(), entry.primaryInput);
                                      }}
                                      onChange={(e) => {
                                        handlePrimaryChange(entry.id, e.target.value);
                                        setShowPrimarySuggestions(entry.id);
                                      }}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#00A3AF]"
                                    />
                                    {showPrimarySuggestions === entry.id && (
                                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 z-50 max-h-64 overflow-y-auto overflow-x-hidden">
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                                          <span>Primary Tags under "{masterInput}"</span>
                                        </div>

                                        {/* Existing Instances */}
                                        {getPrimarySuggestions(entry.id).map((p) => (
                                          <div
                                            key={p.id}
                                            className="px-4 py-2 text-sm cursor-pointer hover:bg-[#E7FAFC] hover:text-[#00A3AF] flex justify-between items-center group/sugg transition-colors border-b border-gray-50 last:border-0"
                                            onClick={() => handleSelectPrimaryInstance(entry.id, p)}
                                          >
                                            <div className="flex flex-col min-w-0">
                                              <span className="font-semibold truncate text-gray-700 group-hover/sugg:text-[#00A3AF]">{p.name}</span>
                                            </div>
                                          </div>
                                        ))}

                                        {/* Create New Option - Always show if there is input, or if no suggestions */}
                                        {(entry.primaryInput.trim() || getPrimarySuggestions(entry.id).length === 0) && (
                                          <div
                                            className="px-4 py-3 text-sm cursor-pointer hover:bg-[#E7FAFC] hover:text-[#00A3AF] border-t border-gray-100 font-medium text-[#00A3AF] flex items-center gap-2 group/new transition-colors"
                                            onClick={() => handleInitiateAddPrimary(entry.id)}
                                          >
                                            <div className="w-5 h-5 rounded-full bg-[#00A3AF]/10 flex items-center justify-center shrink-0 group-hover/new:bg-[#00A3AF]/20">
                                              <PlusIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                              <span className="truncate font-semibold text-xs">Create new: "{entry.primaryInput.trim() || 'New Tag'}"</span>
                                            </div>
                                          </div>
                                        )}

                                        {/* Informational message if no input and no suggestions */}
                                        {!entry.primaryInput.trim() && getPrimarySuggestions(entry.id).length === 0 && (
                                          <div className="px-4 py-4 text-xs text-gray-400 text-center italic">
                                            Type to create a new primary tag.
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={() => handleInitiateAddPrimary(entry.id)} className="px-4 py-2 bg-[#00A3AF] text-white rounded-lg text-sm font-medium">+</button>
                                </div>
                              </div>
                            )}

                            {entry.primaryList.length > 0 && (
                              <div className="relative mt-4 ml-2">
                                <div className="absolute left-[9px] top-0 bottom-2 w-[2px] bg-gray-200"></div>
                                <div className="space-y-3">
                                  {entry.primaryList.map((p, pIndex) => (
                                    <div key={pIndex} className="relative">
                                      {/* Primary Tag Row */}
                                      <div className="relative pl-6 flex items-center justify-between text-sm group">
                                        <div className="absolute left-[9px] top-1/2 w-3 h-[2px] bg-gray-200 -translate-y-1/2"></div>
                                        <div className="absolute left-[6px] top-1/2 -translate-y-1/2 w-2 h-2 bg-white border border-gray-300 rounded-full"></div>

                                        <div className="flex flex-col flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            {editingItem.id === entry.id && editingItem.type === 'pending_primary' && editingItem.index === pIndex ? (
                                              <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                  autoFocus
                                                  type="text"
                                                  value={editingItem.tempValue}
                                                  onChange={(e) => setEditingItem({ ...editingItem, tempValue: e.target.value })}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveEditing();
                                                    if (e.key === 'Escape') cancelEditing();
                                                  }}
                                                  className="flex-1 px-2 py-1 text-xs font-semibold border border-[#00A3AF] rounded focus:outline-none"
                                                />
                                                <button onClick={saveEditing} className="p-0.5 hover:bg-[#E0F7FA] rounded">
                                                  <CheckIcon className="w-3 h-3 text-[#00A3AF]" />
                                                </button>
                                                <button onClick={cancelEditing} className="p-0.5 hover:bg-gray-100 rounded">
                                                  <XMarkIcon className="w-3 h-3 text-gray-500" />
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-2 overflow-hidden">
                                                <span className="font-semibold text-gray-700 truncate">{p.displayName || p.value}</span>
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); removePrimaryTag(entry.id, pIndex); }}
                                                  className="p-1 hover:bg-red-50 rounded text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                  title="Remove primary tag"
                                                >
                                                  <XMarkIcon className="w-3.5 h-3.5" />
                                                </button>

                                                {/* Inline Secondary Tags Display for Pending */}
                                                {p.secondaryTags && p.secondaryTags.length > 0 && (
                                                  <div className="flex items-center gap-1 flex-shrink-0">
                                                    {p.secondaryTags.map((sec, secIdx) => (
                                                      <span key={secIdx} className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100 flex items-center gap-1 group/sec">
                                                        {sec.value}
                                                        <button
                                                          onClick={(e) => { e.stopPropagation(); removeSecondaryTag(entry.id, pIndex, secIdx); }}
                                                          className="text-red-400 opacity-0 group-hover/sec:opacity-100 transition-opacity"
                                                        >
                                                          <XMarkIcon className="w-2.5 h-2.5" />
                                                        </button>
                                                      </span>
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1 mt-1">
                                            {editingItem.id === entry.id && editingItem.type === 'pending_primary' && editingItem.index === pIndex ? null : (
                                              <>
                                                {/* Add Secondary Tag Button - Limit to 1 */}
                                                {(!p.secondaryTags || p.secondaryTags.length === 0) && (
                                                  <button
                                                    onClick={() => toggleSecondaryInput(entry.id, pIndex)}
                                                    className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                                    title="Add secondary tag"
                                                  >
                                                    <PlusIcon className="w-3.5 h-3.5" />
                                                  </button>
                                                )}

                                                <button
                                                  onClick={() => startEditing(entry.id, 'pending_primary', p.value, pIndex)}
                                                  className="p-1 hover:bg-gray-100 rounded"
                                                  title="Edit primary tag"
                                                >
                                                  <PencilIcon className="w-3.5 h-3.5 text-gray-400" />
                                                </button>

                                                <button
                                                  onClick={() => startEditing(entry.id, 'pending_primary_comment', p.comment || "", pIndex)}
                                                  className="p-1 hover:bg-gray-100 rounded"
                                                >
                                                  <ChatBubbleBottomCenterTextIcon
                                                    className={`w-3.5 h-3.5 cursor-pointer ${p.comment ? 'text-[#00A3AF]' : 'text-gray-300'}`}
                                                  />
                                                </button>
                                              </>
                                            )}
                                          </div>

                                          {p.comment && !(editingItem.id === entry.id && editingItem.type === 'pending_primary_comment' && editingItem.index === pIndex) && (
                                            <span className="text-[10px] text-gray-400 mt-0.5 italic truncate max-w-[150px]">"{p.comment}"</span>
                                          )}
                                        </div>

                                        <button onClick={() => handleDeletePendingPrimary(entry.id, pIndex)} className="text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity self-start mt-1">
                                          <TrashIcon className="w-4 h-4" />
                                        </button>
                                      </div>

                                      {/* Secondary Tag Input */}
                                      {secondaryInput?.entryId === entry.id && secondaryInput?.primaryIndex === pIndex && (
                                        <div className="ml-10 mt-2 flex items-center gap-2">
                                          <input
                                            type="text"
                                            placeholder="Secondary tag name..."
                                            value={secondaryInput.value}
                                            onChange={(e) => setSecondaryInput({ ...secondaryInput, value: e.target.value })}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                addSecondaryTag(entry.id, pIndex, secondaryInput.value);
                                              } else if (e.key === 'Escape') {
                                                setSecondaryInput(null);
                                              }
                                            }}
                                            autoFocus
                                            className="flex-1 text-xs border border-purple-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                          />
                                          <button
                                            onClick={() => addSecondaryTag(entry.id, pIndex, secondaryInput.value)}
                                            className="p-1 hover:bg-emerald-50 rounded"
                                          >
                                            <CheckIcon className="w-4 h-4 text-emerald-500" />
                                          </button>
                                          <button
                                            onClick={() => setSecondaryInput(null)}
                                            className="p-1 hover:bg-gray-100 rounded"
                                          >
                                            <XMarkIcon className="w-4 h-4 text-gray-400" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "recent" && <RecentTags />}

              {activeTab === "recordings" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Uploaded Videos</h3>
                    <button
                      onClick={async () => {
                        setLoadingVideos(true);
                        try {
                          const response = await fetch("/api/videos");
                          if (response.ok) {
                            const data = await response.json();
                            setVideos(data.videos || []);
                          }
                        } catch (error) {
                          console.error("Failed to refresh videos:", error);
                        } finally {
                          setLoadingVideos(false);
                        }
                      }}
                      className="text-sm text-[#00A3AF] hover:text-[#008C97] font-medium"
                    >
                      Refresh
                    </button>
                  </div>

                  {loadingVideos ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-gray-500">Loading videos...</div>
                    </div>
                  ) : videos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="text-gray-400 mb-2">No videos uploaded yet</div>
                      <div className="text-sm text-gray-500">Upload videos from the home page to see them here</div>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
                      {videos.map((video) => (
                        <div
                          key={video.key}
                          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-16 h-16 bg-[#E0F7FA] rounded-lg flex items-center justify-center">
                              <svg
                                className="w-8 h-8 text-[#00A3AF]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-gray-900 truncate mb-1">
                                {video.fileName}
                              </h4>
                              <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
                                <span>
                                  {new Date(video.lastModified).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })}
                                </span>
                                <span>
                                  {(video.size / (1024 * 1024)).toFixed(2)} MB
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={video.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-[#00A3AF] hover:text-[#008C97] font-medium"
                                >
                                  View Video
                                </a>
                                <span className="text-gray-300">•</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(video.url);
                                    alert("Video URL copied to clipboard!");
                                  }}
                                  className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                                >
                                  Copy URL
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div >
  );
}
