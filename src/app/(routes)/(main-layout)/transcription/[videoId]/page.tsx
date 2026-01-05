"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
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
    fileUrl?: string;
    fileKey?: string;
    hasSession?: boolean;
}

// Segment format for the editor (matching manual transcription)
interface TranscriptSegment {
    id: string;
    selectedSpeakerId: string | null;
    timestamp: string | null;
    content: string;
    startTimeSeconds?: number; // For video sync highlighting
    endTimeSeconds?: number; // For video sync highlighting
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
    const [isGlobalSaved, setIsGlobalSaved] = useState(true); // Default to view mode (not edit mode)

    // Video player state
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [videoUrlReady, setVideoUrlReady] = useState(false);
    const [currentVideoTime, setCurrentVideoTime] = useState(0);
    const videoRef = useRef<HTMLVideoElement>(null);
    
    // Floating video player state
    const [videoPlayerPosition, setVideoPlayerPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const videoPlayerRef = useRef<HTMLDivElement>(null);

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

                    // Extract unique speakers from blocks and merge with speaker data from database
                    const uniqueSpeakers = new Map<string, Speaker>();
                    const speakerMap = new Map<string, any>();
                    
                    // Create a map of speaker labels to speaker data from database
                    if (data.speakers && Array.isArray(data.speakers)) {
                        data.speakers.forEach((speaker: any) => {
                            if (speaker.speaker_label || speaker.name) {
                                const label = speaker.speaker_label || speaker.name;
                                speakerMap.set(label, speaker);
                            }
                        });
                    }
                    
                    // First, add all speakers from database (including standalone moderators)
                    if (data.speakers && Array.isArray(data.speakers)) {
                        data.speakers.forEach((dbSpeaker: any) => {
                            const speakerLabel = dbSpeaker.speaker_label || dbSpeaker.name;
                            if (speakerLabel && !uniqueSpeakers.has(speakerLabel)) {
                                uniqueSpeakers.set(speakerLabel, {
                                    id: `speaker-${speakerLabel}`,
                                    name: dbSpeaker.name || speakerLabel,
                                    shortName: (dbSpeaker.name || speakerLabel).length > 10 
                                        ? (dbSpeaker.name || speakerLabel).substring(0, 8) + "..." 
                                        : (dbSpeaker.name || speakerLabel),
                                    avatar: dbSpeaker.avatar_url || "",
                                    isDefault: false,
                                    role: dbSpeaker.is_moderator ? "coordinator" : "speaker"
                                });
                            }
                        });
                    }
                    
                    // Then, add speakers from transcription blocks (in case they're not in database yet)
                    data.transcription.blocks.forEach((block: TranscriptBlock) => {
                        const speakerLabel = block.speaker_label || "Unknown";
                        if (!uniqueSpeakers.has(speakerLabel)) {
                            const dbSpeaker = speakerMap.get(speakerLabel);
                            uniqueSpeakers.set(speakerLabel, {
                                id: `speaker-${speakerLabel}`,
                                name: speakerLabel,
                                shortName: speakerLabel.length > 10 ? speakerLabel.substring(0, 8) + "..." : speakerLabel,
                                avatar: dbSpeaker?.avatar_url || "",
                                isDefault: false,
                                role: dbSpeaker?.is_moderator ? "coordinator" : "speaker"
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
                        startTimeSeconds: block.start_time_seconds,
                        endTimeSeconds: block.end_time_seconds,
                    }));
                    setSegments(convertedSegments);
                }

                if (data.video) {
                    // Prefer direct public URL if available (works without CORS if file is public)
                    // Only use presigned URLs if direct URL is not available or is expired
                    let videoUrlToUse = data.video.source_url || data.video.fileUrl;
                    
                    console.log("Video data from database:", {
                        hasSourceUrl: !!data.video.source_url,
                        hasFileUrl: !!data.video.fileUrl,
                        hasFileKey: !!data.video.fileKey,
                        sourceUrl: data.video.source_url?.substring(0, 100),
                        fileUrl: data.video.fileUrl?.substring(0, 100),
                    });
                    
                    // Check if we have a direct public URL (not a presigned URL)
                    const isPresignedUrl = videoUrlToUse && videoUrlToUse.includes('X-Amz-');
                    const hasDirectUrl = videoUrlToUse && !isPresignedUrl;
                    
                    console.log("URL analysis:", {
                        videoUrlToUse: videoUrlToUse?.substring(0, 100),
                        isPresignedUrl,
                        hasDirectUrl,
                    });
                    
                    // Extract fileKey from URL if not in database
                    let fileKeyToUse = data.video.fileKey;
                    let baseUrl = '';
                    
                    if (!fileKeyToUse && videoUrlToUse) {
                        try {
                            const urlObj = new URL(videoUrlToUse);
                            // Extract key from path (e.g., /Equilibrium/videoplayback.mp4 -> Equilibrium/videoplayback.mp4)
                            // In Digital Ocean Spaces, the bucket name is in the hostname, not the path
                            // So the entire pathname (minus leading slash) is the file key
                            const pathParts = urlObj.pathname.split('/').filter(p => p);
                            if (pathParts.length >= 1) {
                                // Keep ALL path parts - they form the complete file key
                                // e.g., ['Equilibrium', 'videoplayback.mp4'] -> 'Equilibrium/videoplayback.mp4'
                                fileKeyToUse = pathParts.join('/');
                                // Extract base URL (protocol + host)
                                baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                                console.log("Extracted fileKey from URL:", fileKeyToUse);
                                console.log("Extracted base URL:", baseUrl);
                            }
                        } catch (e) {
                            console.warn("Could not extract fileKey from URL:", e);
                        }
                    } else if (videoUrlToUse) {
                        try {
                            const urlObj = new URL(videoUrlToUse);
                            baseUrl = `${urlObj.protocol}//${urlObj.host}`;
                        } catch (e) {
                            // Ignore
                        }
                    }
                    
                    // Try to construct a direct public URL first (like auto-transcription does)
                    // This works if the file is public and doesn't require CORS
                    if (fileKeyToUse && (!hasDirectUrl || isPresignedUrl) && baseUrl) {
                        // Construct direct public URL from fileKey (same format as upload API returns)
                        // This matches what auto-transcription uses: https://hiffi.blr1.digitaloceanspaces.com/Equilibrium/videoplayback.mp4
                        const directPublicUrl = `${baseUrl}/${fileKeyToUse}`;
                        
                        console.log("🔄 Constructing direct public URL (like auto-transcription):", directPublicUrl.substring(0, 100));
                        videoUrlToUse = directPublicUrl;
                        console.log("✅ Using direct public URL (same format as auto-transcription - should work without CORS if file is public)");
                        
                        // This should work the same way as auto-transcription since we're using the same URL format
                    } else if (hasDirectUrl) {
                        console.log("✅ Using existing direct public URL (no CORS needed if file is public)");
                    } else if (videoUrlToUse && isPresignedUrl) {
                        // We have an expired presigned URL - try to construct direct URL or fetch fresh presigned
                        if (fileKeyToUse && baseUrl) {
                            const directPublicUrl = `${baseUrl}/${fileKeyToUse}`;
                            console.log("🔄 Converting expired presigned URL to direct URL:", directPublicUrl.substring(0, 100));
                            videoUrlToUse = directPublicUrl;
                            console.log("✅ Using direct public URL converted from presigned URL");
                        } else {
                            console.warn("⚠️ Using expired presigned URL (may not work - CORS required)");
                        }
                    } else {
                        console.warn("⚠️ No video URL available");
                    }
                    
                    // Update video state with the fresh URL
                    setVideo({
                        ...data.video,
                        source_url: videoUrlToUse || data.video.source_url || data.video.fileUrl || "",
                    });
                    
                    if (videoUrlToUse && videoUrlToUse.trim()) {
                        setVideoUrl(videoUrlToUse, data.video.id);
                        setVideoUrlReady(true); // Mark URL as ready
                    } else if (data.video.source_url || data.video.fileUrl) {
                        // Even if presigned URL fetch failed, use the existing URL
                        setVideoUrlReady(true);
                    }
                } else {
                    // No video data, but mark as ready to show "no video" message
                    setVideoUrlReady(true);
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

    // Auto-resize all textareas to fit content (especially important in view mode)
    useEffect(() => {
        const resizeAllTextareas = () => {
            // Find all textareas in the transcript segments
            const textareas = document.querySelectorAll('textarea[data-segment-id]');
            textareas.forEach((textarea) => {
                const element = textarea as HTMLTextAreaElement;
                // Reset height to auto to get accurate scrollHeight
                element.style.height = 'auto';
                // Set height to scrollHeight to fit all content
                element.style.height = element.scrollHeight + 'px';
            });
        };

        // Resize immediately when segments change or view mode changes
        resizeAllTextareas();

        // Also resize after a short delay to ensure DOM is fully rendered
        const timeout = setTimeout(resizeAllTextareas, 100);
        
        // Resize on window resize as well
        window.addEventListener('resize', resizeAllTextareas);

        return () => {
            clearTimeout(timeout);
            window.removeEventListener('resize', resizeAllTextareas);
        };
    }, [segments, isGlobalSaved]);

    // Ensure video URL is available for playback and refresh if needed
    useEffect(() => {
        const videoUrl = video?.source_url || video?.fileUrl;
        if (videoUrl && videoRef.current) {
            // Video URL is set, ensure player is ready
            console.log("Video URL available:", videoUrl);
            // If video element exists but src is different, update it
            if (videoRef.current.src !== videoUrl) {
                videoRef.current.src = videoUrl;
                videoRef.current.load();
            }
        }
    }, [video?.source_url, video?.fileUrl]);

    // Track video playback time for transcript highlighting (continuous tracking)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateTime = () => {
            if (video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
                setCurrentVideoTime(video.currentTime);
            }
        };

        // Listen to timeupdate events (fires during playback, ~4 times per second)
        const handleTimeUpdate = () => {
            updateTime();
        };

        // Listen to seeked events (fires when user seeks)
        const handleSeeked = () => {
            updateTime();
        };

        // Listen to loadedmetadata events (fires when video metadata loads)
        const handleLoadedMetadata = () => {
            updateTime();
        };

        // Listen to play/pause events to ensure time is tracked
        const handlePlay = () => {
            updateTime();
        };

        const handlePause = () => {
            updateTime();
        };

        // Use requestAnimationFrame for more frequent updates during playback
        let animationFrameId: number | null = null;
        const updateLoop = () => {
            if (video && !video.paused && video.readyState >= 2) {
                updateTime();
                animationFrameId = requestAnimationFrame(updateLoop);
            }
        };

        // Add event listeners
        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('seeked', handleSeeked);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        // Start animation frame loop when video is playing
        if (!video.paused && video.readyState >= 2) {
            animationFrameId = requestAnimationFrame(updateLoop);
        }

        // Initial update
        if (video.readyState >= 2) {
            updateTime();
        }

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('seeked', handleSeeked);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, [videoUrlReady, isVideoPlaying]);

    // Determine active segment based on current video time (works continuously)
    const activeSegmentId = useMemo(() => {
        // Always try to find active segment, even if video is paused
        // This ensures highlighting works at all times
        if (segments.length === 0) return null;
        
        // Find the segment that contains the current video time
        const activeSegment = segments.find(segment => {
            if (segment.startTimeSeconds === undefined || segment.endTimeSeconds === undefined) {
                return false;
            }
            // Segment is active if current time is between start and end (inclusive)
            // Use a small tolerance to handle edge cases
            const tolerance = 0.1; // 100ms tolerance
            return currentVideoTime >= (segment.startTimeSeconds - tolerance) && 
                   currentVideoTime <= (segment.endTimeSeconds + tolerance);
        });

        return activeSegment?.id || null;
    }, [currentVideoTime, segments]);

    // Auto-scroll to active segment
    useEffect(() => {
        if (!activeSegmentId || !scrollContainerRef.current) return;

        const segmentElement = document.querySelector(`[data-segment-id="${activeSegmentId}"]`);
        if (segmentElement) {
            // Scroll segment into view with some offset
            segmentElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [activeSegmentId]);

    // Initialize video player position on mount (right side)
    useEffect(() => {
        if (videoUrlReady && videoPlayerPosition.x === 0 && videoPlayerPosition.y === 0) {
            // Position on the right side with some padding
            const padding = 20; // 20px from right edge
            const topPadding = 100; // 100px from top (below header)
            const playerWidth = 350; // video player width
            
            setVideoPlayerPosition({
                x: window.innerWidth - playerWidth - padding,
                y: topPadding
            });
        }
    }, [videoUrlReady, videoPlayerPosition]);

    // Drag handlers for floating video player
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!videoPlayerRef.current) return;
        const rect = videoPlayerRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        setIsDragging(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            const newX = e.clientX - dragOffset.x;
            const newY = e.clientY - dragOffset.y;
            
            // Keep within viewport bounds
            const maxX = window.innerWidth - 350; // video player width
            const maxY = window.innerHeight - 220; // video player height
            
            setVideoPlayerPosition({
                x: Math.max(0, Math.min(newX, maxX)),
                y: Math.max(0, Math.min(newY, maxY))
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset]);

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
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, role: 'coordinator' | 'speaker') => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            
            // Validate file type (images only)
            if (!file.type.startsWith('image/')) {
                showSnackbar("Please select an image file");
                return;
            }

            try {
                // Upload avatar to object storage
                const formData = new FormData();
                formData.append('file', file);
                const speakerName = file.name.split('.')[0];
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
                
                const newSpeaker: Speaker = {
                    id: `uploaded-${Date.now()}-${file.name}`,
                    name: speakerName,
                    shortName: speakerName.length > 10 ? speakerName.substring(0, 8) + "..." : speakerName,
                    avatar: data.url,
                    isDefault: false,
                    role: role
                };
                setSpeakers((prev) => [...prev, newSpeaker]);
                
                // Mark as unsaved when new speaker with avatar is added
                setIsGlobalSaved(false);
            } catch (error: any) {
                console.error('Avatar upload error:', error);
                showSnackbar(`Failed to upload avatar: ${error.message}`);
            } finally {
                e.target.value = "";
            }
        }
    };

