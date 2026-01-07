"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SessionVideoPlayer from "@/modules/manual-transcription/components/session-video-player";
import Image from "next/image";
import UserIcon from "../../../../public/icons/profile-circle.png";
import { TranscriptEntry, SegmentState } from "../templates/types";
import { transcriptEntries as mockEntries } from "../data/transcript-datas";
import { useSession } from "@/context/SessionContext";
import { SparklesIcon, ArrowRightIcon, PencilSquareIcon, CheckIcon, XMarkIcon, StopIcon, PlusIcon } from "@heroicons/react/24/outline";
import SpeakerHeader from "../components/speaker-header";
import { LockClosedIcon } from "@heroicons/react/24/solid";

interface AutoTranscriptionProps {
  transcriptionData?: TranscriptEntry[] | null;
  audioUrl?: string;
  isTranscribing?: boolean;
  onStartTranscription?: () => void;
  onStopTranscription?: () => void;
}

export default function AutoTranscription({
  transcriptionData,
  audioUrl,
  isTranscribing = false,
  onStartTranscription,
  onStopTranscription
}: AutoTranscriptionProps) {
  const { updateSpeakerName, setTranscriptionData, mediaUrl: sessionMediaUrl, file: sessionFile, videoId, transcriptionData: sessionTranscriptionData, spacesUrl, setVideoUrl } = useSession();
  const [isGlobalSaved, setIsGlobalSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [speakerCreationTriggerEntryIndex, setSpeakerCreationTriggerEntryIndex] = useState<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Speaker Editing State
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");
  
  // Moderator/Coordinator state - track which speaker is the moderator
  const [moderatorName, setModeratorName] = useState<string | null>(null);
  const [moderatorAvatar, setModeratorAvatar] = useState<{ url: string; key: string } | null>(null);
  
  // Speaker avatars state - map of speaker name to avatar data
  const [speakerAvatars, setSpeakerAvatars] = useState<Record<string, { url: string; key: string }>>({});

  // Use mock only if undefined, but if null (explicit "no data"), use empty array or handle separately
  // The logic in page.tsx passes null if ready to transcribe.
  // We have data if we have real transcription data or if we're in mock/demo mode
  const hasData = (transcriptionData && transcriptionData.length > 0) || transcriptionData === undefined;

  // Sync isGlobalSaved with videoId - if we have a videoId, it means it's been saved to DB
  useEffect(() => {
    if (videoId && hasData && !isSaving) {
      setIsGlobalSaved(true);
      
      // Update URL with videoId if not already present, to support refresh
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('videoId') !== videoId) {
          currentUrl.searchParams.set('videoId', videoId);
          window.history.replaceState({}, '', currentUrl.toString());
        }
      }
    }
  }, [videoId, hasData, isSaving]);
  // If transcriptionData is undefined, we might fall back to mock, but here we want to control it.
  // Let's say if it's undefined, we show mock (demo mode). If it's null, we show empty state.
  const entries = transcriptionData === undefined ? mockEntries : (transcriptionData || []);

  const handleStateSelect = (entryIndex: number, state: SegmentState) => {
    if (!currentTranscriptionData) return;
    
    const updatedData = [...currentTranscriptionData];
    const entry = updatedData[entryIndex];
    
    // Toggle state: if already selected, clear it
    const newState = entry.state === state ? null : state;
    
    updatedData[entryIndex] = {
      ...entry,
      state: newState,
      // When a state is selected, it implicitly clears the speaker assignment in terms of display
      // but we keep the name for now as the session context expects it.
    };
    
    // Update session context
    if (setTranscriptionData) {
      setTranscriptionData(updatedData);
    }
  };

  const handleAddSpeakerTrigger = (entryIndex: number) => {
    setSpeakerCreationTriggerEntryIndex(entryIndex);
    // This will be handled by triggering the speaker upload in SpeakerHeader
    // since we specifically want to add a SPEAKER here, not necessarily a moderator
    const fileInput = document.getElementById('speaker-upload-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const saveToLocalForViewSession = (vId: string, transcript: TranscriptEntry[], speakersSet: Set<string>) => {
    if (typeof window !== 'undefined') {
      const manualSegments = transcript.map((entry, idx) => {
        const speakerName = entry.state ? entry.state.replace('_', ' ').toUpperCase() : entry.name;
        
        return {
          id: entry.id ? `auto-${entry.id}` : `auto-${idx}-${Date.now()}`,
          selectedSpeakerId: entry.state ? null : `speaker-${entry.name}`,
          state: entry.state || null,
          timestamp: entry.time,
          content: entry.text,
          startTimeSeconds: entry.startTime,
          endTimeSeconds: entry.endTime,
          status: 'committed',
          createdAt: Date.now()
        };
      });

      const manualSpeakers = Array.from(speakersSet).map((name) => {
        const avatarData = speakerAvatars[name];
        return {
          id: `speaker-${name}`,
          name,
          shortName: name.length > 10 ? name.substring(0, 8) + "..." : name,
          avatar: avatarData?.url || "",
          isDefault: false,
          role: moderatorName === name ? "coordinator" : "speaker"
        };
      });

      localStorage.setItem(`transcript:${vId}`, JSON.stringify({
        segments: manualSegments,
        speakers: manualSpeakers,
        lastSaved: Date.now()
      }));
    }
  };

  const showEmptyState = transcriptionData === null && !isTranscribing;
  const showShimmer = isTranscribing;

  // Use uploaded video from session if available, otherwise use prop or default
  const mediaUrl = sessionMediaUrl || audioUrl || "/videos/manual-transcription-video.mp4";

  // Use session transcription data if available, otherwise use prop or mock
  const currentTranscriptionData = sessionTranscriptionData || entries;

  const handleGlobalSave = async () => {
    if (!currentTranscriptionData || currentTranscriptionData.length === 0) {
      alert("No transcription data to save");
      return;
    }

    setIsSaving(true);
    try {
      // If we have a videoId, save the transcription
      if (videoId) {
        // Get all unique speakers from transcription data
        const uniqueSpeakerNames = new Set<string>();
        currentTranscriptionData.forEach(entry => {
          if (entry.name) {
            uniqueSpeakerNames.add(entry.name);
          }
        });
        
        // Prepare speaker data - include ALL speakers, not just those with avatars
        const speakerData = Array.from(uniqueSpeakerNames).map((name) => {
          const avatarData = speakerAvatars[name];
          return {
            name,
            speaker_label: name,
            avatar_url: avatarData?.url || null,
            avatar_key: avatarData?.key || null,
            is_moderator: moderatorName === name,
          };
        });

        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoId,
            transcriptData: currentTranscriptionData,
            transcriptionType: "auto",
            speakerData: speakerData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
        saveToLocalForViewSession(videoId, currentTranscriptionData, uniqueSpeakerNames);
        setTimeout(() => setIsGlobalSaved(false), 2000);
        console.log("Transcription saved to database successfully");
      } else {
        // If no videoId, create or find video record from Digital Ocean Spaces URL
        const videoUrl = spacesUrl || sessionMediaUrl;
        
        if (!videoUrl) {
          alert("No video URL available. Please select a video first.");
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

        // Get all unique speakers from transcription data
        const uniqueSpeakerNames = new Set<string>();
        currentTranscriptionData.forEach(entry => {
          if (entry.name) {
            uniqueSpeakerNames.add(entry.name);
          }
        });
        
        // Prepare speaker data - include ALL speakers with their avatars
        const speakerData = Array.from(uniqueSpeakerNames).map((name) => {
          const avatarData = speakerAvatars[name];
          return {
            name,
            speaker_label: name,
            avatar_url: avatarData?.url || null,
            avatar_key: avatarData?.key || null,
            is_moderator: moderatorName === name,
          };
        });

        // Add moderator as a separate speaker if it exists and is not in transcription data
        // This ensures standalone moderators are always saved, even if they don't appear in transcription blocks
        if (moderatorName && !uniqueSpeakerNames.has(moderatorName)) {
          const moderatorAvatarData = moderatorAvatar || speakerAvatars[moderatorName];
          speakerData.push({
            name: moderatorName,
            speaker_label: moderatorName,
            avatar_url: moderatorAvatarData?.url || null,
            avatar_key: moderatorAvatarData?.key || null,
            is_moderator: true,
          });
        }

        // Save transcription with the video ID
        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoIdToUse,
            transcriptData: currentTranscriptionData,
            transcriptionType: "auto",
            speakerData: speakerData,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
        saveToLocalForViewSession(videoIdToUse, currentTranscriptionData, uniqueSpeakerNames);
        setTimeout(() => setIsGlobalSaved(false), 2000);
        console.log("Transcription saved to database successfully");
      }
    } catch (error: any) {
      console.error("Error saving transcription:", error);
      alert(`Failed to save: ${error.message || "Unknown error"}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Sync Video Time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [isVideoPlaying]);

  // Auto-scroll to active segment
  useEffect(() => {
    if (!isVideoPlaying || !transcriptContainerRef.current) return;

    // Find the active entry
    const activeEntry = entries.find((entry: any) => {
      if (entry.startTime === undefined || entry.endTime === undefined) return false;
      return currentTime >= entry.startTime && currentTime < entry.endTime;
    });

    if (activeEntry) {
      // Find the DOM element for this entry
      const entryElements = transcriptContainerRef.current.querySelectorAll('[data-entry-id]');
      entryElements.forEach((el) => {
        if (el.getAttribute('data-entry-id') === String(activeEntry.id || entries.indexOf(activeEntry))) {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      });
    }
  }, [currentTime, isVideoPlaying, entries]);

  // Speaker Edit Handlers
  const startEditing = (currentName: string) => {
    setEditingSpeakerId(currentName);
    setNewSpeakerName(currentName);
  };

  const saveSpeakerName = (oldName: string) => {
    if (newSpeakerName.trim() && newSpeakerName !== oldName) {
      updateSpeakerName(oldName, newSpeakerName.trim());
    }
    setEditingSpeakerId(null);
  };

  const cancelEditing = () => {
    setEditingSpeakerId(null);
  };

  const handleSegmentClick = (start: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      if (!isVideoPlaying) {
        setIsVideoPlaying(true);
        videoRef.current.play().catch(e => console.error("Play error:", e));
      } else {
        videoRef.current.play().catch(e => console.error("Play error:", e));
      }
    }
  };



  // Load speaker avatars and moderator from database when videoId is available
  useEffect(() => {
    if (videoId) {
      fetch(`/api/transcriptions/load/${videoId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.speakers && Array.isArray(data.speakers)) {
            const avatarsMap: Record<string, { url: string; key: string }> = {};
            let foundModerator = false;
            
            data.speakers.forEach((speaker: any) => {
              const speakerName = speaker.name || speaker.speaker_label;
              
              // Store avatar for all speakers
              if (speaker.avatar_url && speaker.avatar_key && speakerName) {
                avatarsMap[speakerName] = {
                  url: speaker.avatar_url,
                  key: speaker.avatar_key
                };
              }
              
              // Set moderator if found (only one moderator per video)
              if (speaker.is_moderator && speakerName && !foundModerator) {
                setModeratorName(speakerName);
                if (speaker.avatar_url && speaker.avatar_key) {
                  setModeratorAvatar({
                    url: speaker.avatar_url,
                    key: speaker.avatar_key
                  });
                }
                foundModerator = true;
              }
            });
            
            setSpeakerAvatars(avatarsMap);
          }
        })
        .catch(err => {
          console.error('Failed to load speaker avatars:', err);
        });
    }
  }, [videoId]);

  // Handle avatar update
  const handleUpdateAvatar = (name: string, avatarUrl: string, avatarKey: string) => {
    setSpeakerAvatars((prev) => ({
      ...prev,
      [name]: { url: avatarUrl, key: avatarKey }
    }));
    // Mark as unsaved when avatar changes
    setIsGlobalSaved(false);
  };

  // Handle adding a speaker (upload file and create new speaker or moderator)
  const handleAddSpeaker = async (file: File, role: 'coordinator' | 'speaker' = 'speaker') => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    try {
      // Calculate next number based on role (Moderator vs Speaker)
      const rolePrefix = role === 'coordinator' ? 'Moderator' : 'Speaker';
      const uniqueSpeakerNames = new Set<string>();
      if (currentTranscriptionData) {
        currentTranscriptionData.forEach(entry => {
          if (entry.name) uniqueSpeakerNames.add(entry.name);
        });
      }
      if (moderatorName) uniqueSpeakerNames.add(moderatorName);

      const roleNumbers = Array.from(uniqueSpeakerNames)
        .map(name => {
          const regex = new RegExp(`^${rolePrefix} (\\d+)$`);
          const match = name.match(regex);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
      
      const nextNumber = roleNumbers.length > 0 ? Math.max(...roleNumbers) + 1 : 1;
      const speakerNameToUse = `${rolePrefix} ${nextNumber}`;

      // Upload avatar to object storage
      const formData = new FormData();
      formData.append('file', file);
      formData.append('speakerName', speakerNameToUse);
      if (videoId) {
        formData.append('videoId', videoId);
      }

      const response = await fetch('/api/speakers/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to upload ${role} avatar`);
      }

      const data = await response.json();
      
      if (role === 'coordinator') {
        setModeratorName(speakerNameToUse);
        setModeratorAvatar({ url: data.url, key: data.key });
      }
      
      // Add to speaker avatars
      setSpeakerAvatars((prev) => ({
        ...prev,
        [speakerNameToUse]: { url: data.url, key: data.key }
      }));

      // If this was triggered by a specific entry, assign this speaker to it
      if (speakerCreationTriggerEntryIndex !== null && currentTranscriptionData && setTranscriptionData) {
        const updatedData = [...currentTranscriptionData];
        updatedData[speakerCreationTriggerEntryIndex] = {
          ...updatedData[speakerCreationTriggerEntryIndex],
          name: speakerNameToUse,
          state: null
        };
        setTranscriptionData(updatedData);
        setSpeakerCreationTriggerEntryIndex(null);
      }
      
      // Mark as unsaved when speaker is added
      setIsGlobalSaved(false);
    } catch (error: any) {
      console.error('Speaker upload error:', error);
      alert(`Failed to add speaker: ${error.message}`);
    }
  };

  // Keep handleAddModerator for compatibility with SpeakerHeader if needed, 
  // but we can just use handleAddSpeaker with role='coordinator'
  const handleAddModerator = (file: File) => handleAddSpeaker(file, 'coordinator');
  const handleAddGenericSpeaker = (file: File) => handleAddSpeaker(file, 'speaker');

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col font-sans text-[#111827] overflow-hidden relative">

      {/* HEADER - Keep visible */}
      <div className="shrink-0 bg-gray-50 z-30 shadow-sm lg:shadow-none">
        <header className="bg-white border-b border-[#F0F0F0] h-[50px] lg:h-[60px] flex items-center px-4 lg:px-6 justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <button 
              onClick={() => router.back()} 
              className="hover:opacity-70 transition flex items-center"
              aria-label="Go back"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </button>
            <h1 className="text-[16px] lg:text-[18px] font-semibold text-gray-800">Sessions</h1>
          </div>
        </header>

        {/* ACTION BAR */}
        <div className="px-4 lg:px-6 py-2  flex items-center justify-between">
          <h2 className="text-[18px] lg:text-[20px] font-medium text-[#111827]">Auto Transcription</h2>
          <div className="flex gap-2 lg:gap-3">
            {/* Only show Export/Save if we have data */}
            {hasData && (
              <>
                {videoId && (
                  <Link 
                    href={`/transcription/${videoId}`}
                    className="px-3 lg:px-4 py-1.5 lg:py-2 bg-blue-50 text-[#00A3AF] border border-[#00A3AF] rounded-lg text-xs lg:text-sm font-medium hover:bg-blue-100 transition flex items-center gap-2"
                  >
                    View Session
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
                    ${isGlobalSaved || isSaving ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-[#00A3AF] text-white hover:bg-[#008C97]"}`}
                >
                  {isSaving ? "Saving..." : isGlobalSaved ? "Saved" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden px-4 lg:px-6 pb-6 gap-6">

        {/* TRANSCRIPT FEED AREA */}
        <div className="flex-1 w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-y-auto p-4 sm:p-5 lg:p-6 custom-scrollbar relative">
          
          {/* SPEAKER HEADER - Show when we have transcription data */}
          {hasData && currentTranscriptionData && currentTranscriptionData.length > 0 && (
            <SpeakerHeader
              transcriptionData={currentTranscriptionData}
              onUpdateSpeaker={updateSpeakerName}
              onUpdateAvatar={handleUpdateAvatar}
              onAddModerator={handleAddModerator}
              onAddSpeaker={handleAddGenericSpeaker}
              moderatorName={moderatorName}
              videoId={videoId}
              speakerAvatars={speakerAvatars}
              sectionTitle={videoId ? undefined : "Auto Transcription"}
            />
          )}

          {/* 1. EMPTY STATE (Generate Button) */}
          {showEmptyState && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                <SparklesIcon className="w-8 h-8 text-[#00A3AF]" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Ready to Transcribe</h3>
                <p className="text-gray-500 max-w-sm mx-auto text-sm">
                  Click below to generate the transcript.
                </p>
              </div>
              <button
                onClick={onStartTranscription}
                className="px-6 py-3 rounded-xl font-bold text-white shadow-lg bg-gradient-to-r from-[#00A3AF] to-[#008C97] hover:scale-105 hover:shadow-xl transition-all flex items-center gap-2"
              >
                Generate Transcript
                <ArrowRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 2. SHIMMER STATE (Loading) */}
          {showShimmer && (
            <div className="flex flex-col items-center">
              {/* Stop Transcription Button */}
              <div className="mb-6 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-2 h-2 bg-[#00A3AF] rounded-full animate-pulse" />
                  <span>Transcribing...</span>
                </div>
                <button
                  onClick={onStopTranscription}
                  className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 hover:border-red-300 transition-all flex items-center gap-2 shadow-sm"
                >
                  <StopIcon className="w-4 h-4" />
                  Stop Transcription
                </button>
              </div>
              
              {/* Shimmer placeholders */}
              <div className="w-full flex flex-col gap-6 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="w-24 h-8 bg-gray-200 rounded-lg"></div>
                      <div className="w-12 h-4 bg-gray-200 rounded-full"></div>
                    </div>
                    <div className="h-20 bg-gray-100 rounded-xl w-full"></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. TRANSCRIPT DATA */}
          {!showEmptyState && !showShimmer && (
            <div className="flex flex-col gap-4" ref={transcriptContainerRef}>
              {entries.map((entry: TranscriptEntry, index: number) => {
                const { id, name, time, text, startTime, endTime, state } = entry;
                const isActive = startTime !== undefined && endTime !== undefined
                  ? currentTime >= startTime && currentTime < endTime
                  : false;

                const isEditing = editingSpeakerId === name;
                
                const isAssigned = !!state;

                const stateOptions: { value: SegmentState; label: string }[] = [
                  { value: 'inaudible', label: 'Inaudible' },
                  { value: 'overlapping', label: 'Overlapping' },
                  { value: 'no_conversation', label: 'No Conversation' },
                  { value: 'unknown', label: 'Unknown' },
                ];

                return (
                  <div key={id || index} data-entry-id={id || index} className="flex flex-col gap-2 transition-all duration-300">

                    {/* HEADER */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">

                      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="text"
                              value={newSpeakerName}
                              onChange={(e) => setNewSpeakerName(e.target.value)}
                              className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#00A3AF]"
                              ref={(input) => {
                                // Focus without scrolling when the input mounts
                                if (input) {
                                  input.focus({ preventScroll: true });
                                }
                              }}
                            />
                            <button onClick={() => saveSpeakerName(name)} className="p-1 hover:bg-green-100 rounded-full text-green-600"><CheckIcon className="w-4 h-4" /></button>
                            <button onClick={cancelEditing} className="p-1 hover:bg-red-100 rounded-full text-red-600"><XMarkIcon className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className={`flex items-center min-w-[104px] gap-2 px-3 py-1.5 rounded-[8px] group cursor-pointer transition-colors shrink-0
                            ${state ? 'bg-amber-50 border border-amber-200' : 'bg-gray-100 hover:bg-gray-200'}`}
                            onClick={() => !state && startEditing(name)}
                            title={state ? `State: ${state}` : "Click to rename"}
                          >
                            <Image src={UserIcon} alt={name || "Unknown"} width={14} height={14} className={state ? "opacity-40" : ""} />
                            <span className={`text-sm whitespace-nowrap font-medium ${state ? 'text-amber-700' : 'text-gray-700'}`}>
                              {state ? state.replace('_', ' ').toUpperCase() : (name || "Unknown Speaker")}
                            </span>
                            {!state && <PencilSquareIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
                          </div>
                        )}

                        {/* Divider */}
                        <div className="h-4 w-[1px] bg-gray-200 mx-1 shrink-0" />

                        {/* State Options */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {stateOptions.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => handleStateSelect(index, opt.value)}
                              className={`
                                px-2.5 py-1 rounded-lg text-[11px] border transition-all whitespace-nowrap
                                ${state === opt.value
                                  ? 'bg-amber-100 border-amber-500 text-amber-800 font-bold shadow-sm'
                                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                                }
                              `}
                            >
                              {opt.label}
                            </button>
                          ))}
                          
                          <button
                            onClick={() => handleAddSpeakerTrigger(index)}
                            className="px-2.5 py-1 rounded-lg text-[11px] border border-dashed border-[#00A3AF] text-[#00A3AF] hover:bg-[#00A3AF]/5 transition-all whitespace-nowrap flex items-center gap-1"
                          >
                            <PlusIcon className="w-3 h-3" />
                            Add Speaker
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-gray-400 text-xs font-medium shrink-0 self-end sm:self-auto">
                        <img src="/icons/clock-1.png" alt="Clock" className="w-[14px] h-[14px]" />
                        {time}
                      </div>
                    </div>

                    {/* TEXT AREA */}
                    <div className="relative group">
                      {state && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/20 backdrop-blur-[0.5px] rounded-lg">
                           <div className="flex items-center gap-2 text-gray-400 text-xs bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                            <LockClosedIcon className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-medium italic">Content locked for {state.replace('_', ' ')}</span>
                          </div>
                        </div>
                      )}
                      <div
                        onClick={() => startTime !== undefined && handleSegmentClick(startTime)}
                        className={`
                              rounded-[10px] p-[12px] transition-all duration-300 cursor-pointer
                              ${isActive
                            ? "bg-[#00A3AF]/10 border border-[#00A3AF]/20 shadow-sm scale-[1.005]"
                            : "bg-[#FAFAFA] border border-transparent hover:bg-gray-100"
                          }
                          ${state ? "opacity-50 grayscale-[0.5]" : "opacity-100"}
                          `}
                        title="Click to play from here"
                      >
                        <p className={`text-sm leading-relaxed text-justify transition-colors ${isActive ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                          {text}
                        </p>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* VIDEO PLAYER - ALWAYS DISPLAYED */}
        <div
          className="
            w-full 
            h-[220px] 
            sm:h-[260px] 
            lg:w-[420px] 
            lg:h-[280px] 
            rounded-[15px] 
            overflow-hidden 
            shadow-md 
            bg-black 
            flex 
            items-center 
            justify-center
          "
        >
          <SessionVideoPlayer
            ref={videoRef}
            videoUrl={mediaUrl}
            isPlaying={isVideoPlaying}
            onPlayStateChange={setIsVideoPlaying}
          />
        </div>

      </div>
    </div>
  );
}
