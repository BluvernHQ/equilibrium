"use client";

import React, { createContext, useContext, useState, useRef, ReactNode } from "react";
import { TranscriptEntry } from "@/modules/auto-transcription/templates/types";
import { useToast } from "@/context/ToastContext";

// Upload status type
type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadQueueStatus = "queued" | "uploading" | "success" | "error";

interface UploadQueueItem {
    id: string;
    fileName: string;
    size: number;
    status: UploadQueueStatus;
    error?: string;
}

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
    transcriptionProgress: number; // 0-100 for STT/translation
    isUploading: boolean;
    uploadStatus: UploadStatus;
    uploadError: string | null;
    uploadProgress: number; // 0-100
    uploadFile: (file: File, folderId?: string | null) => Promise<void>;
    uploadQueue: UploadQueueItem[];
    queueUploads: (files: File[], folderId?: string | null) => Promise<void>;
    clearUploadQueue: () => void;
    abortUpload: () => void;
    uploadFolderId: string | null; // Target project folder for upload (set from recordings)
    setUploadFolderId: (id: string | null) => void;
    setVideoUrl: (url: string, videoId?: string) => void; // Set video URL from recordings page
    startTranscription: () => Promise<void>;
    stopTranscription: () => void; // Cancel ongoing transcription
    resetSession: () => void;
    updateSpeakerName: (oldName: string, newName: string) => void;
    setTranscriptionData: (data: TranscriptEntry[] | null) => void;
    setVideoId: (id: string | null) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

// Normalize URLs so equality checks are robust and do not
// accidentally match different videos whose URLs merely share substrings.
const normalizeUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        // Drop query/hash and trailing slashes for a stable comparison key
        const normalizedPath = parsed.pathname.replace(/\/+$/, "");
        return `${parsed.origin}${normalizedPath}`;
    } catch {
        // Fallback for non-standard URLs (e.g. blob: or malformed)
        return url.trim();
    }
};

const urlsMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
    const na = normalizeUrl(a);
    const nb = normalizeUrl(b);
    return !!na && !!nb && na === nb;
};

