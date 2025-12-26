"use client";

import { useState, useRef, useEffect } from "react";
import { LockClosedIcon, TrashIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import SpeakersCarousel, { Speaker } from "../components/speakers-carousel";
import SessionVideoPlayer from "../components/session-video-player";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/context/SessionContext";

// Icons
import MicrophoneIcon from "../../../../public/icons/spk-icon.png";
import UserIcon from "../../../../public/icons/profile-circle.png";
import ClockIcon from "../../../../public/icons/clock-1.png";

export interface TranscriptSegment {
  id: string;
  selectedSpeakerId: string | null;
  timestamp: string | null;
  content: string;
}

interface ManualTranscriptionProps {
  audioUrl?: string;
  initialTranscript?: TranscriptSegment[];
  initialSpeakers?: Speaker[];
}

export default function ManualTranscription({ audioUrl, initialTranscript, initialSpeakers }: ManualTranscriptionProps) {
  const { mediaUrl: sessionMediaUrl, videoId, spacesUrl } = useSession();
  const [isGlobalSaved, setIsGlobalSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Use uploaded video from session if available, otherwise use prop or default
  const mediaUrl = sessionMediaUrl || audioUrl || "/videos/manual-transcription-video.mp4";

  const [snackbar, setSnackbar] = useState({ show: false, message: "" });
  const snackbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial State
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [segments, setSegments] = useState<TranscriptSegment[]>([
    {
      id: "seg-1",
      selectedSpeakerId: null,
      timestamp: null,
      content: "",
    },
  ]);

  // Hydrate from props if available
  useEffect(() => {
    if (initialSpeakers && initialSpeakers.length > 0) {
      setSpeakers(initialSpeakers);
    }
  }, [initialSpeakers]);

  useEffect(() => {
    if (initialTranscript && initialTranscript.length > 0) {
      setSegments(initialTranscript);
    }
  }, [initialTranscript]);

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

  const showSnackbar = (message: string) => {
    if (snackbarTimeoutRef.current) {
      clearTimeout(snackbarTimeoutRef.current);
    }
    setSnackbar({ show: true, message });
    snackbarTimeoutRef.current = setTimeout(() => {
      setSnackbar({ show: false, message: "" });
    }, 2000);
  };

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

  // --- 1. ADD NEW SPEAKER/COORDINATOR ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, role: 'coordinator' | 'speaker') => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const newSpeaker: Speaker = {
        id: `uploaded-${Date.now()}-${file.name}`,
        name: file.name.split('.')[0],
        shortName: file.name.length > 10 ? file.name.substring(0, 8) + "..." : file.name,
        avatar: URL.createObjectURL(file),
        isDefault: false,
        role: role
      };
      setSpeakers((prev) => [...prev, newSpeaker]);
      e.target.value = "";
    }
  };

  // --- 2. UPDATE AVATAR IMAGE ---
  const handleUpdateAvatar = (id: string, file: File) => {
    const newAvatarUrl = URL.createObjectURL(file);
    setSpeakers((prev) =>
      prev.map(s => s.id === id ? { ...s, avatar: newAvatarUrl } : s)
    );
  };

  // --- 3. UPDATE SPEAKER NAME ---
  const handleUpdateSpeaker = (id: string | number, newName: string) => {
    setSpeakers((prevSpeakers) =>
      prevSpeakers.map((spk) => {
        if (spk.id === id) {
          return {
            ...spk,
            name: newName,
            shortName: newName.length > 10 ? newName.substring(0, 8) + "..." : newName,
          };
        }
        return spk;
      })
    );
  };

  // --- 4. DELETE SPEAKER ---
  const handleDeleteSpeaker = (id: string) => {
    setSpeakers((prev) => prev.filter(s => s.id !== id));
    setSegments((prevSegments) =>
      prevSegments.map(seg =>
        seg.selectedSpeakerId === id ? { ...seg, selectedSpeakerId: null } : seg
      )
    );
  };

  const handleContentChange = (id: string, newContent: string) => {
    setSegments((prev) =>
      prev.map((seg) => {
        if (seg.id !== id) return seg;
        return { ...seg, content: newContent };
      })
    );
  };

  const handleSpeakerSelect = (segmentId: string, speakerId: string) => {
    if (isGlobalSaved) return;

    if (!isVideoPlaying) {
      showSnackbar("Please start the video to begin transcribing.");
      return;
    }

    setSegments((prev) =>
      prev.map((seg) => {
        if (seg.id !== segmentId) return seg;
        const newSelection = seg.selectedSpeakerId === speakerId ? null : speakerId;

        let capturedTimestamp = seg.timestamp;
        if (newSelection && !capturedTimestamp && videoRef.current) {
          const currentTime = videoRef.current.currentTime;
          capturedTimestamp = formatTime(currentTime);
        }

        return {
          ...seg,
          selectedSpeakerId: newSelection,
          timestamp: capturedTimestamp
        };
      })
    );
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

  const handleAddNext = () => {
    const newId = `seg-${Date.now()}`;
    setSegments((prev) => [
      ...prev,
      { id: newId, selectedSpeakerId: null, timestamp: null, content: "" }
    ]);
    // Manually scroll to bottom when user explicitly adds a new line
    setTimeout(scrollToBottom, 100);
  };

  const handleDeleteSegment = (id: string) => {
    if (isGlobalSaved) return;
    if (segments.length === 1) {
      setSegments([{ id: "seg-" + Date.now(), selectedSpeakerId: null, timestamp: null, content: "" }]);
      return;
    }
    setSegments((prev) => prev.filter((seg) => seg.id !== id));
  };

  const handleGlobalSave = async () => {
    // Convert segments to transcript format
    const transcriptData = segments
      .filter(seg => seg.content.trim() !== "")
      .map((seg, index) => {
        const speaker = speakers.find(s => s.id === seg.selectedSpeakerId);
        const speakerName = speaker ? speaker.name : "Unknown";
        
        // Parse timestamp if available
        let startTime = 0;
        let endTime = 0;
        if (seg.timestamp) {
          const timeParts = seg.timestamp.split(':');
          if (timeParts.length === 2) {
            startTime = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
            endTime = startTime + 5; // Default 5 seconds per segment
          }
        }

        return {
          id: index,
          name: speakerName,
          time: seg.timestamp || "00:00",
          text: seg.content,
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
      // If we have a videoId, save the transcription
      if (videoId) {
        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoId,
            transcriptData: transcriptData,
            transcriptionType: "manual",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
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
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
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


  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, isLastSegment: boolean) => {
    if (isGlobalSaved) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLastSegment) {
        handleAddNext();
      }
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

      {/* HEADER & TOP SECTION */}
      <div className="shrink-0 bg-gray-50 z-30 shadow-sm lg:shadow-none">
        <header className="bg-white border-b border-[#F0F0F0] h-[50px] lg:h-[60px] flex items-center px-4 lg:px-6 justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <Link href="/">
              <img src="/icons/arrow-left.png" alt="Back" className="w-[24px] h-[24px] cursor-pointer" />
            </Link>
            <h1 className="text-[16px] lg:text-[18px] font-semibold text-gray-800">Sessions</h1>
          </div>
        </header>

        <div className="px-4 lg:px-6 py-2 lg:py-3 flex items-center justify-between h-auto lg:h-[40px]">
          <h2 className="text-[18px] lg:text-[20px] font-semibold text-[#111827]">Manual Editor</h2>
          <div className="flex gap-2 lg:gap-3">
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
              <div className="h-full w-full rounded-2xl overflow-hidden shadow-md bg-black">
                <SessionVideoPlayer
                  ref={videoRef}
                  videoUrl={mediaUrl}
                  isPlaying={isVideoPlaying}
                  onPlayStateChange={setIsVideoPlaying}
                />
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
            const hasStartedTyping = segment.content.length > 0;
            const isLocked = isGlobalSaved || (!isSpeakerSelected && !isGlobalSaved);
            const isLastSegment = index === segments.length - 1;

            return (
              <div
                key={segment.id}
                className={`
                  relative flex flex-col p-3 rounded-xl border bg-white transition-all duration-300
                  ${isGlobalSaved ? 'opacity-80 border-gray-100' : 'opacity-100 border-gray-200 shadow-sm'}
                `}
              >

                {!isGlobalSaved && hasStartedTyping && (
                  <button
                    onClick={() => handleDeleteSegment(segment.id)}
                    className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors z-20"
                    title="Delete Segment"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}

                <div className="w-[1200px] flex flex-col sm:flex-row sm:items-center justify-between mb-2 pr-0 sm:pr-8 gap-2 sm:gap-0">
                  <div
                    onWheel={handleHorizontalScroll} // <--- Added Event Listener
                    className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 w-full sm:w-auto pb-1 sm:pb-0 cursor-ew-resize"
                  >
                    {speakers.length === 0 ? (
                      <span className="text-xs text-gray-400 italic py-1">Add a Coordinator to start...</span>
                    ) : (
                      speakers.map((spk, idx) => {
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
                            {isSelected ? (
                              <Image src={MicrophoneIcon} alt="mic" width={12} height={12} className={idx === 0 ? "text-black" : "text-current"} />
                            ) : (
                              <Image src={UserIcon} alt="user" width={12} height={12} className={idx === 0 ? "text-black" : "opacity-40"} />
                            )}
                            {spk.shortName}
                            {spk.role === 'coordinator' && <span className="text-[9px] opacity-70 ml-1">(C)</span>}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div
                    onClick={() => handleTimestampClick(segment.timestamp)}
                    className={`flex items-center gap-1.5 text-xs font-medium whitespace-nowrap self-end sm:self-auto transition-colors
                            ${segment.timestamp ? "cursor-pointer hover:text-[#00A3AF] hover:underline text-gray-600" : "text-gray-400 cursor-default"}
                        `}
                    title={segment.timestamp ? "Click to seek video" : ""}
                  >
                    <Image src={ClockIcon} alt="clock" width={14} height={14} className="opacity-60" />
                    {segment.timestamp || "--:--"}
                  </div>
                </div>

                <div className="relative group">
                  {!isSpeakerSelected && !isGlobalSaved && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/40 backdrop-blur-[1px] rounded-lg cursor-pointer">
                      <div className="flex items-center gap-2 text-gray-500 text-xs sm:text-sm bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 animate-pulse">
                        <LockClosedIcon className="w-4 h-4" />
                        <span>Select a speaker</span>
                      </div>
                    </div>
                  )}

                  <textarea
                    value={segment.content}
                    onChange={(e) => handleContentChange(segment.id, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, isLastSegment)}
                    placeholder={!isGlobalSaved ? "Type content..." : ""}
                    readOnly={isLocked}
                    disabled={isLocked}
                    className={`
                            w-full min-h-[24px] p-2 rounded-lg border resize-none text-[13px] lg:text-[14px] leading-relaxed focus:outline-none transition-all
                            ${!isLocked
                        ? "bg-white border-gray-200 focus:border-[#00A3AF] focus:ring-1 focus:ring-[#00A3AF] text-gray-800"
                        : "bg-gray-50 border-transparent text-gray-500 cursor-not-allowed"
                      }
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