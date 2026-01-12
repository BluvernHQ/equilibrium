"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockClosedIcon, LockOpenIcon, TrashIcon, ExclamationCircleIcon, ArrowRightIcon, QuestionMarkCircleIcon } from "@heroicons/react/24/solid";
import KeyboardShortcutsModal from "../components/keyboard-shortcuts-modal";
import SpeakersCarousel, { Speaker } from "../components/speakers-carousel";
import SessionVideoPlayer from "../components/session-video-player";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";

// Icons
import MicrophoneIcon from "../../../../public/icons/spk-icon.png";
import UserIcon from "../../../../public/icons/profile-circle.png";
import ClockIcon from "../../../../public/icons/clock-1.png";

export type SegmentState = 'inaudible' | 'overlapping' | 'no_conversation' | 'unknown' | null;

export interface TranscriptSegment {
  id: string;
  selectedSpeakerId: string | null;
  state: SegmentState;
  timestamp: string | null;
  content: string;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  status: 'draft' | 'committed';
  lastSavedAt?: number;
  createdAt: number;
}

interface ManualTranscriptionProps {
  audioUrl?: string;
  initialTranscript?: TranscriptSegment[];
  initialSpeakers?: Speaker[];
}

export default function ManualTranscription({ audioUrl, initialTranscript, initialSpeakers }: ManualTranscriptionProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mediaUrl: sessionMediaUrl, videoId, spacesUrl, setVideoUrl } = useSession();

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const parseTimeToSeconds = (timeStr: string | null) => {
    if (!timeStr || timeStr === "--:--") return 0;
    const parts = timeStr.split(":");
    if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return (minutes * 60) + seconds;
  };

  // Load transcription if videoId is in URL but not in state (on refresh)
  useEffect(() => {
    const videoIdParam = searchParams.get('videoId');
    if (videoIdParam && !videoId) {
      // Find the video URL for this ID to restore session
      fetch(`/api/videos/metadata/${videoIdParam}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.video && (data.video.fileUrl || data.video.source_url)) {
            setVideoUrl(data.video.fileUrl || data.video.source_url, videoIdParam);
          }
        })
        .catch(err => console.error("Failed to restore session on refresh:", err));
    }
  }, [videoId, searchParams, setVideoUrl]);

  // Update URL with videoId when available to support refresh
  useEffect(() => {
    if (videoId && typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.get('videoId') !== videoId) {
        currentUrl.searchParams.set('videoId', videoId);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }
  }, [videoId]);
  const [isGlobalSaved, setIsGlobalSaved] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [speakerCreationTriggerSegmentId, setSpeakerCreationTriggerSegmentId] = useState<string | null>(null);
  const [showNavigationAfterSave, setShowNavigationAfterSave] = useState(false);
  const [savedVideoId, setSavedVideoId] = useState<string | null>(null);

  // Strict Behavioral States
  const [playbackMode, setPlaybackMode] = useState<'locked' | 'unlocked'>('locked');
  const [speakerSelectionDeadline, setSpeakerSelectionDeadline] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [snackbar, setSnackbar] = useState({ show: false, message: "" });
  const snackbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Use uploaded video from session if available, otherwise use prop or default
  const mediaUrl = sessionMediaUrl || audioUrl || "/videos/manual-transcription-video.mp4";

  // Initial State
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([
    {
      id: "seg-1",
      selectedSpeakerId: null,
      state: null,
      timestamp: "00:00",
      content: "",
      status: 'draft',
      startTimeSeconds: 0,
      createdAt: Date.now()
    },
  ]);

  // Keyboard shortcuts for media player
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // We use Shift as a modifier to avoid conflicts with typing
      if (!e.shiftKey) return;

      const video = videoRef.current;
      if (!video) return;

      // Behavioral Laws Check
      const now = Date.now();
      const activeSegment = segments.find(s => {
        const start = s.startTimeSeconds || 0;
        const end = s.endTimeSeconds || (start + 10000);
        return video.currentTime >= start && video.currentTime <= end;
      }) || segments.find(s => s.status === 'draft') || segments[segments.length - 1];

      const isAssigned = activeSegment ? (!!activeSegment.selectedSpeakerId || !!activeSegment.state) : false;
      const isDeadlinePassed = activeSegment ? (now - activeSegment.createdAt > 10000) : false;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          if (video.paused) {
            // Prerequisite Laws
            if (speakers.length === 0) {
              showSnackbar("Prerequisite: Add at least one speaker to begin transcription");
              return;
            }
            if (!isAssigned && isDeadlinePassed) {
              showSnackbar("Playback paused: Select a speaker or state to continue");
              return;
            }
            video.play().catch(console.error);
            setIsVideoPlaying(true);
          } else {
            video.pause();
            setIsVideoPlaying(false);
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (playbackMode === 'locked' && !isAssigned) {
            const MAX_FORWARD_WINDOW = 10;
            const blockStart = activeSegment?.startTimeSeconds || 0;
            const targetTime = Math.min(video.duration, video.currentTime + 5);
            if (targetTime > blockStart + MAX_FORWARD_WINDOW) {
              video.currentTime = blockStart + MAX_FORWARD_WINDOW;
              showSnackbar("Restriction: Complete speaker selection to continue forward");
              return;
            }
          }
          video.currentTime = Math.min(video.duration, video.currentTime + 5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (playbackMode === 'locked') {
            const blockStart = activeSegment?.startTimeSeconds || 0;
            const targetTime = Math.max(0, video.currentTime - 5);
            if (targetTime < blockStart) {
              video.currentTime = blockStart;
              showSnackbar("Rewind limited to current block. Use 'Unlock Video' for full exploration.");
              return;
            }
          }
          video.currentTime = Math.max(0, video.currentTime - 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          setPlaybackSpeed(prev => {
            const newSpeed = Math.min(3, prev + 0.5);
            video.playbackRate = newSpeed;
            return newSpeed;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setPlaybackSpeed(prev => {
            const newSpeed = Math.max(0.5, prev - 0.5);
            video.playbackRate = newSpeed;
            return newSpeed;
          });
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVideoPlaying, segments, speakers.length, playbackMode, playbackSpeed]);

  // Show snackbar helper
  const showSnackbar = (message: string) => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
    }
    setSnackbar({ show: true, message });
    snackbarTimeoutRef.current = setTimeout(() => {
      setSnackbar({ show: false, message: "" });
    }, 2000);
  };

  // Hydrate from props if available
  useEffect(() => {
    if (initialSpeakers && initialSpeakers.length > 0) {
      setSpeakers(initialSpeakers);
    }
  }, [initialSpeakers]);

  // Recovery Logic: Load from LocalStorage or Server
  useEffect(() => {
    if (!videoId) return;

    const restoreSession = async () => {
      // 1. Try Local Storage first (MANDATORY)
      const localDraft = localStorage.getItem(`transcript:${videoId}`);
      if (localDraft) {
        try {
          const parsed = JSON.parse(localDraft);
          if (parsed.segments && parsed.segments.length > 0) {
            console.log("Restoring session from local storage");
            // Ensure createdAt exists for all segments
            const hydratedSegments = parsed.segments.map((s: any) => ({
              ...s,
              createdAt: s.createdAt || Date.now()
            }));
            setSegments(hydratedSegments);
            if (parsed.speakers) setSpeakers(parsed.speakers);
            return; // Successfully restored from local
          }
        } catch (e) {
          console.error("Failed to parse local draft:", e);
        }
      }

      // 2. Fallback to Server if no local draft
      if (initialTranscript && initialTranscript.length > 0) {
        setSegments(initialTranscript.map(s => ({ ...s, createdAt: s.createdAt || Date.now() })));
      } else if (videoId) {
        // If no local draft and no initial props, try fetching from server (e.g. on refresh)
        try {
          const response = await fetch(`/api/transcriptions/load/${videoId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.transcription && data.transcription.blocks) {
              const converted: TranscriptSegment[] = data.transcription.blocks.map((block: any) => ({
                id: block.id,
                selectedSpeakerId: data.speakers?.find((s: any) => s.speaker_label === block.speaker_label || s.name === block.speaker_label)?.id || null,
                state: null, // Default to null for server loads
                timestamp: formatTime(block.start_time_seconds),
                content: block.text,
                startTimeSeconds: block.start_time_seconds,
                endTimeSeconds: block.end_time_seconds,
                status: 'committed',
                createdAt: Date.now()
              }));
              setSegments(converted);

              if (data.speakers) {
                const convertedSpeakers: Speaker[] = data.speakers.map((s: any) => ({
                  id: s.id,
                  name: s.name,
                  shortName: s.name.length > 10 ? s.name.substring(0, 8) + "..." : s.name,
                  avatar: s.avatar_url || "",
                  isDefault: false,
                  role: s.is_moderator ? "coordinator" : "speaker"
                }));
                setSpeakers(convertedSpeakers);
              }
            }
          }
        } catch (err) {
          console.error("Failed to load transcript from server:", err);
        }
      }
    };

    restoreSession();
  }, [videoId, initialTranscript]);

  // Mandatory Selection Monitor (10s Timeout & Forward Restriction)
  useEffect(() => {
    if (!isVideoPlaying || playbackMode === 'unlocked' || isGlobalSaved) {
      setSpeakerSelectionDeadline(null);
      return;
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const video = videoRef.current;
      if (!video) return;

      // 1. Initial Speaker Prerequisite check (at least one speaker must exist)
      if (speakers.length === 0) {
        if (!video.paused) {
          video.pause();
          setIsVideoPlaying(false);
          showSnackbar("Prerequisite: Add at least one speaker to begin transcription");
        }
        return;
      }

      // Find the segment the video is currently in
      const currentTime = video.currentTime;
      const activeSegment = segments.find(s => {
        const start = s.startTimeSeconds || 0;
        const end = s.endTimeSeconds || (start + 10000); // effectively infinite if not set
        return currentTime >= start && currentTime <= end;
      }) || segments.find(s => s.status === 'draft') || segments[segments.length - 1];

      if (!activeSegment) return;

      const isAssigned = !!activeSegment.selectedSpeakerId || !!activeSegment.state;
      const timeSinceCreation = now - activeSegment.createdAt;

      // 2. 10-Second Selection Rule (Only for the active block)
      if (!isAssigned) {
        const remaining = Math.max(0, 10000 - timeSinceCreation);
        setSpeakerSelectionDeadline(now + remaining);

        if (remaining === 0 && !video.paused) {
          video.pause();
          setIsVideoPlaying(false);
          showSnackbar("Playback paused: Select a speaker or state to continue");

          // Focus the unassigned segment for convenience
          const element = document.querySelector(`[data-segment-id="${activeSegment.id}"] textarea`) as HTMLTextAreaElement;
          if (element) element.focus();
        }
      } else {
        setSpeakerSelectionDeadline(null);
      }

      // 3. Forward Playback Restriction (Prevent skipping ahead of the current unassigned block)
      const MAX_FORWARD_WINDOW = 10;
      const currentBlockStart = activeSegment.startTimeSeconds || 0;

      if (!isAssigned && currentTime > currentBlockStart + MAX_FORWARD_WINDOW) {
        video.currentTime = currentBlockStart + MAX_FORWARD_WINDOW;
        if (!video.paused) {
          video.pause();
          setIsVideoPlaying(false);
          showSnackbar("Restriction: Complete speaker selection to continue forward");
        }
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [segments, isVideoPlaying, playbackMode, speakers.length, isGlobalSaved]);

  // Behavioral Laws Enforcement (Seeking Logic)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || playbackMode === 'unlocked' || isGlobalSaved) return;

    const handleSeeking = () => {
      const currentTime = video.currentTime;
      // Find the segment the video is currently in or the active draft
      const activeSegment = segments.find(s => {
        const start = s.startTimeSeconds || 0;
        const end = s.endTimeSeconds || (start + 10000);
        return currentTime >= start && currentTime <= end;
      }) || segments.find(s => s.status === 'draft') || segments[segments.length - 1];

      if (!activeSegment) return;

      const blockStart = activeSegment.startTimeSeconds || 0;
      const isAssigned = !!activeSegment.selectedSpeakerId || !!activeSegment.state;
      const MAX_FORWARD_WINDOW = 10;

      // 1. Rewind Restriction
      if (currentTime < blockStart) {
        video.currentTime = blockStart;
        showSnackbar("Rewind limited to current block. Use 'Unlock Video' for full exploration.");
      }

      // 2. Forward Restriction
      if (!isAssigned && currentTime > blockStart + MAX_FORWARD_WINDOW) {
        video.currentTime = blockStart + MAX_FORWARD_WINDOW;
        showSnackbar("Restriction: Complete speaker selection to continue forward");
      }
    };

    video.addEventListener('seeking', handleSeeking);
    return () => video.removeEventListener('seeking', handleSeeking);
  }, [segments, playbackMode, isGlobalSaved]);

  const togglePlaybackMode = () => {
    if (playbackMode === 'locked') {
      setPlaybackMode('unlocked');
      setIsVideoPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      showSnackbar("Unlock Mode Active: Scrubbing enabled, transcription disabled");
    } else {
      setPlaybackMode('locked');
      const activeSegment = segments.find(s => s.status === 'draft');
      if (activeSegment && videoRef.current) {
        videoRef.current.currentTime = activeSegment.startTimeSeconds || 0;
      }
      showSnackbar("Locked Mode Active: Snapped back to current block");
    }
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSpacerRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  const handleHorizontalScroll = (e: React.WheelEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const maxScroll = container.scrollWidth - container.clientWidth;

    // 1. If content doesn't overflow, don't do anything
    if (maxScroll <= 0) return;

    // 2. Initialize target to current position if we aren't currently animating
    if (animationFrameRef.current === null) {
      scrollTargetRef.current = container.scrollLeft;
    }

    // 3. Update the Target Position based on Wheel input
    // Multiplier (1.5) controls the "distance" per scroll tick. Increase for faster scrolling.
    scrollTargetRef.current += e.deltaY * 1.5;

    // 4. Clamp the target so it doesn't go beyond bounds
    scrollTargetRef.current = Math.max(0, Math.min(scrollTargetRef.current, maxScroll));

    // 5. The Animation Loop (Physics)
    const smoothScrollLoop = () => {
      if (!container) return;

      // Calculate distance to target
      const diff = scrollTargetRef.current - container.scrollLeft;

      // If we are close enough, snap to target and stop animation
      if (Math.abs(diff) < 1) {
        container.scrollLeft = scrollTargetRef.current;
        animationFrameRef.current = null; // Stop loop
      } else {
        // Move 10% (0.1) of the distance per frame. 
        // Lower 0.1 to 0.05 for "heavier/smoother" feel, raise to 0.2 for "snappier" feel.
        container.scrollLeft += diff * 0.1;
        animationFrameRef.current = requestAnimationFrame(smoothScrollLoop);
      }
    };

    // 6. Start the loop if it's not running
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(smoothScrollLoop);
    }
  };

  // Helper to scroll to bottom manually
  const scrollToBottom = () => {
    if (bottomSpacerRef.current) {
      bottomSpacerRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Removed automatic scroll effect to prevent jumping on load/tab switch

  // --- 1. ADD NEW SPEAKER/COORDINATOR ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, role: 'coordinator' | 'speaker') => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      // Calculate next number based on role (Moderator vs Speaker)
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

      setSpeakers((prev) => {
        const updated = [...prev, newSpeaker];

        // If this was triggered by a specific segment, select this speaker for it
        if (speakerCreationTriggerSegmentId) {
          setSegments(prevSegments => {
            const updatedSegments = prevSegments.map(seg => {
              if (seg.id === speakerCreationTriggerSegmentId) {
                let capturedTimestamp = seg.timestamp;
                if (!capturedTimestamp && videoRef.current) {
                  capturedTimestamp = formatTime(videoRef.current.currentTime);
                }
                return {
                  ...seg,
                  selectedSpeakerId: tempId,
                  state: null,
                  timestamp: capturedTimestamp
                };
              }
              return seg;
            });
            saveToLocal(updatedSegments, updated);
            return updatedSegments;
          });
          setSpeakerCreationTriggerSegmentId(null);
        } else {
          saveToLocal(segments, updated);
        }

        // We don't call persistSpeakersToServer yet because it needs the real URL
        return updated;
      });

      try {
        // 2. Background Upload
        const formData = new FormData();
        formData.append('file', file);
        formData.append('speakerName', speakerName);
        if (videoId) {
          formData.append('videoId', videoId);
        }

        const response = await fetch('/api/speakers/upload-avatar', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload avatar');
        }

        const data = await response.json();

        // 3. Finalize: Replace local preview with permanent server URL
        setSpeakers((prev) => {
          const updated = prev.map(s => s.id === tempId ? { ...s, avatar: data.url } : s);
          saveToLocal(segments, updated);
          persistSpeakersToServer(updated);
          return updated;
        });
      } catch (error: any) {
        console.error('Avatar upload error:', error);
        showSnackbar(`Failed to upload avatar: ${error.message}`);
        // Optional: Remove the optimistic speaker if upload failed
        setSpeakers((prev) => prev.filter(s => s.id !== tempId));
      } finally {
        e.target.value = "";
      }
    }
  };

  // --- 2. UPDATE AVATAR IMAGE ---
  const handleUpdateAvatar = async (id: string, file: File) => {
    // 1. Optimistic UI Update
    const localPreviewUrl = URL.createObjectURL(file);
    setSpeakers((prev) => {
      const updated = prev.map(s => s.id === id ? { ...s, avatar: localPreviewUrl } : s);
      saveToLocal(segments, updated);
      return updated;
    });

    try {
      // 2. Background Upload
      const formData = new FormData();
      formData.append('file', file);
      const speaker = speakers.find(s => s.id === id);
      if (speaker) {
        formData.append('speakerName', speaker.name);
      }
      if (videoId) {
        formData.append('videoId', videoId);
      }

      const response = await fetch('/api/speakers/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload avatar');
      }

      const data = await response.json();

      // 3. Finalize
      setSpeakers((prev) => {
        const updated = prev.map(s => s.id === id ? { ...s, avatar: data.url } : s);
        saveToLocal(segments, updated);
        persistSpeakersToServer(updated);
        return updated;
      });
    } catch (error: any) {
      console.error('Avatar upload error:', error);
      showSnackbar(`Failed to upload avatar: ${error.message}`);
    }
  };

  // --- 3. UPDATE SPEAKER NAME ---
  const handleUpdateSpeaker = (id: string | number, newName: string) => {
    setSpeakers((prevSpeakers) => {
      const updated = prevSpeakers.map((spk) => {
        if (spk.id === id) {
          return {
            ...spk,
            name: newName,
            shortName: newName.length > 10 ? newName.substring(0, 8) + "..." : newName,
          };
        }
        return spk;
      });
      saveToLocal(segments, updated);
      persistSpeakersToServer(updated);
      return updated;
    });
  };

  // --- 4. DELETE SPEAKER ---
  const handleDeleteSpeaker = async (id: string) => {
    // If it's a persistent speaker (has a real database ID), delete from server too
    if (id.length > 20 && !id.startsWith('uploaded-')) {
      try {
        await fetch(`/api/speakers/${id}/delete`, { method: 'DELETE' });
      } catch (error) {
        console.error("Failed to delete speaker from server:", error);
      }
    }

    setSpeakers((prev) => {
      const updated = prev.filter(s => s.id !== id);
      // We also need to update segments since we might have deleted a selected speaker
      setSegments(prevSegments => {
        const updatedSegments = prevSegments.map(seg =>
          seg.selectedSpeakerId === id ? { ...seg, selectedSpeakerId: null } : seg
        );
        saveToLocal(updatedSegments, updated);
        persistSpeakersToServer(updated);
        return updatedSegments;
      });
      return updated;
    });
  };

  const handleContentChange = (id: string, newContent: string) => {
    setSegments((prev) => {
      const updated = prev.map((seg) => {
        if (seg.id !== id) return seg;
        return { ...seg, content: newContent };
      });
      // Save to local storage on every change for draft persistence
      saveToLocal(updated, speakers);
      return updated;
    });
  };

  const handleSpeakerSelect = (segmentId: string, speakerId: string) => {
    if (isGlobalSaved) return;

    setSegments((prev) => {
      const updated = prev.map((seg) => {
        if (seg.id !== segmentId) return seg;

        // Mutually exclusive: selecting a speaker clears any state
        const newSelection = seg.selectedSpeakerId === speakerId ? null : speakerId;

        let capturedTimestamp = seg.timestamp;
        let capturedStartTime = seg.startTimeSeconds;

        if (newSelection && !capturedTimestamp && videoRef.current) {
          const currentTime = videoRef.current.currentTime;
          capturedTimestamp = formatTime(currentTime);
          capturedStartTime = currentTime;
        }

        return {
          ...seg,
          selectedSpeakerId: newSelection,
          state: null, // Clear state
          timestamp: capturedTimestamp,
          startTimeSeconds: capturedStartTime
        };
      });
      saveToLocal(updated, speakers);
      return updated;
    });
  };

  const handleStateSelect = (segmentId: string, state: SegmentState) => {
    if (isGlobalSaved) return;

    setSegments((prev) => {
      const updated = prev.map((seg) => {
        if (seg.id !== segmentId) return seg;

        // Mutually exclusive: selecting a state clears speakerId
        const newState = seg.state === state ? null : state;

        let capturedTimestamp = seg.timestamp;
        let capturedStartTime = seg.startTimeSeconds;

        if (newState && !capturedTimestamp && videoRef.current) {
          const currentTime = videoRef.current.currentTime;
          capturedTimestamp = formatTime(currentTime);
          capturedStartTime = currentTime;
        }

        return {
          ...seg,
          selectedSpeakerId: null, // Clear speaker
          state: newState,
          timestamp: capturedTimestamp,
          startTimeSeconds: capturedStartTime
        };
      });
      saveToLocal(updated, speakers);
      return updated;
    });
  };

  const handleTimestampClick = (timeStr: string | null) => {
    if (!timeStr || timeStr === "--:--") return;
    const seconds = parseTimeToSeconds(timeStr);

    if (!isVideoPlaying) {
      setIsVideoPlaying(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = seconds;
          videoRef.current.play().catch(() => { });
        }
      }, 100);
    } else {
      if (videoRef.current) {
        videoRef.current.currentTime = seconds;
        videoRef.current.play().catch(() => { });
      }
    }
  };

  const handleDeleteSegment = (id: string) => {
    if (isGlobalSaved) return;
    setSegments((prev) => {
      const updated = prev.length === 1
        ? [{
          id: "seg-" + Date.now(),
          selectedSpeakerId: null,
          state: null,
          timestamp: "00:00",
          content: "",
          status: 'draft' as const,
          startTimeSeconds: 0,
          createdAt: Date.now()
        }]
        : prev.filter((seg) => seg.id !== id);
      saveToLocal(updated, speakers);
      return updated;
    });
  };

  const handleGlobalSave = async () => {
    // Convert segments to transcript format
    const transcriptData = segments
      .filter(seg => seg.content.trim() !== "" || seg.state)
      .map((seg, index) => {
        const speaker = speakers.find(s => s.id === seg.selectedSpeakerId);
        const speakerName = speaker ? speaker.name : (seg.state ? seg.state.replace('_', ' ').toUpperCase() : "Unknown");

        // Parse timestamp if available
        let startTime = seg.startTimeSeconds ?? 0;
        let endTime = seg.endTimeSeconds ?? (startTime + 5);

        if (!startTime && seg.timestamp) {
          const timeParts = seg.timestamp.split(':');
          if (timeParts.length === 2) {
            startTime = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            endTime = startTime + 5;
          }
        }

        return {
          id: index,
          name: speakerName,
          time: seg.timestamp || "00:00",
          text: seg.content || `[${speakerName}]`,
          startTime: startTime,
          endTime: endTime,
        };
      });

    if (transcriptData.length === 0) {
      showSnackbar("No transcription content to save");
      return;
    }

    setIsSaving(true);
    try {
      // Prepare speaker data with avatars
      const speakerData = speakers.map((speaker) => {
        let avatarKey: string | null = null;
        if (speaker.avatar && speaker.avatar.startsWith('http')) {
          try {
            const url = new URL(speaker.avatar);
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

      // If we have a videoId, save the transcription
      if (videoId) {
        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoId,
            transcriptData: transcriptData,
            transcriptionType: "manual",
            speakerData: speakerData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
        setSavedVideoId(videoId);
        setShowNavigationAfterSave(true);
        showSnackbar("Transcription saved successfully!");
        setTimeout(() => setIsGlobalSaved(false), 2000);
        console.log("Manual transcription saved to database successfully");
      } else {
        // If no videoId, create or find video record from Digital Ocean Spaces URL
        const videoUrl = spacesUrl || sessionMediaUrl;

        if (!videoUrl) {
          showSnackbar("No video URL available. Please select a video first.");
          return;
        }

        // Create or get video record from the bucket URL
        const videoResponse = await fetch("/api/videos/create-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileUrl: videoUrl,
          }),
        });

        if (!videoResponse.ok) {
          let errorMessage = "Failed to create video record";
          try {
            const errorData = await videoResponse.json();
            errorMessage = errorData.error || errorMessage;
          } catch (jsonError) {
            // If response is not JSON (might be HTML error page), get text
            const text = await videoResponse.text().catch(() => "");
            if (text.includes("<!DOCTYPE") || text.includes("<html")) {
              errorMessage = "Server error: API returned an error page. Please check server logs.";
            } else if (text) {
              errorMessage = text.substring(0, 200); // Limit error message length
            }
          }
          throw new Error(errorMessage);
        }

        const videoData = await videoResponse.json();
        const videoIdToUse = videoData.video?.id;

        if (!videoIdToUse) {
          throw new Error("Video record created but no ID returned");
        }

        // Save transcription with the video ID
        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoIdToUse,
            transcriptData: transcriptData,
            transcriptionType: "manual",
            speakerData: speakerData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
        setSavedVideoId(videoIdToUse);
        setShowNavigationAfterSave(true);
        // Update videoId in session context if available
        if (setVideoUrl) {
          setVideoUrl(videoUrl, videoIdToUse);
        }
        showSnackbar("Transcription saved successfully!");
        setTimeout(() => setIsGlobalSaved(false), 2000);
        console.log("Manual transcription saved to database successfully");
      }
    } catch (error: any) {
      console.error("Error saving transcription:", error);
      showSnackbar(`Failed to save: ${error.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  const getSpeakerPillStyle = (speakerIndex: number, speakerId: string, segment: TranscriptSegment, role: string) => {
    const isSelected = segment.selectedSpeakerId === speakerId;

    if (role === "coordinator") {
      if (isSelected) {
        return "bg-[#FFF4C0] text-black border-[#FFE79E] ring-1 ring-[#FFD966]/40 font-bold";
      }
      return "bg-[#FFF4C0] text-black border-transparent hover:bg-[#FFEFB0]";
    }

    if (isSelected) {
      return "bg-[#F0FAFA] text-[#00A3AF] border-[#F0FAFA] font-medium ring-1 ring-[#00A3AF]/20";
    }

    return "bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200";
  };


  const saveToLocal = (currentSegments: TranscriptSegment[], currentSpeakers?: Speaker[]) => {
    if (typeof window !== 'undefined' && videoId) {
      localStorage.setItem(`transcript:${videoId}`, JSON.stringify({
        segments: currentSegments,
        speakers: currentSpeakers || speakers,
        lastSaved: Date.now()
      }));
    }
  };

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

      // We send an empty transcriptData to just update speakers
      // Or we can send the current segments too.
      // For now, let's just update speakers in the database for this video.
      await fetch("/api/transcriptions/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: videoId,
          transcriptData: segments.filter(seg => seg.content.trim() !== "" || seg.state).map((seg, idx) => {
            const speaker = currentSpeakers.find(s => s.id === seg.selectedSpeakerId);
            const speakerName = speaker ? speaker.name : (seg.state ? seg.state.replace('_', ' ').toUpperCase() : "Unknown");

            return {
              id: idx,
              name: speakerName,
              time: seg.timestamp || "00:00",
              text: seg.content || `[${speakerName}]`,
              startTime: seg.startTimeSeconds ?? parseTimeToSeconds(seg.timestamp),
              endTime: seg.endTimeSeconds ?? (parseTimeToSeconds(seg.timestamp) + 5),
            };
          }),
          transcriptionType: "manual",
          speakerData: speakerData,
        }),
      });
    } catch (error) {
      console.error("Failed to persist speakers to server:", error);
    }
  };

  const persistToServer = async (segmentId: string) => {
    if (!videoId) return;

    // Get current segments from state (need to be careful with stale state if called inside async)
    // Actually, it's better to pass the data to save
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>, segmentId: string, index: number) => {
    if (isGlobalSaved) return;

    const isLastSegment = index === segments.length - 1;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();

      const currentSegment = segments[index];
      const video = videoRef.current;

      // 1. Mandatory Selection Validation
      if (!currentSegment.selectedSpeakerId && !currentSegment.state) {
        if (video && !video.paused) {
          video.pause();
          setIsVideoPlaying(false);
        }
        showSnackbar("Mandatory: Select a speaker or state before continuing");
        return;
      }

      // 2. Prepare updated segments
      const currentTime = video ? video.currentTime : (currentSegment.startTimeSeconds || 0) + 5;

      let nextSegments: TranscriptSegment[];

      if (isLastSegment) {
        const newId = `seg-${Date.now()}`;
        nextSegments = [
          ...segments.map(s => s.id === segmentId ? {
            ...s,
            status: 'committed' as const,
            lastSavedAt: Date.now(),
            endTimeSeconds: currentTime
          } : s),
          {
            id: newId,
            selectedSpeakerId: null,
            state: null,
            timestamp: formatTime(currentTime),
            content: "",
            status: 'draft',
            startTimeSeconds: currentTime,
            createdAt: Date.now()
          }
        ];
      } else {
        nextSegments = segments.map(s => s.id === segmentId ? {
          ...s,
          status: 'committed' as const,
          lastSavedAt: Date.now(),
          endTimeSeconds: currentTime
        } : s);
      }

      // 3. Update state once
      setSegments(nextSegments);
      saveToLocal(nextSegments, speakers);

      // 4. Attempt server sync (don't block UI)
      const saveTranscript = async () => {
        try {
          const speakerData = speakers.map((speaker) => {
            let avatarKey: string | null = null;
            if (speaker.avatar && speaker.avatar.startsWith('http')) {
              try {
                const url = new URL(speaker.avatar);
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

          const transcriptData = nextSegments
            .filter(seg => seg.content.trim() !== "" || seg.state)
            .map((seg, idx) => {
              const speaker = speakers.find(s => s.id === seg.selectedSpeakerId);
              const speakerName = speaker ? speaker.name : (seg.state ? seg.state.replace('_', ' ').toUpperCase() : "Unknown");

              return {
                id: idx,
                name: speakerName,
                time: seg.timestamp || "00:00",
                text: seg.content || `[${speakerName}]`,
                startTime: seg.startTimeSeconds ?? parseTimeToSeconds(seg.timestamp),
                endTime: seg.endTimeSeconds ?? (parseTimeToSeconds(seg.timestamp) + 5),
              };
            });

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
          console.error("Auto-save to server failed:", error);
        }
      };

      if (videoId) {
        saveTranscript();
      }

      // 5. Handle focus
      if (isLastSegment) {
        setTimeout(scrollToBottom, 100);
      } else {
        const nextTextarea = document.querySelectorAll('textarea[data-segment-id]')[index + 1] as HTMLTextAreaElement;
        if (nextTextarea) {
          nextTextarea.focus();
        }
      }
    }
  };

  const handleSegmentFocus = (segmentId: string) => {
    if (isGlobalSaved) return;

    // Exit unlock mode if active
    if (playbackMode === 'unlocked') {
      setPlaybackMode('locked');
      showSnackbar("Returning to Locked Mode");
    }

    // Snap video to segment start
    const segment = segments.find(s => s.id === segmentId);
    if (segment && videoRef.current) {
      const startTime = segment.startTimeSeconds || 0;
      videoRef.current.currentTime = startTime;
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col font-sans text-[#111827] overflow-hidden relative">

      {/* --- ADD THIS STYLE BLOCK FOR HIDDEN SCROLLBARS --- */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;  /* IE and Edge */
            scrollbar-width: none;  /* Firefox */
        }
      `}</style>
      {/* SNACKBAR */}
      <div
        className={`fixed top-24 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ease-in-out ${snackbar.show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
          }`}
      >
        <div className="bg-[#1F2937] text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 min-w-[300px] justify-center">
          <ExclamationCircleIcon className="w-5 h-5 text-yellow-400 shrink-0" />
          <span className="text-sm font-medium">{snackbar.message}</span>
        </div>
      </div>

      {/* NAVIGATION MODAL AFTER SAVE */}
      {showNavigationAfterSave && savedVideoId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Transcription Saved!</h3>
                <p className="text-gray-600 text-sm">What would you like to do next?</p>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <Link
                  href={`/transcription/${savedVideoId}`}
                  onClick={() => setShowNavigationAfterSave(false)}
                  className="w-full px-4 py-3 bg-[#00A3AF] text-white rounded-lg font-medium hover:bg-[#008C97] transition flex items-center justify-center gap-2"
                >
                  View Transcription
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
                <Link
                  href={`/sessions?videoId=${savedVideoId}`}
                  onClick={() => setShowNavigationAfterSave(false)}
                  className="w-full px-4 py-3 bg-blue-50 text-[#00A3AF] border border-[#00A3AF] rounded-lg font-medium hover:bg-blue-100 transition flex items-center justify-center gap-2"
                >
                  Tagging
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>
                <button
                  onClick={() => setShowNavigationAfterSave(false)}
                  className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 transition text-sm font-medium"
                >
                  Continue Editing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER & TOP SECTION */}
      <div className="shrink-0 bg-gray-50 z-30 shadow-sm lg:shadow-none">
        <header className="bg-white border-b border-[#F0F0F0] h-[50px] lg:h-[60px] flex items-center px-4 lg:px-6 justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <button
              onClick={() => router.back()}
              className="hover:opacity-70 transition flex items-center"
              aria-label="Go back"
            >
              <img src="/icons/arrow-left.png" alt="Back" className="w-[24px] h-[24px] cursor-pointer" />
            </button>
            <h1 className="text-[16px] lg:text-[18px] font-semibold text-gray-800">Sessions</h1>
          </div>
        </header>

        <div className="px-4 lg:px-6 py-2 lg:py-3 flex items-center justify-between h-auto lg:h-[40px]">
          <div className="flex items-center gap-4">
            <h2 className="text-[18px] lg:text-[20px] font-semibold text-[#111827]">Manual Editor</h2>
            <button
              onClick={togglePlaybackMode}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-2 border
                ${playbackMode === 'unlocked'
                  ? "bg-amber-100 text-amber-700 border-amber-300 shadow-inner"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 shadow-sm"
                }`}
            >
              {playbackMode === 'unlocked' ? (
                <>
                  <LockOpenIcon className="w-3.5 h-3.5" />
                  Video Unlocked
                </>
              ) : (
                <>
                  <LockClosedIcon className="w-3.5 h-3.5" />
                  Unlock Video
                </>
              )}
            </button>
          </div>
          <div className="flex gap-2 lg:gap-3">
            {videoId && (
              <Link
                href={`/transcription/${videoId}`}
                className="px-3 lg:px-4 py-1.5 lg:py-2 bg-blue-50 text-[#00A3AF] border border-[#00A3AF] rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-100 transition flex items-center gap-2"
              >
                View Transcription
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            )}
            <button className="px-3 lg:px-4 py-1.5 lg:py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs lg:text-sm font-medium hover:bg-gray-50 transition">
              Export
            </button>
            <button
              onClick={handleGlobalSave}
              disabled={isGlobalSaved || isSaving}
              className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition shadow-sm
                        ${isGlobalSaved || isSaving
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#00A3AF] text-white hover:bg-[#008C97]"
                }`}
            >
              {isSaving ? "Saving..." : isGlobalSaved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        <div className="px-4 lg:px-6 pb-2 lg:pb-4 pt-2 border-b border-[#F0F0F0]">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[220px]">

            {/* SPEAKERS CAROUSEL CONTAINER */}
            <div className="w-full flex-1 h-full min-w-0">
              <SpeakersCarousel
                speakersData={speakers}
                onUpload={handleFileUpload}
                onUpdateAvatar={handleUpdateAvatar}
                onUpdateSpeaker={handleUpdateSpeaker}
                onDeleteSpeaker={handleDeleteSpeaker}
              />
            </div>

            {/* VIDEO PLAYER */}
            <div className="w-full lg:w-[350px] shrink-0 h-full">
              <div className="h-full w-full rounded-2xl overflow-hidden shadow-md bg-black relative">
                <SessionVideoPlayer
                  ref={videoRef}
                  videoUrl={mediaUrl}
                  isPlaying={isVideoPlaying}
                  onPlayStateChange={setIsVideoPlaying}
                />
                {/* Playback Speed Indicator */}
                {playbackSpeed !== 1 && (
                  <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md z-20 pointer-events-none border border-white/10">
                    {playbackSpeed}x Speed
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* TRANSCRIPT SEGMENTS */}
      <div
        className="flex-1 overflow-y-auto px-4 lg:px-6 py-2 lg:py-4 bg-gray-50"
        ref={scrollContainerRef}
      >
        <div className="w-full max-w-[1400px] mx-auto space-y-3 lg:space-y-4">

          {segments.map((segment, index) => {
            const isSpeakerSelected = !!segment.selectedSpeakerId;
            const isStateSelected = !!segment.state;
            const isAssigned = isSpeakerSelected || isStateSelected;
            const hasStartedTyping = segment.content.length > 0;
            const isLocked = isGlobalSaved || (!isAssigned && !isGlobalSaved) || playbackMode === 'unlocked';
            const isLastSegment = index === segments.length - 1;
            const isCurrentDraft = segment.status === 'draft';

            const stateOptions: { value: SegmentState; label: string }[] = [
              { value: 'inaudible', label: 'Inaudible' },
              { value: 'overlapping', label: 'Overlapping' },
              { value: 'no_conversation', label: 'No Conversation' },
              { value: 'unknown', label: 'Unknown' },
            ];

            return (
              <div
                key={segment.id}
                data-segment-id={segment.id}
                className={`
                  relative flex flex-col p-3 rounded-xl border bg-white transition-all duration-300
                  ${isGlobalSaved ? 'opacity-80 border-gray-100' : 'opacity-100 border-gray-200 shadow-sm'}
                  ${!isAssigned && !isGlobalSaved ? 'border-dashed border-gray-300' : 'border-solid'}
                  ${playbackMode === 'unlocked' ? 'opacity-50 grayscale-[0.2]' : ''}
                `}
              >

                {/* TIMER OVERLAY FOR DRAFT BLOCKS */}
                {isCurrentDraft && !isAssigned && speakerSelectionDeadline && !isGlobalSaved && playbackMode === 'locked' && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-40">
                    <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg animate-pulse flex items-center gap-1">
                      <Image src={ClockIcon} alt="clock" width={12} height={12} className="invert brightness-0" />
                      {Math.ceil((speakerSelectionDeadline - Date.now()) / 1000)}s to assign speaker
                    </div>
                  </div>
                )}

                {playbackMode === 'unlocked' && (
                  <div
                    className="absolute inset-0 z-40 cursor-pointer flex flex-col items-center justify-center bg-gray-50/10 backdrop-blur-[0.5px] rounded-xl"
                    onClick={togglePlaybackMode}
                  >
                    <div className="bg-white/90 px-4 py-2 rounded-full shadow-xl border border-amber-200 flex items-center gap-2 scale-90">
                      <LockOpenIcon className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Video Unlocked — Click to return</span>
                    </div>
                  </div>
                )}

                {!isGlobalSaved && (
                  <button
                    onClick={() => handleDeleteSegment(segment.id)}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-20"
                    title="Delete Segment"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}

                <div className="w-full flex flex-col sm:flex-row sm:items-start justify-between mb-2 pr-0 sm:pr-8 gap-3">
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {/* Speaker & State Plate */}
                    <div
                      onWheel={handleHorizontalScroll}
                      className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 cursor-ew-resize"
                    >
                      {/* Speakers */}
                      {speakers.map((spk, idx) => {
                        const speakerIdStr = String(spk.id);
                        const pillStyle = getSpeakerPillStyle(idx, speakerIdStr, segment, spk.role);
                        const isSelected = segment.selectedSpeakerId === speakerIdStr;

                        return (
                          <button
                            key={spk.id}
                            onClick={() => !isGlobalSaved && handleSpeakerSelect(segment.id, speakerIdStr)}
                            disabled={isGlobalSaved}
                            className={`
                                            flex items-center gap-2 px-3 py-1 rounded-lg text-[12px] border transition-colors whitespace-nowrap shrink-0
                                            ${pillStyle}
                                        `}
                          >
                            {spk.avatar ? (
                              <div className="w-4 h-4 rounded-full overflow-hidden border border-current/20">
                                <img src={spk.avatar} alt={spk.name} className="w-full h-full object-cover" />
                              </div>
                            ) : isSelected ? (
                              <Image src={MicrophoneIcon} alt="mic" width={12} height={12} className={idx === 0 ? "text-black" : "text-current"} />
                            ) : (
                              <Image src={UserIcon} alt="user" width={12} height={12} className={idx === 0 ? "text-black" : "opacity-40"} />
                            )}
                            {spk.shortName}
                            {spk.role === 'coordinator' && <span className="text-[9px] opacity-70 ml-1">(C)</span>}
                          </button>
                        );
                      })}

                      {/* Divider */}
                      {speakers.length > 0 && <div className="h-4 w-[1px] bg-gray-200 mx-1 shrink-0" />}

                      {/* State Options */}
                      {stateOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => !isGlobalSaved && handleStateSelect(segment.id, opt.value)}
                          disabled={isGlobalSaved}
                          className={`
                            px-3 py-1 rounded-lg text-[12px] border transition-all whitespace-nowrap shrink-0
                            ${segment.state === opt.value
                              ? 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm font-medium'
                              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }
                          `}
                        >
                          {opt.label}
                        </button>
                      ))}

                      {/* Add Speaker (Inline Trigger) */}
                      {!isGlobalSaved && (
                        <button
                          onClick={() => {
                            setSpeakerCreationTriggerSegmentId(segment.id);
                            // Trigger the dedicated speaker upload input in SpeakersCarousel
                            const input = document.getElementById('speaker-upload-input');
                            if (input) {
                              (input as HTMLInputElement).click();
                            } else {
                              // Fallback to coordinator input if speaker input is missing
                              const modInput = document.getElementById('coordinator-upload-input');
                              if (modInput) (modInput as HTMLInputElement).click();
                            }
                          }}
                          className="px-3 py-1 rounded-lg text-[12px] border border-dashed border-[#00A3AF] text-[#00A3AF] hover:bg-[#00A3AF]/5 transition-all whitespace-nowrap shrink-0 flex items-center gap-1"
                        >
                          <span className="text-sm font-bold leading-none">+</span>
                          Add Speaker
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    onClick={() => handleTimestampClick(segment.timestamp)}
                    className={`flex items-center gap-1.5 text-xs font-medium whitespace-nowrap mt-1 transition-colors
                            ${segment.timestamp ? "cursor-pointer hover:text-[#00A3AF] hover:underline text-gray-600" : "text-gray-400 cursor-default"}
                        `}
                    title={segment.timestamp ? "Click to seek video" : ""}
                  >
                    <Image src={ClockIcon} alt="clock" width={14} height={14} className="opacity-60" />
                    {segment.timestamp || "--:--"}
                  </div>
                </div>

                <div className="relative group">
                  {!isAssigned && !isGlobalSaved && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/20 backdrop-blur-[0.5px] rounded-lg cursor-pointer"
                      onClick={() => showSnackbar("Please assign a speaker or state to continue")}
                    >
                      <div className="flex items-center gap-2 text-gray-400 text-xs sm:text-sm bg-white px-4 py-2 rounded-full shadow-md border border-gray-100">
                        <LockClosedIcon className="w-4 h-4 text-amber-400" />
                        <span className="font-medium italic">Speaker or State selection required</span>
                      </div>
                    </div>
                  )}

                  <textarea
                    data-segment-id={segment.id}
                    value={segment.content}
                    onChange={(e) => handleContentChange(segment.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, segment.id, index)}
                    onFocus={() => handleSegmentFocus(segment.id)}
                    placeholder={!isGlobalSaved ? (isAssigned ? "Type content..." : "") : ""}
                    readOnly={isLocked || !isAssigned}
                    disabled={isLocked || !isAssigned}
                    className={`
                      w-full min-h-[24px] p-2 rounded-lg border resize-none text-[13px] lg:text-[14px] leading-relaxed focus:outline-none transition-all
                      ${isAssigned && !isLocked
                        ? "bg-[#FAFAFA] border-gray-200 focus:border-[#00A3AF] focus:ring-1 focus:ring-[#00A3AF] text-gray-800"
                        : "bg-gray-50/50 border-transparent text-gray-500 cursor-not-allowed"
                      }
                      ${segment.status === 'committed' ? 'border-l-4 border-l-[#00A3AF]/30' : ''}
                    `}
                    rows={1}
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = target.scrollHeight + "px";
                    }}
                  />
                </div>
              </div>
            );
          })}

          <div ref={bottomSpacerRef} className="h-10" />
        </div>
      </div>
    </div>
  );
}