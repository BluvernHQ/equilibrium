"use client";

import { useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";
import { sessionsData } from "../data/sessions";
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon, PlusIcon, ChatBubbleBottomCenterTextIcon, StopIcon, ArrowDownIcon } from "@heroicons/react/24/solid";
import { DeleteModal } from "../components/action-modals";
import RecentTags from "../components/RecentTags";
import Link from "next/link";

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

// Secondary tag interface
interface SecondaryTag {
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
  comment?: string;
  impressionId?: string; // Database impression ID
  secondaryTags?: SecondaryTag[]; // Secondary tags under this primary
  selectedText?: string; // The exact selected text (for card preview)
  selectionRange?: SelectionRange; // Character offsets within the block
}

interface TagItem {
  id: string;
  master: string | null;
  masterTagId?: string; // Database master tag ID
  masterComment?: string;
  masterColor?: string; // Stored or generated color for this master tag
  isClosed?: boolean;
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
  blockId?: string; // Database block ID
  text: string;
  selectedText: string; // The exact selected text (for display in cards)
  selectionRange?: SelectionRange; // Character offsets within the block
  primaryInput: string;
  primaryInputClosed?: boolean;
  primaryList: PendingPrimary[];
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
  primaryTags: {
    id: string;
    name: string;
    instanceIndex?: number;
    displayName?: string;
    impressionId: string;
    blockIds: string[];
    selectedText?: string; // The exact selected text
    selectionRanges?: SelectionRange[]; // Character offsets within blocks
    comment?: string;
  }[];
  blockIds: string[];
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
    return `Person ${label.charCodeAt(0) - 64}`;
  }
  return label;
}

