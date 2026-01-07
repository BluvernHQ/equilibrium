"use client";

import React, { createContext, useContext, useState, useRef, ReactNode } from "react";
import { TranscriptEntry } from "@/modules/auto-transcription/templates/types";

// Upload status type
type UploadStatus = "idle" | "uploading" | "success" | "error";

// Update interface
interface VideoMetadata {
    fileName?: string;
    fileKey?: string;
    fileUrl?: string;
    fileSize?: number;
    source_type?: string;
    source_url?: string;
    provider_video_id?: string;
    duration_seconds?: number;
}

interface SessionContextType {
    file: File | null;
    mediaUrl: string | null;
    spacesUrl: string | null;
    videoId: string | null; // Database video ID
    videoMetadata: VideoMetadata | null; // Video metadata for database save
    transcriptionData: TranscriptEntry[] | null;
    isTranscribing: boolean;
    isUploading: boolean;
    uploadStatus: UploadStatus;
    uploadError: string | null;
    uploadProgress: number; // 0-100
    uploadFile: (file: File) => Promise<void>;
    setVideoUrl: (url: string, videoId?: string) => void; // Set video URL from recordings page
    startTranscription: () => Promise<void>;
    stopTranscription: () => void; // Cancel ongoing transcription
    resetSession: () => void;
    updateSpeakerName: (oldName: string, newName: string) => void;
    setTranscriptionData: (data: TranscriptEntry[] | null) => void;
    setVideoId: (id: string | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
    const [file, setFile] = useState<File | null>(null);
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [spacesUrl, setSpacesUrl] = useState<string | null>(null);
    const [videoId, setVideoId] = useState<string | null>(null);
    const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
    const [transcriptionData, setTranscriptionData] = useState<TranscriptEntry[] | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    
    // Abort controller for cancelling transcription
    const transcriptionAbortController = useRef<AbortController | null>(null);

    const uploadFile = async (uploadedFile: File) => {
        // Create local blob URL for immediate preview
        const objectUrl = URL.createObjectURL(uploadedFile);
        setFile(uploadedFile);
        setMediaUrl(objectUrl);
        setTranscriptionData(null);
        setIsUploading(true);
        setUploadStatus("uploading");
        setUploadError(null);
        setUploadProgress(0);

        try {
            // Upload to Digital Ocean Spaces
            const formData = new FormData();
            formData.append("file", uploadedFile);

            console.log("Starting upload...", {
                fileName: uploadedFile.name,
                fileSize: `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`,
                fileType: uploadedFile.type,
            });

            // Simulate progress (since we can't track actual upload progress with fetch)
            const progressInterval = setInterval(() => {
                setUploadProgress((prev) => {
                    if (prev < 90) return prev + 5;
                    return prev;
                });
            }, 500);

            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
                // Don't set timeout - let it handle large files
            });

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    // If response is not JSON, use status text
                    const text = await response.text().catch(() => "");
                    if (text) errorMessage = text;
                }
                console.error("Upload API error:", errorMessage);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            setSpacesUrl(data.url);
            setUploadStatus("success");
            console.log("File uploaded to Spaces:", data.url);
            
            // Store video metadata for later database save (when transcribing)
            if (data.videoMetadata) {
                setVideoMetadata(data.videoMetadata);
            } else if (data.key || data.url) {
                // Create metadata from response
                setVideoMetadata({
                    fileName: data.fileName,
                    fileKey: data.key,
                    fileUrl: data.url,
                });
            }
            
            // If videoId is provided (from existing video), use it
            if (data.videoId) {
                setVideoId(data.videoId);
            }
            
