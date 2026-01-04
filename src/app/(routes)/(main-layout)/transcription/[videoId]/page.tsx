"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { LockClosedIcon, TrashIcon, ExclamationCircleIcon } from "@heroicons/react/24/solid";
import SpeakersCarousel, { Speaker } from "@/modules/manual-transcription/components/speakers-carousel";
import SessionVideoPlayer from "@/modules/manual-transcription/components/session-video-player";
import UserIcon from "../../../../../../public/icons/profile-circle.png";
import MicrophoneIcon from "../../../../../../public/icons/spk-icon.png";
import ClockIcon from "../../../../../../public/icons/clock-1.png";
import { useSession } from "@/context/SessionContext";
import {
    ArrowPathIcon,
    TagIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";

// Types
interface TranscriptBlock {
    id: string;
    speaker_label: string;
    start_time_seconds: number;
    end_time_seconds: number;
    text: string;
    order_index: number;
}

interface TranscriptData {
    id: string;
    version: number;
    language: string;
    transcription_type: "auto" | "manual";
    blocks: TranscriptBlock[];
}

interface VideoData {
    id: string;
    fileName: string;
    source_url: string;
    hasSession?: boolean;
}

// Segment format for the editor (matching manual transcription)
interface TranscriptSegment {
    id: string;
    selectedSpeakerId: string | null;
    timestamp: string | null;
    content: string;
}

// Helper to format seconds to time string (mm:ss)
function formatTime(seconds: number): string {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// Helper to parse time string to seconds
function parseTimeToSeconds(timeStr: string | null): number {
    if (!timeStr || timeStr === "--:--") return 0;
    const parts = timeStr.split(":");
    if (parts.length !== 2) return 0;
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return (minutes * 60) + seconds;
}

export default function TranscriptionViewPage() {
    const params = useParams();
    const router = useRouter();
    const videoId = params.videoId as string;

    const { setVideoUrl } = useSession();

    // State
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<TranscriptData | null>(null);
    const [video, setVideo] = useState<VideoData | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isGlobalSaved, setIsGlobalSaved] = useState(false);

    // Video player state
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Snackbar state
    const [snackbar, setSnackbar] = useState({ show: false, message: "" });
    const snackbarTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Speakers state
    const [speakers, setSpeakers] = useState<Speaker[]>([]);

    // Segments state (converted from transcript blocks)
    const [segments, setSegments] = useState<TranscriptSegment[]>([]);

    // Scroll refs
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const bottomSpacerRef = useRef<HTMLDivElement>(null);
    const scrollTargetRef = useRef<number>(0);
    const animationFrameRef = useRef<number | null>(null);

    // Retranscribe state
    const [isRetranscribing, setIsRetranscribing] = useState(false);

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

    // Load transcript data and convert to segments
    useEffect(() => {
        if (!videoId) return;

        const fetchTranscript = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/transcriptions/load/${videoId}`);

                if (!response.ok) {
                    if (response.status === 404) {
                        setError("No transcription found for this video.");
                    } else {
                        setError("Failed to load transcription.");
                    }
                    return;
                }

                const data = await response.json();

                if (data.transcription) {
                    setTranscript(data.transcription);

                    // Extract unique speakers from blocks
                    const uniqueSpeakers = new Map<string, Speaker>();
                    data.transcription.blocks.forEach((block: TranscriptBlock, index: number) => {
                        const speakerLabel = block.speaker_label || "Unknown";
                        if (!uniqueSpeakers.has(speakerLabel)) {
                            uniqueSpeakers.set(speakerLabel, {
                                id: `speaker-${speakerLabel}`,
                                name: speakerLabel,
                                shortName: speakerLabel.length > 10 ? speakerLabel.substring(0, 8) + "..." : speakerLabel,
                                avatar: "",
                                isDefault: false,
                                role: index === 0 ? "coordinator" : "speaker"
                            });
                        }
                    });
                    setSpeakers(Array.from(uniqueSpeakers.values()));

                    // Convert blocks to segments
                    const convertedSegments: TranscriptSegment[] = data.transcription.blocks.map((block: TranscriptBlock) => ({
                        id: block.id,
                        selectedSpeakerId: `speaker-${block.speaker_label || "Unknown"}`,
                        timestamp: formatTime(block.start_time_seconds),
                        content: block.text,
                    }));
                    setSegments(convertedSegments);
                }

                if (data.video) {
                    setVideo(data.video);
                    // Set video URL in session context
                    if (data.video.source_url) {
                        setVideoUrl(data.video.source_url, data.video.id);
                    }
                }
            } catch (err) {
                console.error("Error loading transcription:", err);
                setError("An error occurred while loading the transcription.");
            } finally {
                setLoading(false);
            }
        };

        fetchTranscript();
    }, [videoId, setVideoUrl]);

    // Horizontal scroll handler for speaker pills
    const handleHorizontalScroll = (e: React.WheelEvent<HTMLDivElement>) => {
        const container = e.currentTarget;
        const maxScroll = container.scrollWidth - container.clientWidth;

        if (maxScroll <= 0) return;

        if (animationFrameRef.current === null) {
            scrollTargetRef.current = container.scrollLeft;
        }

        scrollTargetRef.current += e.deltaY * 1.5;
        scrollTargetRef.current = Math.max(0, Math.min(scrollTargetRef.current, maxScroll));

        const smoothScrollLoop = () => {
            if (!container) return;
            const diff = scrollTargetRef.current - container.scrollLeft;

            if (Math.abs(diff) < 1) {
                container.scrollLeft = scrollTargetRef.current;
                animationFrameRef.current = null;
            } else {
                container.scrollLeft += diff * 0.1;
                animationFrameRef.current = requestAnimationFrame(smoothScrollLoop);
            }
        };

        if (animationFrameRef.current === null) {
            animationFrameRef.current = requestAnimationFrame(smoothScrollLoop);
        }
    };

    // ScrollTo bottom helper
    const scrollToBottom = () => {
        if (bottomSpacerRef.current) {
            bottomSpacerRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    // Speaker management handlers
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

    const handleUpdateAvatar = (id: string, file: File) => {
        const newAvatarUrl = URL.createObjectURL(file);
        setSpeakers((prev) =>
            prev.map(s => s.id === id ? { ...s, avatar: newAvatarUrl } : s)
        );
    };

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

    const handleDeleteSpeaker = (id: string) => {
        setSpeakers((prev) => prev.filter(s => s.id !== id));
        setSegments((prevSegments) =>
            prevSegments.map(seg =>
                seg.selectedSpeakerId === id ? { ...seg, selectedSpeakerId: null } : seg
            )
        );
    };

    // Segment handlers
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, isLastSegment: boolean) => {
        if (isGlobalSaved) return;
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (isLastSegment) {
                handleAddNext();
            }
        }
    };

    // Save handler
    const handleGlobalSave = async () => {
        const transcriptData = segments
            .filter(seg => seg.content.trim() !== "")
            .map((seg, index) => {
                const speaker = speakers.find(s => s.id === seg.selectedSpeakerId);
                const speakerName = speaker ? speaker.name : "Unknown";

                let startTime = 0;
                let endTime = 0;
                if (seg.timestamp) {
                    startTime = parseTimeToSeconds(seg.timestamp);
                    endTime = startTime + 5;
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
            const response = await fetch("/api/transcriptions/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    videoId: videoId,
                    transcriptData: transcriptData,
                    transcriptionType: transcript?.transcription_type || "auto",
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to save transcription");
            }

            setIsGlobalSaved(true);
            showSnackbar("Transcription saved successfully!");
            setTimeout(() => setIsGlobalSaved(false), 2000);
        } catch (error: any) {
            console.error("Error saving transcription:", error);
            showSnackbar(`Failed to save: ${error.message || "Unknown error"}`);
        } finally {
            setIsSaving(false);
        }
    };

    // Handle retranscription (only for auto transcriptions)
    const handleRetranscribe = () => {
        if (video?.source_url) {
            setVideoUrl(video.source_url, videoId);
            router.push("/auto-transcription");
        }
    };

    // Navigate to session (tagging)
    const handleGoToSession = () => {
        router.push(`/sessions?videoId=${videoId}`);
    };

    // Get speaker pill style
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

    const isAutoTranscription = transcript?.transcription_type === "auto";

    // Loading state
    if (loading) {
        return (
            <div className="h-screen w-full bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-[#00A3AF] border-t-transparent rounded-full animate-spin" />
                    <p className="text-gray-500">Loading transcription...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="h-screen w-full bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center px-4">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
                        <XMarkIcon className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800">{error}</h2>
                    <Link
                        href="/"
                        className="px-4 py-2 bg-[#00A3AF] text-white rounded-lg hover:bg-[#008C97] transition"
                    >
                        Go Back Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[100dvh] w-full bg-gray-50 flex flex-col font-sans text-[#111827] overflow-hidden relative">

            {/* STYLE BLOCK FOR HIDDEN SCROLLBARS */}
            <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
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
                    <div className="flex items-center gap-3">
                        <h2 className="text-[18px] lg:text-[20px] font-semibold text-[#111827]">
                            {video?.fileName || "Transcription Editor"}
                        </h2>
                        {/* Transcription Type Badge */}
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${isAutoTranscription
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-purple-100 text-purple-700"
                                }`}
                        >
                            {isAutoTranscription ? "Auto" : "Manual"}
                        </span>
                    </div>
                    <div className="flex gap-2 lg:gap-3">
                        {/* Retranscribe - Only for AUTO transcriptions */}
                        {isAutoTranscription && (
                            <button
                                onClick={handleRetranscribe}
                                disabled={isRetranscribing}
                                className="flex items-center gap-1.5 px-3 lg:px-4 py-1.5 lg:py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs lg:text-sm font-medium hover:bg-amber-100 transition disabled:opacity-50"
                            >
                                <ArrowPathIcon className="w-4 h-4" />
                                Retranscribe
                            </button>
                        )}
                        {/* Go to Session */}
                        <button
                            onClick={handleGoToSession}
                            className="flex items-center gap-1.5 px-3 lg:px-4 py-1.5 lg:py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs lg:text-sm font-medium hover:bg-emerald-100 transition"
                        >
                            <TagIcon className="w-4 h-4" />
                            Session
                        </button>
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
                                {video?.source_url ? (
                                    <SessionVideoPlayer
                                        ref={videoRef}
                                        videoUrl={video.source_url}
                                        isPlaying={isVideoPlaying}
                                        onPlayStateChange={setIsVideoPlaying}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        No video available
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

                                <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between mb-2 pr-0 sm:pr-8 gap-2 sm:gap-0">
                                    <div
                                        onWheel={handleHorizontalScroll}
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