export function SessionProvider({ children }: { children: ReactNode }) {
    const { toastError } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [spacesUrl, setSpacesUrl] = useState<string | null>(null);
    const [videoId, setVideoId] = useState<string | null>(null);
    const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
    const [transcriptionData, setTranscriptionData] = useState<TranscriptEntry[] | null>(null);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [transcriptionProgress, setTranscriptionProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);

    // Abort controller for cancelling transcription
    const transcriptionAbortController = useRef<AbortController | null>(null);
    // Abort: for direct upload we abort the XHR
    const uploadXhrRef = useRef<XMLHttpRequest | null>(null);
    const uploadAbortIsUserRef = useRef(false);

    const abortUpload = () => {
        uploadAbortIsUserRef.current = true;
        if (uploadXhrRef.current) {
            uploadXhrRef.current.abort();
            uploadXhrRef.current = null;
        }
        setIsUploading(false);
        setUploadProgress(0);
        setUploadStatus("idle");
        setUploadError(null);
    };

    const uploadFile = async (uploadedFile: File, targetFolderId?: string | null) => {
        const objectUrl = URL.createObjectURL(uploadedFile);
        setFile(uploadedFile);
        setMediaUrl(objectUrl);
        setTranscriptionData(null);
        setIsUploading(true);
        setUploadStatus("uploading");
        setUploadError(null);
        setUploadProgress(0);
        uploadAbortIsUserRef.current = false;

        const UPLOAD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min timeout for upload
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        try {
            console.log("Starting upload via API route...", {
                fileName: uploadedFile.name,
                fileSize: `${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB`,
            });

            // Use server-side upload endpoint to avoid CORS issues with direct Spaces PUT
            let meta: {
                fileName?: string;
                fileKey?: string;
                fileUrl?: string;
                fileSize?: number;
            } | null = null;

            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                uploadXhrRef.current = xhr;

                timeoutId = setTimeout(() => {
                    if (uploadXhrRef.current === xhr) {
                        uploadXhrRef.current = null;
                        xhr.abort();
                        reject(new Error("Upload timed out. Try a faster connection or smaller file."));
                    }
                }, UPLOAD_TIMEOUT_MS);

                xhr.upload.addEventListener("progress", (e) => {
                    if (e.lengthComputable) {
                        setUploadProgress((e.loaded / e.total) * 100);
                    }
                });
                xhr.addEventListener("load", () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = null;
                    uploadXhrRef.current = null;
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
                            if (!data.success) {
                                reject(new Error(data.error || "Upload failed"));
                                return;
                            }

                            const url: string | undefined = data.url || data.publicUrl;
                            const key: string | undefined = data.key;

                            if (!url || !key) {
                                reject(new Error("Upload failed: missing URL or key from server response"));
                                return;
                            }

                            setUploadProgress(100);

                            meta = data.videoMetadata ?? {
                                fileName: uploadedFile.name,
                                fileKey: key,
                                fileUrl: url,
                                fileSize: uploadedFile.size,
                            };

                            setSpacesUrl(url);
                            setVideoMetadata(meta);
                            // setUploadStatus("success"); // Set later after DB save
                            console.log("File uploaded via API route:", url);

                            resolve();
                        } catch (parseError) {
                            reject(new Error("Upload succeeded but response was invalid JSON"));
                        }
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
                    }
                });
                xhr.addEventListener("error", () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = null;
                    uploadXhrRef.current = null;
                    reject(new Error("Network error during upload."));
                });
                xhr.addEventListener("abort", () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    timeoutId = null;
                    uploadXhrRef.current = null;
                    reject(new DOMException("Aborted", "AbortError"));
                });

                xhr.open("POST", "/api/upload");
                // Do not manually set Content-Type; browser will set multipart/form-data with boundary
                const formData = new FormData();
                formData.append("file", uploadedFile);
                xhr.send(formData);
            });

            if (!meta) {
                throw new Error("Upload metadata missing after successful upload");
            }

            const { fileKey, fileUrl, fileName, fileSize } = meta;

            const folderIdToUse = targetFolderId ?? uploadFolderId;
            if (folderIdToUse) {
                try {
                    setUploadFolderId(folderIdToUse);
                    const saveRes = await fetch("/api/videos/save", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            fileName,
                            fileKey,
                            fileUrl,
                            fileSize,
                            folder_id: folderIdToUse,
                        }),
                    });
                    if (saveRes.ok) {
                        const saveData = await saveRes.json();
                        if (saveData.video?.id) setVideoId(saveData.video.id);
                    }
                } finally {
                    setUploadFolderId(null);
                }
            }

            setIsUploading(false);
            setUploadStatus("success");
            setTimeout(() => setUploadStatus("idle"), 3000);
        } catch (error: any) {
            if (timeoutId) clearTimeout(timeoutId);
            uploadXhrRef.current = null;
            setUploadProgress(0);
            setIsUploading(false);

            if (error?.name === "AbortError") {
                if (uploadAbortIsUserRef.current) {
                    setUploadError(null);
                    setUploadStatus("idle");
                    return;
                }
                const timeoutMsg = "Upload timed out. Try a faster connection or smaller file.";
                setUploadError(timeoutMsg);
                setUploadStatus("error");
                throw new Error(timeoutMsg);
            }

            console.error("Upload error:", error);
            const errorMessage = error?.message || "Failed to upload file to storage";
            setUploadError(errorMessage);
            setUploadStatus("error");
            throw error;
        }
    };

    const queueUploads = async (files: File[], targetFolderId?: string | null) => {
        if (!files.length) return;

        const folderIdToUse = targetFolderId ?? uploadFolderId;
        const itemsWithFiles = files.map((file) => ({
            id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2)}`,
            file,
            fileName: file.name,
            size: file.size,
        }));

        const queueItems: UploadQueueItem[] = itemsWithFiles.map(({ id, fileName, size }) => ({
            id,
            fileName,
            size,
            status: "queued",
        }));

        setUploadQueue((prev) => [...queueItems, ...prev]);

        for (const item of itemsWithFiles) {
            setUploadQueue((prev) =>
                prev.map((q) =>
                    q.id === item.id ? { ...q, status: "uploading", error: undefined } : q
                )
            );
            try {
                await uploadFile(item.file, folderIdToUse ?? undefined);
                setUploadQueue((prev) =>
                    prev.map((q) =>
                        q.id === item.id ? { ...q, status: "success" } : q
                    )
                );
            } catch (error) {
                console.error("Queue upload error:", error);
                const message = (error instanceof Error && error.message) || "Upload failed";
                setUploadQueue((prev) =>
                    prev.map((q) =>
                        q.id === item.id ? { ...q, status: "error", error: message } : q
                    )
                );
                toastError(error, "Failed to upload file");
            }
        }
    };

    const clearUploadQueue = () => {
        setUploadQueue([]);
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

        // Before calling external STT, check if we already have a saved transcription
        try {
            // Try to resolve an existing videoId:
            // 1) Prefer current context videoId
            // 2) If missing, try finding by URL in the videos DB
            let existingVideoId = videoId;

            if (!existingVideoId && (spacesUrl || mediaUrl)) {
                const url = spacesUrl || mediaUrl || "";

                // Skip DB lookup for blob URLs; they never map to persisted videos
                if (!url.startsWith("blob:")) {
                    try {
                        const videosRes = await fetch("/api/videos/db");
                        if (videosRes.ok) {
                            const videosData = await videosRes.json();
                            const matchedVideo = videosData.videos?.find((v: any) =>
                                urlsMatch(v.fileUrl, url) || urlsMatch(v.source_url, url)
                            );
                            if (matchedVideo?.id) {
                                existingVideoId = matchedVideo.id;
                                setVideoId(matchedVideo.id);
                            }
                        }
                    } catch (lookupError) {
                        console.error("Failed to resolve existing video by URL before transcription:", lookupError);
                    }
                }
            }

            if (existingVideoId) {
                try {
                    const loadRes = await fetch(`/api/transcriptions/load/${existingVideoId}`);
                    if (loadRes.ok) {
                        const loadData = await loadRes.json();
                        const blocks = loadData?.transcription?.blocks;

                        if (Array.isArray(blocks) && blocks.length > 0) {
                            // Map stored transcript blocks back into TranscriptEntry format
                            const restored: TranscriptEntry[] = blocks.map((block: any, index: number) => {
                                const startSeconds = block.start_time_seconds ?? block.startTimeSeconds ?? 0;
                                const endSeconds =
                                    block.end_time_seconds ??
                                    block.endTimeSeconds ??
                                    (startSeconds ? startSeconds + 5 : 5);

                                const minutes = Math.floor(startSeconds / 60);
                                const seconds = Math.floor(startSeconds % 60);
                                const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
                                    .toString()
                                    .padStart(2, "0")}`;

                                return {
                                    id: block.id ?? index,
                                    name: block.speaker_label || "Speaker 1",
                                    time: timeString,
                                    text: block.text || "",
                                    startTime: startSeconds,
                                    endTime: endSeconds,
                                };
                            });

                            setTranscriptionData(restored);
                            // Reuse existing transcript instead of calling external API
                            return;
                        }
                    }
                } catch (loadError) {
                    console.error("Failed to load existing transcription before external STT:", loadError);
                }
            }
        } catch (precheckError) {
            console.error("Pre-check for existing transcription failed; falling back to external STT:", precheckError);
        }

        // If we reach here, no existing transcription was found; proceed to external STT
        // Create new abort controller for this transcription
        transcriptionAbortController.current = new AbortController();
        setIsTranscribing(true);
        setTranscriptionProgress(5);

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

            // Prefer Sarvam "auto" mode (transcribe + translate)
            formData.append("mode", "auto");

            // Request is being sent to Sarvam – bump progress into "in progress" band
            setTranscriptionProgress(15);

            const response = await fetch("/api/transcribe", {
                method: "POST",
                body: formData,
                signal: transcriptionAbortController.current.signal,
            });

            if (!response.ok) {
                throw new Error("Transcription failed");
            }

            // Sarvam STT+translate job completed on the server, response received
            setTranscriptionProgress(65);

            const data = await response.json();

            let formattedData: TranscriptEntry[] = [];

            // 1. SarvamAI structured response (preferred)
            if (Array.isArray(data.segments) && data.segments.length > 0) {
                // Normalize speaker labels so the first distinct speaker is always "Speaker 1",
                // the next new speaker "Speaker 2", etc., based on order of appearance.
                const speakerIdToLabel = new Map<string, string>();
                let nextSpeakerIndex = 1;

                formattedData = data.segments.map((segment: any, index: number) => {
                    const startSeconds = segment.start_time_seconds ?? 0;
                    const endSeconds = segment.end_time_seconds ?? startSeconds;

                    const minutes = Math.floor(startSeconds / 60);
                    const seconds = Math.floor(startSeconds % 60);
                    const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
                        .toString()
                        .padStart(2, "0")}`;

                    // Use speaker_id when available as a stable key; fall back to speaker_label.
                    const rawSpeakerKey: string =
                        segment.speaker_id !== undefined && segment.speaker_id !== null
                            ? String(segment.speaker_id)
                            : (segment.speaker_label ?? "default");

                    let displaySpeakerLabel = speakerIdToLabel.get(rawSpeakerKey);
                    if (!displaySpeakerLabel) {
                        displaySpeakerLabel = `Speaker ${nextSpeakerIndex}`;
                        speakerIdToLabel.set(rawSpeakerKey, displaySpeakerLabel);
                        nextSpeakerIndex += 1;
                    }

                    const textContent =
                        segment.text_english ||
                        segment.text_original ||
                        "";

                    return {
                        id: index,
                        name: displaySpeakerLabel,
                        time: timeString,
                        text: textContent,
                        startTime: startSeconds,
                        endTime: endSeconds,
                    };
                });
            }
            // 2. Legacy AssemblyAI format with utterances
            else if (data.utterances && data.utterances.length > 0) {
                formattedData = data.utterances.map((utterance: any, index: number) => {
                    const speakerLabel = utterance.speaker || "A";
                    let speakerName = `Speaker ${speakerLabel}`;

                    if (
                        speakerLabel.length === 1 &&
                        speakerLabel >= "A" &&
                        speakerLabel <= "Z"
                    ) {
                        const speakerIndex = speakerLabel.charCodeAt(0) - 64;
                        speakerName = `Speaker ${speakerIndex}`;
                    }

                    const minutes = Math.floor(utterance.start / 60000);
                    const seconds = Math.floor((utterance.start % 60000) / 1000);
                    const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
                        .toString()
                        .padStart(2, "0")}`;

                    return {
                        id: index,
                        name: speakerName,
                        time: timeString,
                        text: utterance.text,
                        startTime: utterance.start / 1000,
                        endTime: utterance.end / 1000,
                    };
                });
            }
            // 3. Fallback: single-block transcript text
            else if (data.text || data.original_transcript || data.english_transcript) {
                const text: string =
                    data.text ||
                    data.original_transcript ||
                    data.english_transcript ||
                    "";

                formattedData = [
                    {
                        id: 0,
                        name: "Speaker 1",
                        time: "00:00",
                        text,
                        startTime: 0,
                        endTime: 10000, // default large number if unknown
                    },
                ];
            }

            setTranscriptionData(formattedData);
            // Raw transcript parsed and mapped into UI format
            if (formattedData.length > 0) {
                setTranscriptionProgress(80);
            }

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

                    if (uploadFolderId) {
                        saveBody.folder_id = uploadFolderId;
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

                            // Update local storage for Tagging compatibility
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
                            // Persisted successfully
                            setTranscriptionProgress(100);
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
                toastError(error, "Failed to transcribe session.");
            }
        } finally {
            setIsTranscribing(false);
            // After a short delay, reset progress so next run starts fresh
            setTimeout(() => {
                setTranscriptionProgress(0);
            }, 1500);
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
        // If the URL truly changes to a different resource, clear any existing videoId
        // so we never associate a new video with an old video's transcripts.
        const previousUrl = spacesUrl || mediaUrl;
        if (!urlsMatch(previousUrl, url)) {
            setVideoId(null);
        }

        setMediaUrl(url);
        setSpacesUrl(url);
        // Clear transcription data when setting a new video
        setTranscriptionData(null);

        // If videoId is provided, use it; otherwise try to find it from URL
        let finalVideoId = videoIdParam;
        if (!finalVideoId) {
            // Try to find video ID from database by URL using strict, normalized equality
            // to avoid accidentally matching different videos that share similar paths.
            try {
                const response = await fetch("/api/videos/db");
                if (response.ok) {
                    const data = await response.json();
                    const video = data.videos?.find((v: any) =>
                        urlsMatch(v.fileUrl, url) || urlsMatch(v.source_url, url)
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
        setTranscriptionProgress(0);
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
            transcriptionProgress,
            isUploading,
            uploadStatus,
            uploadError,
            uploadProgress,
            uploadFile,
            uploadQueue,
            queueUploads,
            clearUploadQueue,
            abortUpload,
            uploadFolderId,
            setUploadFolderId,
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