            // Reset success status after 3 seconds
            setTimeout(() => {
                setUploadStatus("idle");
            }, 3000);
        } catch (error: any) {
            console.error("Upload error:", error);
            setUploadProgress(0);
            
            // Handle different error types
            let errorMessage = "Failed to upload file to storage";
            if (error.name === "TypeError" && error.message.includes("fetch")) {
                errorMessage = "Network error: Could not connect to server. Please check your internet connection.";
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            setUploadError(errorMessage);
            setUploadStatus("error");
        } finally {
            setIsUploading(false);
        }
    };

    const updateSpeakerName = (oldName: string, newName: string) => {
        setTranscriptionData((prev) => {
            if (!prev) return null;
            return prev.map((entry) =>
                entry.name === oldName ? { ...entry, name: newName } : entry
            );
        });
    };

    const startTranscription = async () => {
        // Support both file upload and video URL from recordings
        if (!file && !spacesUrl && !mediaUrl) {
            console.error("No file or video URL available for transcription");
            return;
        }

        // Create new abort controller for this transcription
        transcriptionAbortController.current = new AbortController();
        setIsTranscribing(true);

        try {
            const formData = new FormData();
            
            if (file) {
                // If we have a file object, use it (upload flow)
                formData.append("file", file);
            } else if (spacesUrl || mediaUrl) {
                // If we have a URL (from recordings), pass it as a URL parameter
                const videoUrl = spacesUrl || mediaUrl;
                if (videoUrl) {
                    formData.append("videoUrl", videoUrl);
                }
            }

            const response = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
                signal: transcriptionAbortController.current.signal,
            });

            if (!response.ok) {
                throw new Error("Transcription failed");
            }

            const data = await response.json();

            let formattedData: TranscriptEntry[] = [];

            if (data.utterances && data.utterances.length > 0) {
                formattedData = data.utterances.map((utterance: any, index: number) => {
                    const speakerLabel = utterance.speaker || "A";
                    let speakerName = `Speaker ${speakerLabel}`;

                    if (speakerLabel.length === 1 && speakerLabel >= 'A' && speakerLabel <= 'Z') {
                        const speakerIndex = speakerLabel.charCodeAt(0) - 64;
                        speakerName = `Speaker ${speakerIndex}`;
                    }

                    const minutes = Math.floor(utterance.start / 60000);
                    const seconds = Math.floor((utterance.start % 60000) / 1000);
                    const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                    return {
                        id: index,
                        name: speakerName,
                        time: timeString,
                        text: utterance.text,
                        startTime: utterance.start / 1000,
                        endTime: utterance.end / 1000
                    };
                });
            } else if (data.text) {
                formattedData = [{
                    id: 0,
                    name: "Speaker 1",
                    time: "00:00",
                    text: data.text,
                    startTime: 0,
                    endTime: 10000 // default large number if unknown
                }];
            }

            setTranscriptionData(formattedData);

            // Save transcription to database (will create video if needed)
            if (formattedData.length > 0) {
                try {
                    // Get unique speakers for the initial save
                    const uniqueSpeakerNames = new Set<string>();
                    formattedData.forEach(entry => {
                        if (entry.name) uniqueSpeakerNames.add(entry.name);
                    });
                    
                    const speakerData = Array.from(uniqueSpeakerNames).map(name => ({
                        name,
                        speaker_label: name,
                        is_moderator: false
                    }));

                    const saveBody: any = {
                        transcriptData: formattedData,
                        transcriptionType: "auto",
                        speakerData: speakerData,
                    };

                    // If we have videoId, use it; otherwise pass videoMetadata to create video
                    if (videoId) {
                        saveBody.videoId = videoId;
                    } else if (videoMetadata) {
                        saveBody.videoMetadata = videoMetadata;
                    } else if (spacesUrl || mediaUrl) {
                        // Fallback: create metadata from URL
                        const url = spacesUrl || mediaUrl || "";
                        // Try to extract filename from URL
                        let extractedFileName = "Untitled Session";
                        try {
                            const urlPath = new URL(url).pathname;
                            const lastSegment = urlPath.split('/').pop() || "";
                            if (lastSegment) {
                                // Remove file extension and UUID prefixes, clean up the name
                                extractedFileName = decodeURIComponent(lastSegment)
                                    .replace(/\.[^/.]+$/, '') // Remove extension
                                    .replace(/^[a-f0-9-]{36}\.?/i, '') // Remove UUID prefix
                                    .replace(/[-_]/g, ' ') // Replace dashes/underscores with spaces
                                    .trim() || lastSegment;
                            }
                        } catch (e) {
                            // URL parsing failed, use default
                        }
                        
                        saveBody.videoMetadata = {
                            fileName: extractedFileName,
                            source_url: url,
                            source_type: spacesUrl ? "s3" : "external_url",
                        };
                    }

                    if (saveBody.videoId || saveBody.videoMetadata) {
                        const saveResponse = await fetch("/api/transcriptions/save", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(saveBody),
                        });

                        if (saveResponse.ok) {
                            const saveData = await saveResponse.json();
                            // Update videoId if it was created
                            const newVideoId = saveData.video_id || saveData.transcript?.video_id;
                            if (newVideoId && !videoId) {
                                setVideoId(newVideoId);
                            }

                            // Update local storage for View Session compatibility
                            if (typeof window !== 'undefined' && (newVideoId || videoId)) {
                                const vId = newVideoId || videoId;
                                const manualSegments = formattedData.map((entry: any, idx: number) => ({
                                    id: `auto-${idx}-${Date.now()}`,
                                    selectedSpeakerId: `speaker-${entry.name}`,
                                    state: null,
                                    timestamp: entry.time,
                                    content: entry.text,
                                    startTimeSeconds: entry.startTime,
                                    endTimeSeconds: entry.endTime,
                                    status: 'committed',
                                    createdAt: Date.now()
                                }));

                                const manualSpeakers = Array.from(uniqueSpeakerNames).map((name: any) => ({
                                    id: `speaker-${name}`,
                                    name,
                                    shortName: name.length > 10 ? name.substring(0, 8) + "..." : name,
                                    avatar: "",
                                    isDefault: false,
                                    role: "speaker"
                                }));

                                localStorage.setItem(`transcript:${vId}`, JSON.stringify({
                                    segments: manualSegments,
                                    speakers: manualSpeakers,
                                    lastSaved: Date.now()
                                }));
                            }

                            console.log("Transcription and video saved to database", { videoId: newVideoId });
                        } else {
                            const errorData = await saveResponse.json();
                            console.error("Failed to save transcription:", errorData);
                        }
                    }
                } catch (dbError) {
                    console.error("Failed to save transcription to database:", dbError);
                    // Continue even if DB save fails
                }
            }

        } catch (error: any) {
            // Check if it was aborted (user cancelled)
            if (error.name === 'AbortError') {
                console.log("Transcription cancelled by user");
            } else {
                console.error("Transcription error:", error);
                alert("Failed to transcribe session.");
            }
        } finally {
            setIsTranscribing(false);
            transcriptionAbortController.current = null;
        }
    };
    
    const stopTranscription = () => {
        if (transcriptionAbortController.current) {
            transcriptionAbortController.current.abort();
            transcriptionAbortController.current = null;
        }
        setIsTranscribing(false);
    };

    const setVideoUrl = async (url: string, videoIdParam?: string) => {
        setMediaUrl(url);
        setSpacesUrl(url);
        // Clear transcription data when setting a new video
        setTranscriptionData(null);
        
        // If videoId is provided, use it; otherwise try to find it from URL
        let finalVideoId = videoIdParam;
        if (!finalVideoId) {
            // Try to find video ID from database by URL
            try {
                const response = await fetch("/api/videos/db");
                if (response.ok) {
                    const data = await response.json();
                    const video = data.videos?.find((v: any) => 
                        v.fileUrl === url || 
                        v.source_url === url ||
                        (v.fileUrl && v.fileUrl.includes(url.split('/').pop() || '')) ||
                        (v.source_url && v.source_url.includes(url.split('/').pop() || ''))
                    );
                    if (video) {
                        finalVideoId = video.id;
                    }
                }
            } catch (error) {
                console.error("Failed to fetch video ID:", error);
            }
        }
        
        if (finalVideoId) {
            setVideoId(finalVideoId);
            
            // Try to load existing transcription
            try {
                const transcriptionResponse = await fetch(`/api/transcriptions/load/${finalVideoId}`);
                if (transcriptionResponse.ok) {
                    const transcriptionData = await transcriptionResponse.json();
                    if (transcriptionData.transcription?.transcriptData) {
                        setTranscriptionData(transcriptionData.transcription.transcriptData as TranscriptEntry[]);
                    }
                } else if (transcriptionResponse.status === 404) {
                    // If no transcription on server, clear local storage to prevent stale data
                    if (typeof window !== 'undefined') {
                        localStorage.removeItem(`transcript:${finalVideoId}`);
                    }
                }
            } catch (error) {
                console.error("Failed to load existing transcription:", error);
            }
        }
    };

    const resetSession = () => {
        setFile(null);
        setMediaUrl(null);
        setSpacesUrl(null);
        setVideoId(null);
        setVideoMetadata(null);
        setTranscriptionData(null);
        setIsTranscribing(false);
        setIsUploading(false);
        setUploadStatus("idle");
        setUploadError(null);
        setUploadProgress(0);
    };

    return (
        <SessionContext.Provider value={{
            file,
            mediaUrl,
            spacesUrl,
            videoId,
            videoMetadata,
            transcriptionData,
            isTranscribing,
            isUploading,
            uploadStatus,
            uploadError,
            uploadProgress,
            uploadFile,
            setVideoUrl,
            startTranscription,
            stopTranscription,
            resetSession,
            updateSpeakerName,
            setTranscriptionData,
            setVideoId,
        }}>
            {children}
        </SessionContext.Provider>
    );
}

export function useSession() {
    const context = useContext(SessionContext);
    if (context === undefined) {
        throw new Error("useSession must be used within a SessionProvider");
    }
    return context;
}
