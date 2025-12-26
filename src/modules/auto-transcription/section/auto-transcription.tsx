"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import SessionVideoPlayer from "@/modules/manual-transcription/components/session-video-player";
import Image from "next/image";
import UserIcon from "../../../../public/icons/profile-circle.png";
import { TranscriptEntry } from "../templates/types";
import { transcriptEntries as mockEntries } from "../data/transcript-datas";
import { useSession } from "@/context/SessionContext";
import { SparklesIcon, ArrowRightIcon, PencilSquareIcon, CheckIcon, XMarkIcon, StopIcon } from "@heroicons/react/24/outline";

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
  const { updateSpeakerName, mediaUrl: sessionMediaUrl, file: sessionFile, videoId, transcriptionData: sessionTranscriptionData, spacesUrl } = useSession();
  const [isGlobalSaved, setIsGlobalSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Speaker Editing State
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null);
  const [newSpeakerName, setNewSpeakerName] = useState("");

  // Use mock only if undefined, but if null (explicit "no data"), use empty array or handle separately
  // The logic in page.tsx passes null if ready to transcribe.
  const hasData = transcriptionData && transcriptionData.length > 0;
  // If transcriptionData is undefined, we might fall back to mock, but here we want to control it.
  // Let's say if it's undefined, we show mock (demo mode). If it's null, we show empty state.
  const entries = transcriptionData === undefined ? mockEntries : (transcriptionData || []);

  const showEmptyState = transcriptionData === null && !isTranscribing;
  const showShimmer = isTranscribing;

  // Use uploaded video from session if available, otherwise use prop or default
  const mediaUrl = sessionMediaUrl || audioUrl || "/videos/manual-transcription-video.mp4";

  // Use session transcription data if available, otherwise use prop
  const currentTranscriptionData = sessionTranscriptionData || transcriptionData;

  const handleGlobalSave = async () => {
    if (!currentTranscriptionData || currentTranscriptionData.length === 0) {
      alert("No transcription data to save");
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
            transcriptData: currentTranscriptionData,
            transcriptionType: "auto",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
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

        // Save transcription with the video ID
        const response = await fetch("/api/transcriptions/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoId: videoIdToUse,
            transcriptData: currentTranscriptionData,
            transcriptionType: "auto",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to save transcription");
        }

        setIsGlobalSaved(true);
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

  return (
    <div className="h-[100dvh] w-full bg-gray-50 flex flex-col font-sans text-[#111827] overflow-hidden relative">

      {/* HEADER - Keep visible */}
      <div className="shrink-0 bg-gray-50 z-30 shadow-sm lg:shadow-none">
        <header className="bg-white border-b border-[#F0F0F0] h-[50px] lg:h-[60px] flex items-center px-4 lg:px-6 justify-between">
          <div className="flex items-center gap-3 lg:gap-4">
            <Link href="/" className="hover:opacity-70 transition">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
            </Link>
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
            <div className="flex flex-col gap-4">
              {entries.map(({ id, name, time, text, startTime, endTime }: TranscriptEntry, index: number) => {
                const isActive = startTime !== undefined && endTime !== undefined
                  ? currentTime >= startTime && currentTime < endTime
                  : false;

                const isEditing = editingSpeakerId === name;

                return (
                  <div key={id || index} className="flex flex-col gap-2 transition-all duration-300">

                    {/* HEADER */}
                    <div className="flex items-center justify-between">

                      {isEditing ? (
                        <div className="flex items-center gap-2">
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
                        <div className="flex items-center min-w-[104px] gap-2 px-3 py-2 rounded-[8px] bg-gray-100 group cursor-pointer hover:bg-gray-200 transition-colors"
                          onClick={() => startEditing(name)}
                          title="Click to rename"
                        >
                          <Image src={UserIcon} alt={name || "Unknown"} width={14} height={14} />
                          <span className="text-sm whitespace-nowrap font-medium text-gray-700">{name || "Unknown Speaker"}</span>
                          <PencilSquareIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-gray-400 text-xs font-medium">
                        <img src="/icons/clock-1.png" alt="Clock" className="w-[14px] h-[14px]" />
                        {time}
                      </div>
                    </div>

                    {/* TEXT */}
                    <div
                      onClick={() => startTime !== undefined && handleSegmentClick(startTime)}
                      className={`
                            rounded-[10px] p-[12px] transition-colors duration-300 cursor-pointer
                            ${isActive
                          ? "bg-[#00A3AF]/10 border border-[#00A3AF]/20 shadow-sm scale-[1.01]"
                          : "bg-[#FAFAFA] border border-transparent hover:bg-gray-100"
                        }
                        `}
                      title="Click to play from here"
                    >
                      <p className={`text-sm leading-relaxed text-justify transition-colors ${isActive ? "text-gray-900 font-medium" : "text-gray-600"}`}>
                        {text}
                      </p>
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