export default function Sessions() {
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

  // Data State
  const [tags, setTags] = useState<TagItem[]>([]);

  // Track the absolute first occurrence of each master tag name for sidebar headers
  // Track the absolute first and last occurrences of each master tag name for tree lines
  const masterTagMetadata = useMemo(() => {
    const metadata: Record<string, { 
      firstItemIndex: number, 
      lastItemIndex: number,
      color: string,
      id: string,
      uniqueIndex: number // Used for horizontal positioning of vertical lines
    }> = {};
    
    let masterCounter = 0;
    
    displayItems.forEach((item, itemIndex) => {
      if (item.type !== 'data') return;
      const dataIndex = item.originalIndex!;
      
      const tagsForThisRow = tags.filter(tag => {
        const indices = tag.primaryList.map(p => p.messageIndex);
        return dataIndex >= Math.min(...indices) && dataIndex <= Math.max(...indices);
      });
      
      tagsForThisRow.forEach((tag) => {
        const name = tag.master || 'No Master';
        if (!metadata[name]) {
          metadata[name] = { 
            firstItemIndex: itemIndex, 
            lastItemIndex: itemIndex,
            color: tag.masterColor || getMasterTagColor(tag.masterTagId || tag.id || name),
            id: tag.masterTagId || tag.id,
            uniqueIndex: masterCounter++
          };
        } else {
          metadata[name].lastItemIndex = itemIndex;
        }
      });
    });
    
    return metadata;
  }, [displayItems, tags]);

  // --- Connector Spine State & Logic ---
  const [spineOffsets, setSpineOffsets] = useState<Record<string, { top: number; height: number }>>({});

  // Recalculate spine heights from live DOM bounds whenever layout changes
  useLayoutEffect(() => {
    const container = rightListRef.current;
    if (!container) return;

    const updateSpines = () => {
      const containerRect = container.getBoundingClientRect();
      const newOffsets: Record<string, { top: number; height: number }> = {};

      Object.keys(masterTagMetadata).forEach((masterName) => {
        const items = container.querySelectorAll(`[data-spine-item="${masterName}"]`);
        if (items.length === 0) return;

        let rootTop = 0;
        let maxBottom = -Infinity;

        items.forEach((item) => {
          const rect = item.getBoundingClientRect();
          // Normalize to container space (relative to right panel root)
          const relativeTop = rect.top - containerRect.top + container.scrollTop;
          
          if (item.getAttribute('data-is-root') === 'true') {
            rootTop = relativeTop + 18; // Spine starts at stem level (18px from top of card)
          }
          
          // Every item's horizontal stem level is a potential end point for the spine
          const stemLevel = relativeTop + 18;
          if (stemLevel > maxBottom) maxBottom = stemLevel;
        });

        if (maxBottom > -Infinity) {
          // Height is the distance from root stem to the last item's stem
          newOffsets[masterName] = {
            top: rootTop,
            height: Math.max(maxBottom - rootTop, 1)
          };
        }
      });

      setSpineOffsets(newOffsets);
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

  const [highlightedTexts, setHighlightedTexts] = useState<string[]>([]);
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
  const [editingMasterName, setEditingMasterName] = useState<string | null>(null);
  
  // Refs for scrolling to blocks
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Inline Edit State
  const [editingItem, setEditingItem] = useState<{
    id: string | null;
    type: 'master' | 'primary' | 'master_comment' | 'primary_comment' | 'pending_master_comment' | 'pending_primary_comment' | null;
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
  const leftRowRefs = useRef<(HTMLDivElement | null)[]>([]);
  
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
          
          // Build speaker color map
          const speakerColorMap = new Map<string, string>();
          let colorIndex = 0;
          
          // Convert transcript blocks to session data format with block IDs
          const convertedData: SessionDataItem[] = data.transcription.blocks.map((block: TranscriptBlock) => {
            const speakerLabel = block.speaker_label || "A";
            
            // Assign color to speaker
            if (!speakerColorMap.has(speakerLabel)) {
              speakerColorMap.set(speakerLabel, speakerColors[colorIndex % speakerColors.length]);
              colorIndex++;
            }
            
            return {
              name: getSpeakerName(speakerLabel),
              time: formatTime(block.start_time_seconds),
              message: block.text,
              image: `/images/personImage${((speakerLabel.charCodeAt(0) - 64) % 4) + 1}.png`,
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
              primaryList: [{
                id: pt.id,
                value: pt.name,
                displayName: pt.displayName,
                instanceIndex: pt.instanceIndex,
                messageIndex: blockIdToIndex.get(pt.blockIds[0]) ?? -1,
                blockId: pt.blockIds[0],
                impressionId: pt.impressionId,
                comment: pt.comment,
                selectedText: pt.selectedText,
                selectionRange: pt.selectionRanges?.[0],
              }],
              allText: [pt.selectedText || ""],
              blockIds: pt.blockIds,
              selectionRanges: pt.selectionRanges,
            });
          });
        });
        
        setTags(loadedTags);
        
        // Set highlight texts to the actual selected texts (not full blocks)
        const allBlockIds = data.tagGroups.flatMap((g: DbTagGroup) => g.blockIds);
        const allTexts = loadedTags.flatMap((t) => t.allText);
        setHighlightedBlockIds(new Set(allBlockIds));
        setHighlightedTexts(allTexts);
      } else {
        // No tags in database, clear highlights
        setTags([]);
        setHighlightedBlockIds(new Set());
        setHighlightedTexts([]);
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
    const heights = leftRowRefs.current.map((el) => el?.offsetHeight || 0);
    setLeftRowHeights(heights);
  }, [pending, tags, displayItems]);

  // Only load from localStorage when NOT loading from database (no videoId)
  useEffect(() => {
    if (videoId) return; // Skip localStorage when we have a videoId (will load from DB)
    
    const saved = localStorage.getItem("selectedTags_v7");
    if (saved) {
      try {
        const parsed: TagItem[] = JSON.parse(saved);
        setTags(parsed || []);
        setHighlightedTexts(parsed.flatMap((t) => t.allText || []));
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
      x: e.pageX,
      y: e.pageY,
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


  const handleTextSelection = (messageIndex: number, blockId?: string) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();
    if (!text || !selection) return;

    const exists = pending.some((p) => p.messageIndex === messageIndex && p.text === text);
    if (exists) {
      window.getSelection()?.removeAllRanges();
      return;
    }

    // Calculate selection offsets within the block text
    let startOffset = 0;
    let endOffset = text.length;
    
    // Try to get the actual offsets from the selection range
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const blockElement = range.commonAncestorContainer.parentElement?.closest('[data-block-text]');
      
      if (blockElement) {
        const blockText = blockElement.getAttribute('data-block-text') || '';
        const selectedText = text;
        
        // Find the position of the selected text within the block
        // We need to reconstruct the position by walking through the text nodes
        const treeWalker = document.createTreeWalker(
          blockElement,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        let charCount = 0;
        let foundStart = false;
        let calculatedStart = 0;
        
        while (treeWalker.nextNode()) {
          const node = treeWalker.currentNode;
          
          if (node === range.startContainer) {
            calculatedStart = charCount + range.startOffset;
            foundStart = true;
          }
          
          if (node === range.endContainer && foundStart) {
            const calculatedEnd = charCount + range.endOffset;
            startOffset = calculatedStart;
            endOffset = calculatedEnd;
            break;
          }
          
          charCount += node.textContent?.length || 0;
        }
        
        // Fallback: find the first occurrence of selected text in block
        if (!foundStart && blockText) {
          const idx = blockText.indexOf(selectedText);
          if (idx !== -1) {
            startOffset = idx;
            endOffset = idx + selectedText.length;
          }
        }
      }
    }

    const selectionRange: SelectionRange | undefined = blockId ? {
      blockId,
      startOffset,
      endOffset,
    } : undefined;

    // Calculate vertical offset relative to the block element
    let verticalOffset = 0;
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const blockElement = document.querySelector(`[data-block-id="${blockId}"]`);
      if (blockElement) {
        const blockRect = blockElement.getBoundingClientRect();
        verticalOffset = rect.top - blockRect.top;
      }
    }

    const newEntry: PendingEntry = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      messageIndex,
      blockId, // Store block ID for database linking
      text,
      selectedText: text, // Store the exact selected text
      selectionRange, // Store the selection range for persistence
      primaryInput: "",
      primaryList: [],
      verticalOffset,
    };

    // If we are currently editing a specific Master Tag, pre-fill it and confirm it
    if (editingMasterName) {
      const activeMaster = tags.find(t => t.master === editingMasterName);
      if (activeMaster) {
        setMasterInput(activeMaster.master || "");
        setMasterConfirmed(true);
        setMasterComment(activeMaster.masterComment || "");
      }
    }

    setPending((prev) => [...prev, newEntry]);
    setHighlightedTexts((prev) => [...prev, text]);
    
    // Also track highlighted block IDs
    if (blockId) {
      setHighlightedBlockIds(prev => new Set([...prev, blockId]));
    }
    
    window.getSelection()?.removeAllRanges();
  };

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

  const handleSelectPrimaryInstance = (entryId: string, instance: { id: string; name: string; displayName: string }) => {
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

  const addSecondaryTag = (entryId: string, primaryIndex: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    setPending(prev => prev.map(p => {
      if (p.id !== entryId) return p;
      
      const newPrimaryList = [...p.primaryList];
      const primary = newPrimaryList[primaryIndex];
      if (primary) {
        newPrimaryList[primaryIndex] = {
          ...primary,
          secondaryTags: [...(primary.secondaryTags || []), { value: trimmed }]
        };
      }
      return { ...p, primaryList: newPrimaryList };
    }));

    setSecondaryInput(null);
  };

  const removeSecondaryTag = (entryId: string, primaryIndex: number, secondaryIndex: number) => {
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

    // Check if this Master Tag is closed and we are NOT in edit mode for it
    const existingMasterTag = tags.find(t => t.master?.toLowerCase() === trimmed.toLowerCase());
    if (existingMasterTag?.isClosed && editingMasterName !== existingMasterTag.master) {
      showToast(`Master Tag "${trimmed}" is closed. Enter "Edit Master" mode on the existing tag to add more primary tags.`, "error");
      return;
    }

    // Validation: Master Tag names must be unique within the same Section scope (including all Subsections).
    const firstPendingEntry = pending[0];
    if (firstPendingEntry && editingMasterName !== trimmed) {
      const currentScope = findSectionContext(firstPendingEntry.messageIndex);
      
      const isDuplicate = tags.some(tag => {
        if (!tag.master || tag.master.toLowerCase() !== trimmed.toLowerCase()) return false;
        
        // Find the scope of this existing tag
        const firstPrimary = tag.primaryList[0];
        if (!firstPrimary) return false;
        const tagScope = findSectionContext(firstPrimary.messageIndex);
        
        // ❌ Rule: A Master Tag name used anywhere within a Section or its Subsections cannot be reused again in that Section.
        if (currentScope.sectionId) {
          // We are inside a section. Check if the existing tag is in the SAME section.
          // This covers both tags directly in the section and tags in any of its subsections.
          return tagScope.sectionId === currentScope.sectionId;
        } else {
          // We are not in any section. Check if the existing tag is also not in any section.
          return !tagScope.sectionId;
        }
      });

      if (isDuplicate) {
        const scopeName = currentScope.sectionId ? 'Section' : 'untagged area';
        showToast(`Master Tag "${trimmed}" already exists in this ${scopeName}. Uniqueness is enforced across the Section and its Subsections.`, "error");
        return;
      }
    }

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
    const pendingBlockIds = pending.map(p => p.blockId).filter((id): id is string => !!id);
    const pendingTexts = pending.map(p => p.text);
    
    // Get block IDs and texts that are still in saved tags
    const taggedBlockIds = new Set(tags.flatMap(t => t.blockIds || []));
    const taggedTexts = new Set(tags.flatMap(t => t.allText || []));
    
    // Remove only the highlights that aren't in saved tags
    setHighlightedTexts(prev => prev.filter(t => taggedTexts.has(t) || !pendingTexts.includes(t)));
    setHighlightedBlockIds(prev => {
      const newSet = new Set(prev);
      pendingBlockIds.forEach(id => {
        if (!taggedBlockIds.has(id)) {
          newSet.delete(id);
        }
      });
      return newSet;
    });
    
    // Clear all pending entries and master state
    setPending([]);
    setMasterInput("");
    setMasterComment("");
    setMasterConfirmed(false);
    setMasterCancelled(true);
    setDbPrimaryTags([]); // Clear suggestions
  };

  const handleEditMaster = () => {
    setMasterConfirmed(false);
    setDbPrimaryTags([]); // Clear suggestions when editing master
    // Note: We keep the masterComment in state so if they add again, they can edit it
    // or we could clear it: setMasterComment(""); 
  };

  // ------------------------------------------------------------------
  // --- OVERALL SUBMIT ---
  // ------------------------------------------------------------------

  const handleOverallAdd = async () => {
    // Always clear editing mode when finishing
    setEditingMasterName(null);
    
    if (pending.length === 0) return;
    const entriesWithPrimaries = pending.filter((p) => p.primaryList.length > 0);

    if (entriesWithPrimaries.length === 0) return;

    const masterToApply = masterCancelled
      ? null
      : masterConfirmed
        ? masterInput.trim() || null
        : masterInput.trim() || null;

    // Collect all block IDs from pending entries
    const blockIds = entriesWithPrimaries
      .filter((p) => p.blockId)
      .map((p) => p.blockId!);

    // Collect all selection ranges for precise highlight persistence
    const selectionRanges: SelectionRange[] = entriesWithPrimaries
      .filter((p) => p.selectionRange)
      .map((p) => p.selectionRange!);

    // Combine all selected texts for the API
    const combinedSelectedText = entriesWithPrimaries.map((p) => p.selectedText).join(' ');

    const allPrimaries: PrimaryTagDetail[] = entriesWithPrimaries.flatMap((p) =>
      p.primaryList.map(val => ({
        id: val.id, // Database primary tag ID if reusing
        value: val.value,
        comment: val.comment,
        messageIndex: p.messageIndex,
        blockId: p.blockId,
        secondaryTags: val.secondaryTags, // Include secondary tags
        selectedText: p.selectedText, // Store selected text per primary
        selectionRange: p.selectionRange, // Store selection range per primary
      }))
    );

    const allTexts = entriesWithPrimaries.map((p) => p.selectedText);
    
    // Find section context for the first block (tags span the same context)
    const firstEntry = entriesWithPrimaries[0];
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
            masterTagDescription: masterComment || null,
            primaryTags: allPrimaries.map(p => ({
              id: p.id, // Send primary tag ID for reuse
              name: p.value,
              comment: p.comment,
              secondaryTags: p.secondaryTags?.map(s => s.value) || [], // Pass secondary tag names
              selectedText: p.selectedText, // The exact selected text
              selectionRange: p.selectionRange, // Character offsets within the block
              blockId: p.blockId, // Send specific block ID for this highlight
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

    // Use the first impression ID as the unique ID for this tag group
    // Create SEPARATE TagItems for DIFFERENT selections to allow independent positioning
    const newTags: TagItem[] = entriesWithPrimaries.map((p, pIdx) => {
      const savedImp = savedImpressions.find(imp => imp.primaryTagName === p.primaryList[0]?.value && imp.blockIds.includes(p.blockId!));
      const tagId = savedImp?.impressionId || Date.now().toString() + Math.random().toString(36).slice(2, 6) + pIdx;
      
      return {
        id: tagId,
        master: masterToApply,
        masterTagId: savedMasterTagId,
        masterComment: masterComment || undefined,
        masterColor: getMasterTagColor(savedMasterTagId || masterToApply || tagId),
        primaryList: p.primaryList.map(val => {
          const imp = savedImpressions.find(si => si.primaryTagName === val.value && si.blockIds.includes(p.blockId!));
          return {
            id: val.id,
            value: val.value,
            comment: val.comment,
            messageIndex: p.messageIndex,
            blockId: p.blockId,
            secondaryTags: val.secondaryTags,
            selectedText: p.selectedText,
            selectionRange: p.selectionRange,
            impressionId: imp?.impressionId,
            instanceIndex: imp?.instanceIndex,
            displayName: imp?.displayName,
          };
        }),
        allText: [p.selectedText],
        blockIds: [p.blockId!],
        selectionRanges: p.selectionRange ? [p.selectionRange] : [],
        verticalOffset: p.verticalOffset,
      };
    });

    setTags((prev) => [...prev, ...newTags]);
    setHighlightedTexts((prev) => [...prev, ...allTexts]);
    
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
    setEditingMasterName(null);
  };

  // Get selection ranges for a specific block from all tags
  const getSelectionRangesForBlock = useCallback((blockId: string): Array<{start: number; end: number}> => {
    const ranges: Array<{start: number; end: number}> = [];
    
    // Check pending entries
    pending.forEach(entry => {
      if (entry.selectionRange?.blockId === blockId) {
        ranges.push({
          start: entry.selectionRange.startOffset,
          end: entry.selectionRange.endOffset
        });
      }
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
      });
    });
    
    // Sort and merge overlapping ranges
    if (ranges.length === 0) return [];
    
    ranges.sort((a, b) => a.start - b.start);
    const merged: Array<{start: number; end: number}> = [];
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
             t.primaryList.some(p => p.selectionRange?.blockId === blockId && p.selectionRange?.startOffset === range.start))
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
                  className={`transition-all duration-200 ${
                    part.isHovered 
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
    
    // Fall back to text-based highlighting
    if (!highlightedTexts || highlightedTexts.length === 0) {
      return <>{text}</>;
    }

    const sorted = [...highlightedTexts]
      .sort((a, b) => b.length - a.length)
      .filter(Boolean);
    const escaped = sorted.map((h) =>
      h.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")
    );
    if (escaped.length === 0) return <>{text}</>;

    const regex = new RegExp(`(${escaped.join("|")})`, "gi");
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) =>
          sorted.some((h) => h.toLowerCase() === part.toLowerCase()) ? (
            <span key={i} className="bg-[#BFE8EB]">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }, [highlightedTexts, getSelectionRangesForBlock]);
  
  // Legacy function for backward compatibility (text-only highlighting)
  const highlightTextJSX = (text: string) => {
    return highlightTextWithRanges(text, undefined);
  };

  const startEditing = (id: string, type: 'master' | 'primary' | 'master_comment' | 'primary_comment' | 'pending_master_comment' | 'pending_primary_comment', currentValue: string, index: number | null = null) => {
    // Check if the master tag is in edit mode
    if (type === 'master' || type === 'primary' || type === 'master_comment' || type === 'primary_comment') {
      const tag = tags.find(t => t.id === id);
      if (editingMasterName !== tag?.master) {
        showToast("Enter Edit mode on the Master Tag first to make changes.", "info");
        return;
      }
    }
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
        // 2. Update local state
        setTags(prev => prev.map(t => t.id === id ? { ...t, master: trimmedVal } : t));
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
        setTags(prev => prev.map(t => t.id === id ? { ...t, masterComment: trimmedVal } : t));
      }
      else if (type === 'primary' && index !== null) {
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
      else if (type === 'pending_primary_comment' && index !== null) {
        setPending(prev => prev.map(p => {
          if (p.id !== id) return p;
          const newList = [...p.primaryList];
          newList[index] = { ...newList[index], comment: trimmedVal || undefined };
          return { ...p, primaryList: newList };
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
    if (editingMasterName !== tagToDelete?.master) {
      showToast("Enter Edit mode on the Master Tag first to delete it.", "info");
      return;
    }
    // Find all impression IDs for this master tag
    const impressionIds = tagToDelete?.primaryList
      .map(p => p.impressionId)
      .filter((id): id is string => !!id) || [];
    setDeleteState({ isOpen: true, type: 'master', tagId: id, impressionId: impressionIds.join(',') });
  };

  const initiateDeletePrimary = (tagId: string, index: number, impressionId?: string) => {
    const tag = tags.find(t => t.id === tagId);
    if (editingMasterName !== tag?.master) {
      showToast("Enter Edit mode on the Master Tag first to delete primary tags.", "info");
      return;
    }
    setDeleteState({ isOpen: true, type: 'primary', tagId: tagId, primaryIndex: index, impressionId });
  };

  const handleConfirmDelete = async () => {
    // Delete from database first
    if (deleteState.impressionId && transcriptId) {
      try {
        // For master tag deletion, there may be multiple impression IDs
        const impressionIds = deleteState.impressionId.split(',');
        for (const impId of impressionIds) {
          if (impId) {
            await fetch(`/api/tags/impressions?id=${impId}`, { method: 'DELETE' });
          }
        }
      } catch (error) {
        console.error("Failed to delete tag impression from database:", error);
      }
    }
    
    if (deleteState.type === 'master') {
      // Get the tag being deleted to extract its block IDs
      const deletedTag = tags.find(t => t.id === deleteState.tagId);
      const deletedBlockIds = new Set(deletedTag?.blockIds || []);
      const deletedTexts = new Set(deletedTag?.allText || []);
      
      const updatedTags: TagItem[] = tags.filter((t: TagItem) => t.id !== deleteState.tagId);
      setTags(updatedTags);
      
      // Recalculate highlighted texts - only keep texts that are still referenced by other tags
      const remainingTexts = updatedTags.flatMap(t => t.allText);
      setHighlightedTexts(remainingTexts);
      
      // Recalculate highlighted block IDs - only keep blocks that are still referenced by other tags
      const remainingBlockIds = new Set(updatedTags.flatMap(t => t.blockIds || []));
      setHighlightedBlockIds(remainingBlockIds);
    }
    else if (deleteState.type === 'primary' && typeof deleteState.primaryIndex === 'number') {
      const updatedTags: TagItem[] = tags.map((t: TagItem) => {
        if (t.id !== deleteState.tagId) return t;
        
        // Get the primary tag being deleted
        const deletedPrimary = t.primaryList[deleteState.primaryIndex!];
        const deletedBlockId = deletedPrimary?.blockId;
        
        // Filter out the deleted primary tag
        const newPrimaryList = t.primaryList.filter((_, idx) => idx !== deleteState.primaryIndex);
        
        // Update blockIds - remove the block if no other primary tags reference it
        const remainingBlockIds = newPrimaryList
          .map(p => p.blockId)
          .filter((id): id is string => !!id);
        
        return { 
          ...t, 
          primaryList: newPrimaryList,
          blockIds: [...new Set(remainingBlockIds)],
          allText: t.allText // Keep text for now, could also filter
        };
      });
      
      // Remove empty master tags (no primary tags left)
      const nonEmptyTags = updatedTags.filter(t => t.primaryList.length > 0);
      setTags(nonEmptyTags);
      
      // Recalculate highlights
      setHighlightedTexts(nonEmptyTags.flatMap(t => t.allText));
      setHighlightedBlockIds(new Set(nonEmptyTags.flatMap(t => t.blockIds || [])));
      }
      setDeleteState({ ...deleteState, isOpen: false });
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
      setHighlightedTexts(prev => prev.filter(t => t !== entry.text));
      
      // Remove the block ID from highlighted block IDs
      if (entry.blockId) {
        // Only remove if no other pending entries or tags reference this block
        const otherPendingWithBlock = pending.filter(p => p.id !== entryId && p.blockId === entry.blockId);
        const tagsWithBlock = tags.some(t => t.blockIds?.includes(entry.blockId!));
        
        if (otherPendingWithBlock.length === 0 && !tagsWithBlock) {
          setHighlightedBlockIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(entry.blockId!);
            return newSet;
          });
        }
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
          className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-slide-in ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' :
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
              className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                canAddSection 
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
              className={`w-full text-left px-4 py-2 flex items-center gap-3 transition-colors ${
                canAddSubsection 
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
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                    canClose 
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
        <header className="w-full h-[60px] bg-white border-b border-[#F0F0F0] flex items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-3">
            <Link href={videoId ? "/recordings" : "/"}>
              <img src="/icons/arrow-left.png" alt="Back" className="w-[24px] h-[24px] cursor-pointer" />
            </Link>
            <div className="flex flex-col">
              <h1 className="text-[24px] font-medium text-[#111827]">Sessions</h1>
              {loadedVideo && (
                isEditingSessionName ? (
                  <div className="flex items-center gap-1 -mt-1">
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
                      className="text-xs text-gray-700 px-2 py-0.5 border border-[#00A3AF] rounded focus:outline-none w-[200px]"
                      placeholder="Session name..."
                    />
                    <button 
                      onClick={saveSessionName}
                      className="p-0.5 bg-[#E0F7FA] rounded hover:bg-[#B2EBF2]"
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
                    className="flex items-center gap-1 text-xs text-gray-500 -mt-1 truncate max-w-[300px] hover:text-[#00A3AF] group"
                    title="Click to rename session"
                  >
                    <span className="truncate">{loadedVideo.fileName || 'Untitled Session'}</span>
                    <PencilIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  </button>
                )
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {loadingTranscript && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading transcript...
              </div>
            )}
            {pending.length > 0 && (
              <button
                onClick={handleOverallAdd}
                disabled={savingTags}
                className={`px-4 py-2 text-white rounded-lg shadow-sm text-sm transition-all duration-200 flex items-center gap-2 ${
                  savingTags 
                    ? 'bg-gray-400 cursor-not-allowed' 
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
                  'Close Master'
                )}
              </button>
            )}
          </div>
        </header>

        <div className="flex flex-1 overflow-y-auto">
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
                      className="w-4 h-4 rounded border-gray-300 text-[#00A3AF] focus:ring-[#00A3AF]"
                    />
                    Hide Untagged
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
                  className="relative h-[20px] mb-2 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
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
                        ref={(el) => { leftRowRefs.current[index] = el; }}
                        className="my-4 flex items-center gap-4 animate-fade-in group relative"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-300 rounded-full" />
                          <span className="text-[10px] text-gray-500 font-bold uppercase text-sm tracking-wider whitespace-nowrap">
                            END SECTION - {item.title || "Untitled"}
                          </span>
                        </div>
                        <div className="h-[1px] flex-1 bg-gray-300 border-dashed border-t"></div>
                      </div>
                      {/* Show + button after section close - hide when filtering */}
                      {!isFiltered && (
                        <div
                          className="absolute bottom-[-10px] left-0 w-full h-[20px] z-10 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
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
                        ref={(el) => { leftRowRefs.current[index] = el; }}
                        className="my-4 flex items-center gap-4 animate-fade-in group relative ml-4"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 bg-amber-300 rounded-full" />
                          <span className="text-[10px] text-amber-500 font-bold uppercase text-sm tracking-wider whitespace-nowrap">
                            END SUB SECTION - {item.title || "Untitled"}
                          </span>
                        </div>
                        <div className="h-[1px] flex-1 bg-amber-100 border-dashed border-t"></div>
                      </div>
                      {/* Show + button after subsection close - hide when filtering */}
                      {!isFiltered && (
                        <div
                          className="absolute bottom-[-10px] left-0 w-full h-[20px] z-10 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
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
                      ref={(el) => { leftRowRefs.current[index] = el; }}
                      className={`my-4 flex items-center gap-4 animate-fade-in group relative ${item.isClosed ? 'opacity-75' : ''}`}
                    >
                      {item.isEditing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#00A3AF] font-bold uppercase text-sm tracking-wider whitespace-nowrap">SECTION - </span>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Enter name"
                            className="border-b border-[#00A3AF] focus:outline-none text-sm text-gray-700 min-w-[150px]"
                            value={item.title || ""}
                            onChange={(e) => updateSectionTitle(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveSectionTitle(item.id);
                            }}
                            onBlur={() => saveSectionTitle(item.id)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#00A3AF] font-bold uppercase text-sm tracking-wider whitespace-nowrap flex items-center gap-1">
                            {isOpen && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" title="Open section" />}
                            {item.isClosed && <span className="w-2 h-2 bg-gray-400 rounded-full" title="Closed section" />}
                            SECTION - {item.title || "Untitled"}
                            {item.isClosed && <span className="text-[8px] text-gray-400 ml-1">(closed)</span>}
                          </span>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => toggleSectionEdit(item.id)} className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <PencilIcon className="w-3 h-3 text-gray-400" />
                            </button>
                            <button onClick={() => deleteDisplayItem(item.id)} className="p-1 hover:bg-red-50 rounded ml-1" title="Delete">
                              <TrashIcon className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className={`h-[2px] flex-1 rounded-full ${item.isClosed ? 'bg-gray-300' : 'bg-[#00A3AF]'}`}></div>
                    </div>
                  );
                }

                if (item.type === 'subsection') {
                  const isOpen = !item.isClosed;
                  return (
                    <div
                      key={item.id}
                      ref={(el) => { leftRowRefs.current[index] = el; }}
                      className={`my-4 flex items-center gap-4 animate-fade-in group relative ml-4 ${item.isClosed ? 'opacity-75' : ''}`}
                    >
                      {item.isEditing ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-600 font-bold uppercase text-sm tracking-wider whitespace-nowrap">SUB SECTION - </span>
                          <input
                            autoFocus
                            type="text"
                            placeholder="Enter name"
                            className="border-b border-amber-500 focus:outline-none text-sm text-gray-700 min-w-[150px]"
                            value={item.title || ""}
                            onChange={(e) => updateSectionTitle(item.id, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveSectionTitle(item.id);
                            }}
                            onBlur={() => saveSectionTitle(item.id)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-amber-600 font-bold uppercase text-sm tracking-wider whitespace-nowrap flex items-center gap-1">
                            {isOpen && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" title="Open subsection" />}
                            {item.isClosed && <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" title="Closed subsection" />}
                            SUB SECTION - {item.title || "Untitled"}
                            {item.isClosed && <span className="text-[8px] text-gray-400 ml-1">(closed)</span>}
                          </span>
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => toggleSectionEdit(item.id)} className="p-1 hover:bg-gray-100 rounded" title="Edit">
                              <PencilIcon className="w-3 h-3 text-gray-400" />
                            </button>
                            <button onClick={() => deleteDisplayItem(item.id)} className="p-1 hover:bg-red-50 rounded ml-1" title="Delete">
                              <TrashIcon className="w-3 h-3 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className={`h-[1px] flex-1 rounded-full ${item.isClosed ? 'bg-gray-200' : 'bg-amber-400'}`}></div>
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
                        leftRowRefs.current[originalIndex] = el;
                        // Also store ref for block-based scrolling
                        if (blockId && el) {
                          blockRefs.current.set(blockId, el);
                        }
                      }}
                      className={`mb-5 cursor-context-menu transition-all duration-200 rounded-lg ${
                        isHoveredFromTag 
                          ? 'ring-2 ring-amber-400 bg-amber-50 scale-[1.01] shadow-lg' 
                          : isHighlighted 
                            ? 'ring-2 ring-[#00A3AF]/30 bg-[#00A3AF]/5' 
                            : ''
                      }`}
                      onMouseUp={() => handleTextSelection(dataIndex, blockId)}
                      onContextMenu={(e) => !isFiltered && handleContextMenu(e, originalIndex, dataIndex)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <img src={data.image} alt={data.name} className="w-[26px] h-[26px] rounded-full" />
                        <span className="font-semibold text-sm">{data.name}</span>
                        <span className="ml-auto flex items-center gap-1">
                          <img src="/icons/clock-1.png" alt="Clock" className="w-[14px] h-[14px]" />
                          <span className="text-gray-400 text-xs">{data.time}</span>
                        </span>
                      </div>
                      <div className="rounded-[10px] p-[12px]">
                        <p 
                          className="text-sm leading-relaxed text-gray-600 text-justify"
                          data-block-text={data.message}
                        >
                          {highlightTextWithRanges(data.message, blockId)}
                        </p>
                      </div>
                    </div>
                    {/* Show + button between items - hide when filtering */}
                    {!isFiltered && (
                      <div
                        className="absolute bottom-[-10px] left-0 w-full h-[20px] z-10 flex items-center justify-center opacity-0 hover:opacity-100 cursor-pointer transition-opacity duration-200"
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
          <div className="w-[420px] border-l border-gray-200 p-6 flex flex-col overflow-y-visible" ref={rightListRef}>
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
              <div className="relative">
                {displayItems.map((item, index) => {
                    const LANE_WIDTH = 12;

                    if (item.type !== 'data') {
                      // Collect all active master names that should pass through this section spacer
                      const activeMasterNames = Object.entries(masterTagMetadata)
                        .filter(([_, meta]) => index >= meta.firstItemIndex && index <= meta.lastItemIndex)
                        .map(([name, _]) => name);

                      // Section/Subsection spacer
                      return (
                        <div
                          key={item.id}
                          style={{ minHeight: leftRowHeights[index] || 48 }}
                          className="w-full py-2 relative"
                        >
                          {/* Show section indicator in right panel */}
                          {item.type === 'section' && (
                            <div className="flex items-center gap-2 px-2 py-1">
                              <div className="w-2 h-2 rounded-full bg-[#00A3AF]" />
                              <span className="text-xs font-semibold text-[#00A3AF] uppercase tracking-wider">
                                {item.title || 'Section'}
                              </span>
                              <div className="flex-1 h-px bg-[#00A3AF]/30" />
                            </div>
                          )}
                          {item.type === 'subsection' && (
                            <div className="flex items-center gap-2 px-2 py-1 ml-4">
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

                    const dataIndex = item.originalIndex!;
                    const entry = pending.find((p) => p.messageIndex === dataIndex);
                    
                    // Collect all tags for this row
                    const tagsForThisRow = tags.filter(tag => {
                      const indices = tag.primaryList.map(p => p.messageIndex);
                      const startRow = Math.min(...indices);
                      const endRow = Math.max(...indices);
                      return dataIndex >= startRow && dataIndex <= endRow;
                    });

                    const activeMasterNames = Object.entries(masterTagMetadata)
                      .filter(([_, meta]) => index >= meta.firstItemIndex && index <= meta.lastItemIndex)
                      .map(([name, _]) => name);

                    return (
                      <div
                        key={item.id}
                        className="relative pl-16" // Room for tree lines
                        style={{ minHeight: leftRowHeights[index] || 'auto' }}
                      >
                        {/* Tag List */}
                        <div className="relative w-full h-full flex flex-col gap-2 pb-4">
                          {tagsForThisRow.map((tag, tagIdx) => {
                            const meta = masterTagMetadata[tag.master || 'No Master'];
                            const masterLaneLeft = (meta?.uniqueIndex || 0) * LANE_WIDTH + 12;
                            
                            const rowPrimaries = tag.primaryList
                              .map((p, i) => ({ ...p, originalIndex: i }))
                              .filter(p => p.messageIndex === dataIndex);
                            
                            // Only show master header if this is the ABSOLUTE first time this name appears in the sidebar
                            const isFirstRowForTag = index === meta?.firstItemIndex;
                            // And only for the first tag instance that has this name
                            const isFirstInstance = tag.id === meta?.id || tags.find(t => t.master === tag.master)?.id === tag.id;
                            const shouldShowHeader = isFirstRowForTag && isFirstInstance;

                            const tagColor = tag.masterColor || getMasterTagColor(tag.masterTagId || tag.id || tag.master || '');
                            
                            if (rowPrimaries.length === 0 && !shouldShowHeader) return null;

                            return (
                              <div key={`${tag.id}-row-${dataIndex}`} className="relative w-full">
                                {/* Primary Tags - First one attached to Master if shouldShowHeader is true */}
                                {rowPrimaries.map((p, i) => {
                                  const isFirstOfAll = shouldShowHeader && i === 0;
                                  const displayText = p.value; // Show only the name, not the instance numbering

                                  return (
                                    <div 
                                      key={p.impressionId || `${p.value}-${i}`} 
                                      className={`relative mt-1 mb-2 ${isFirstOfAll ? 'ml-0' : 'ml-6'}`}
                                      data-spine-item={tag.master}
                                      data-is-root={isFirstOfAll}
                                    >
                                      {/* Vertical Spine - Anchored to Root Card Context */}
                                      {isFirstOfAll && spineOffsets[tag.master!] && (
                                        <div 
                                          className="absolute w-[1.5px] transition-all duration-300 pointer-events-none z-0"
                                          style={{ 
                                            left: `-${64 - masterLaneLeft}px`, 
                                            top: '18px',
                                            height: `${spineOffsets[tag.master!].height}px`,
                                            backgroundColor: tagColor,
                                            opacity: 0.4
                                          }}
                                        />
                                      )}
                                      
                                      {/* Horizontal Stem from Master Lane */}
                                      <div 
                                        className="absolute h-[1.5px] pointer-events-none"
                                        style={{ 
                                          left: isFirstOfAll ? `-${64 - masterLaneLeft}px` : `-${24 + (64 - masterLaneLeft)}px`, 
                                          width: isFirstOfAll ? `${64 - masterLaneLeft}px` : `${24 + (64 - masterLaneLeft)}px`, 
                                          top: isFirstOfAll ? '18px' : '18px', 
                                          backgroundColor: tagColor, 
                                          opacity: 0.4 
                                        }}
                                      />
                                      
                                      <div 
                                        className={`bg-white rounded-lg border shadow-sm overflow-hidden cursor-pointer group/item transition-all ${
                                          hoveredTagId === tag.id
                                            ? 'z-30 scale-[1.02] shadow-md'
                                            : editingMasterName === tag.master 
                                              ? 'border-blue-200 ring-1 ring-blue-100 bg-blue-50/5' 
                                              : 'border-gray-100 hover:border-gray-200'
                                        }`} 
                                        style={{ 
                                          borderLeftColor: tagColor, 
                                          borderLeftWidth: isFirstOfAll ? '4px' : '2px',
                                          borderColor: hoveredTagId === tag.id ? tagColor : undefined,
                                          boxShadow: hoveredTagId === tag.id ? `0 0 0 3px ${tagColor}44` : undefined
                                        }}
                                        onMouseEnter={() => handleTagHover(tag.id, tag.blockIds || [])}
                                        onMouseLeave={() => handleTagHover(null)}
                                        onClick={() => scrollToTagBlock(tag.blockIds || [])}
                                      >
                                        {/* Master Header - Integrated into the first primary tag card */}
                                        {isFirstOfAll && (
                                          <div className="px-3 py-1.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="text-[11px] font-black uppercase tracking-wider opacity-70" style={{ color: tagColor }}>
                                                {tag.master || "No Master"}
                                              </span>
                                              {tag.isClosed && (
                                                <span className="text-[9px] text-gray-500 bg-gray-100 px-1 py-0.5 rounded border border-gray-200 uppercase font-bold">
                                                  Closed
                                                </span>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                              {editingMasterName !== tag.master ? (
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); setEditingMasterName(tag.master); }} 
                                                  className="text-[9px] px-1.5 py-0.5 bg-[#00A3AF] text-white rounded hover:bg-[#008c96] font-bold uppercase"
                                                >
                                                  Edit Master
                                                </button>
                                              ) : (
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); setEditingMasterName(null); }} 
                                                  className="text-[9px] px-1.5 py-0.5 bg-gray-500 text-white rounded font-bold uppercase"
                                                >
                                                  Exit
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        <div className="p-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: tagColor }} />
                                              <span className={`text-xs font-semibold text-gray-700 truncate ${isFirstOfAll ? 'text-sm' : ''}`}>
                                                {displayText}
                                              </span>
                                            </div>
                                            
                                            <div className="flex items-center gap-1">
                                              {editingMasterName === tag.master ? (
                                                <>
                                                  <button onClick={(e) => { e.stopPropagation(); startEditing(tag.id, 'primary', p.value, p.originalIndex); }} className="p-0.5 hover:bg-gray-200 rounded text-gray-400">
                                                    <PencilIcon className="w-3 h-3" />
                                                  </button>
                                                  <button onClick={(e) => { e.stopPropagation(); initiateDeletePrimary(tag.id, p.originalIndex, p.impressionId); }} className="p-0.5 hover:bg-red-50 rounded text-red-300">
                                                    <TrashIcon className="w-3 h-3" />
                                                  </button>
                                                </>
                                              ) : (
                                                !isFirstOfAll && (
                                                  <button 
                                                    onClick={(e) => { e.stopPropagation(); setEditingMasterName(tag.master); }} 
                                                    className="text-[10px] text-[#00A3AF] opacity-0 group-hover/item:opacity-100 transition-opacity hover:underline font-bold"
                                                  >
                                                    Edit
                                                  </button>
                                                )
                                              )}
                                            </div>
                                          </div>

                                          {p.selectedText && (
                                            <p className="text-[10px] text-gray-400 italic mt-1 line-clamp-1 border-l border-gray-200 pl-2 ml-1">
                                              "{p.selectedText}"
                                            </p>
                                          )}

                                          {/* Secondary Tags (Double Indented) */}
                                          {p.secondaryTags && p.secondaryTags.length > 0 && (
                                            <div className="mt-2 ml-4 space-y-1 relative">
                                              <div className="absolute left-[-10px] top-0 bottom-2 w-[1px] bg-purple-200" />
                                              {p.secondaryTags.map((sec, secIdx) => (
                                                <div key={secIdx} className="relative flex items-center gap-2">
                                                  <div className="absolute left-[-10px] top-1/2 w-2 h-[1px] bg-purple-200" />
                                                  <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100">
                                                    {sec.value}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>

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
                                      placeholder="Master (optional)"
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
                                  <button onClick={handleMasterAddClick} className="px-3 py-2 bg-[#00A3AF] text-white rounded-lg text-sm font-medium">Add</button>
                                  <button onClick={handleMasterCancelAction} className="px-3 py-2 border text-gray-600 rounded-lg text-sm bg-white hover:bg-gray-50">Cancel</button>
                                </div>
                              </div>
                            )}

                          {/* --- CONFIRMED MASTER DISPLAY --- */}
                          {pending[0]?.id === entry.id && masterConfirmed && !masterCancelled && (
                            <div className="flex items-center justify-between bg-[#F0FDFA] px-3 py-2 rounded border border-[#CCFBF1] mb-2">
                              <div className="flex items-center gap-2 flex-1">
                                <div className="text-sm font-bold text-[#0F766E]">{masterInput || "Master (empty)"}</div>
                                
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
                              <button onClick={handleEditMaster} className="text-xs text-gray-500 hover:text-[#0F766E] ml-2">Edit</button>
                            </div>
                          )}

                          {!entry.primaryInputClosed && (
                            <div className="flex flex-col w-full relative">
                              <div className="flex items-center gap-2 w-full">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    placeholder={`Primary tag...`}
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
                                <button onClick={() => handleInitiateAddPrimary(entry.id)} className="px-3 py-2 bg-[#00A3AF] text-white rounded-lg text-sm font-medium">Add</button>
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

                                      <div className="flex flex-col flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-100">{p.value}</span>
                                          
                                          {editingItem.id === entry.id && editingItem.type === 'pending_primary_comment' && editingItem.index === pIndex ? (
                                            <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                                              <input
                                                autoFocus
                                                type="text"
                                                placeholder="Add comment..."
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
                                            <div className="flex items-center gap-1">
                                              <button 
                                                onClick={() => startEditing(entry.id, 'pending_primary_comment', p.comment || "", pIndex)}
                                                className="p-1 hover:bg-gray-100 rounded"
                                              >
                                                <ChatBubbleBottomCenterTextIcon 
                                                  className={`w-3.5 h-3.5 cursor-pointer ${p.comment ? 'text-[#00A3AF]' : 'text-gray-300'}`} 
                                                />
                                              </button>
                                              
                                              {/* Add Secondary Tag Button */}
                                              <button 
                                                onClick={() => toggleSecondaryInput(entry.id, pIndex)}
                                                className="text-[10px] text-[#00A3AF] hover:text-[#008C97] font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Add secondary tag"
                                              >
                                                + Secondary
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                        {p.comment && !(editingItem.id === entry.id && editingItem.type === 'pending_primary_comment' && editingItem.index === pIndex) && (
                                          <span className="text-[10px] text-gray-400 mt-0.5 ml-1 italic truncate max-w-[150px]">"{p.comment}"</span>
                                        )}
                                      </div>

                                      <button onClick={() => handleDeletePendingPrimary(entry.id, pIndex)} className="text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                                        <TrashIcon className="w-4 h-4" />
                                      </button>
                                    </div>

                                    {/* Secondary Tags */}
                                    {p.secondaryTags && p.secondaryTags.length > 0 && (
                                      <div className="ml-10 mt-2 space-y-1">
                                        {p.secondaryTags.map((sec, sIndex) => (
                                          <div key={sIndex} className="flex items-center gap-2 text-xs group/sec">
                                            <span className="w-1.5 h-1.5 bg-purple-400 rounded-full"></span>
                                            <span className="text-gray-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{sec.value}</span>
                                            <button 
                                              onClick={() => removeSecondaryTag(entry.id, pIndex, sIndex)}
                                              className="text-red-400 opacity-0 group-hover/sec:opacity-100 transition-opacity"
                                            >
                                              <XMarkIcon className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}

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
                                          className="text-[10px] bg-purple-500 text-white px-2 py-1 rounded hover:bg-purple-600"
                                        >
                                          Add
                                        </button>
                                        <button
                                          onClick={() => setSecondaryInput(null)}
                                          className="text-gray-400 hover:text-gray-600"
                                        >
                                          <XMarkIcon className="w-4 h-4" />
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
      </main>
    </div>
  );
}