    const handleUpdateAvatar = async (id: string, file: File) => {
        try {
            // Upload avatar to object storage
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
            
            // Update speaker with uploaded avatar URL
            setSpeakers((prev) =>
                prev.map(s => s.id === id ? { ...s, avatar: data.url } : s)
            );
            
            // Mark as unsaved when avatar changes
            setIsGlobalSaved(false);
        } catch (error: any) {
            console.error('Avatar upload error:', error);
            showSnackbar(`Failed to upload avatar: ${error.message}`);
        }
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

        // Ensure video is playing
        if (!isVideoPlaying) {
            setIsVideoPlaying(true);
        }

        // Set time and play
        setTimeout(() => {
            if (videoRef.current) {
                videoRef.current.currentTime = seconds;
                videoRef.current.play().catch((err) => {
                    console.error("Video play error:", err);
                });
            }
        }, 100);
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
            // Prepare speaker data with avatars
            const speakerData = speakers.map((speaker) => {
                // Extract avatar key from URL if it's a Digital Ocean Spaces URL
                let avatarKey: string | null = null;
                if (speaker.avatar) {
                    try {
                        const url = new URL(speaker.avatar);
                        const pathParts = url.pathname.split('/').filter(p => p);
                        if (pathParts.length > 0) {
                            // Remove 'Equilibrium' prefix if present
                            const keyParts = pathParts.slice(pathParts[0] === 'Equilibrium' ? 1 : 0);
                            avatarKey = keyParts.join('/');
                        }
                    } catch (e) {
                        // If URL parsing fails, avatarKey remains null
                    }
                }

                return {
                    name: speaker.name,
                    speaker_label: speaker.name,
                    avatar_url: speaker.avatar || null,
                    avatar_key: avatarKey,
                    is_moderator: speaker.role === 'coordinator',
                };
            });

            // Ensure video URL is included when saving
            const saveBody: any = {
                videoId: videoId,
                transcriptData: transcriptData,
                transcriptionType: transcript?.transcription_type || "auto",
                speakerData: speakerData,
            };

            // Always include video metadata to ensure video URL is stored/updated correctly
            if (video) {
                saveBody.videoMetadata = {
                    source_url: video.source_url,
                    fileKey: video.fileKey,
                    source_type: (video as any).source_type,
                    fileName: video.fileName,
                };

                // If video doesn't have source_url but has fileKey, try to get presigned URL
                if (!video.source_url && video.fileKey) {
                    try {
                        const keyResponse = await fetch(`/api/videos/${encodeURIComponent(video.fileKey)}`);
                        if (keyResponse.ok) {
                            const keyData = await keyResponse.json();
                            if (keyData.url) {
                                // Update video metadata with the presigned URL
                                saveBody.videoMetadata.source_url = keyData.url;
                                saveBody.videoMetadata.source_type = "s3";
                            }
                        }
                    } catch (err) {
                        console.error("Failed to get presigned URL:", err);
                    }
                }
            }

            const response = await fetch("/api/transcriptions/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(saveBody),
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
        <div className="min-h-[100dvh] w-full bg-gray-50 flex flex-col font-sans text-[#111827] relative">

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
                        {/* Edit Mode Toggle */}
                        <button
                            onClick={() => setIsGlobalSaved(!isGlobalSaved)}
                            className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-medium transition shadow-sm
                        ${isGlobalSaved
                                    ? "bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                                    : "bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200"
                                }`}
                        >
                            {isGlobalSaved ? "Edit" : "View"}
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
                            {isSaving ? "Saving..." : "Save"}
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

                        {/* VIDEO PLAYER - PLACEHOLDER (for initial position calculation) */}
                        <div className="w-full lg:w-[350px] shrink-0 h-full opacity-0 pointer-events-none">
                            <div className="h-full w-full rounded-2xl overflow-hidden shadow-md bg-black">
                            </div>
                        </div>
                    </div>
                </div>

                {/* FLOATING VIDEO PLAYER */}
                {videoUrlReady && (
                    <div
                        ref={videoPlayerRef}
                        className="fixed z-50 w-[350px] h-[220px] cursor-move"
                        style={{
                            left: videoPlayerPosition.x > 0 ? `${videoPlayerPosition.x}px` : 'auto',
                            top: videoPlayerPosition.y > 0 ? `${videoPlayerPosition.y}px` : 'auto',
                        }}
                        onMouseDown={handleMouseDown}
                    >
                        <div className="h-full w-full rounded-2xl overflow-hidden shadow-2xl bg-black border-2 border-gray-300">
                            {(() => {
                                const videoUrl = video?.source_url || video?.fileUrl;
                                // Check if videoUrl is a valid non-empty string
                                if (videoUrl && videoUrl.trim()) {
                                    return (
                                        <SessionVideoPlayer
                                            key={`${videoUrl}-${video?.id || ''}`} // Force re-render when URL or video changes
                                            ref={videoRef}
                                            videoUrl={videoUrl}
                                            isPlaying={isVideoPlaying}
                                            onPlayStateChange={async (playing) => {
                                                setIsVideoPlaying(playing);
                                                
                                                // If starting to play and we have a fileKey, always refresh the presigned URL
                                                // Presigned URLs expire after 1 hour, so we should get a fresh one
                                                if (playing && video?.fileKey) {
                                                    try {
                                                        const keyResponse = await fetch(`/api/videos/${encodeURIComponent(video.fileKey)}`);
                                                        if (keyResponse.ok) {
                                                            const keyData = await keyResponse.json();
                                                            if (keyData.url && keyData.url.trim()) {
                                                                // Update video state with fresh URL
                                                                setVideo(prev => prev ? { ...prev, source_url: keyData.url } : null);
                                                                // Update the video URL in session context
                                                                setVideoUrl(keyData.url, video.id);
                                                            }
                                                        }
                                                    } catch (err) {
                                                        console.error("Failed to refresh presigned URL:", err);
                                                    }
                                                }
                                            }}
                                        />
                                    );
                                }
                                return (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        No video available
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* TRANSCRIPT SEGMENTS */}
            <div
                className="w-full px-4 lg:px-6 py-2 lg:py-4 bg-gray-50"
                ref={scrollContainerRef}
            >
                <div className="w-full max-w-[1400px] mx-auto space-y-3 lg:space-y-4">

                    {segments.map((segment, index) => {
                        const isSpeakerSelected = !!segment.selectedSpeakerId;
                        const hasStartedTyping = segment.content.length > 0;
                        const isLocked = isGlobalSaved || (!isSpeakerSelected && !isGlobalSaved);
                        const isLastSegment = index === segments.length - 1;
                        const isActive = activeSegmentId === segment.id;

                        return (
                            <div
                                key={segment.id}
                                data-segment-id={segment.id}
                                className={`
                  relative flex flex-col p-3 rounded-xl border bg-white transition-all duration-300
                  ${isGlobalSaved ? 'opacity-80 border-gray-100' : 'opacity-100 border-gray-200 shadow-sm'}
                  ${isActive ? 'ring-2 ring-[#00A3AF] ring-offset-2 bg-[#E0F7FA] border-[#00A3AF] shadow-md' : ''}
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
                                            <span className="text-xs text-gray-400 italic py-1">Add a Moderator to start...</span>
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
                                        data-segment-id={segment.id}
                                        value={segment.content}
                                        onChange={(e) => handleContentChange(segment.id, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(e, isLastSegment)}
                                        placeholder={!isGlobalSaved ? "Type content..." : ""}
                                        readOnly={isLocked}
                                        disabled={isLocked}
                                        className={`
                      w-full min-h-[24px] p-2 rounded-lg border resize-none text-[13px] lg:text-[14px] leading-relaxed focus:outline-none transition-all overflow-hidden
                      ${!isLocked
                                                ? "bg-white border-gray-200 focus:border-[#00A3AF] focus:ring-1 focus:ring-[#00A3AF] text-gray-800"
                                                : "bg-gray-50 border-transparent text-gray-500 cursor-not-allowed"
                                            }
                    `}
                                        rows={1}
                                        style={{ height: 'auto', overflow: 'hidden' }}
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
        </div>
    );
}
