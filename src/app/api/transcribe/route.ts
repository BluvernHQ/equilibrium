import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs-extra";
import { v4 as uuidv4 } from "uuid";
import {
    ValidationError,
    TranscriptionError,
    ExternalServiceError,
    handleError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

const SONIOX_API_BASE = "https://api.soniox.com/v1";
const SONIOX_MODEL = "stt-async-v4";

interface SonioxTranscriptToken {
    text: string;
    start_ms: number;
    end_ms: number;
    confidence: number;
    speaker?: string | null;
    language?: string | null;
    translation_status?: string | null;
}

interface SonioxTranscriptResponse {
    id: string;
    text: string;
    tokens: SonioxTranscriptToken[];
}

interface SonioxCreateTranscriptionResponse {
    id: string;
    status: "queued" | "processing" | "completed" | "error";
    error_type?: string | null;
    error_message?: string | null;
    enable_speaker_diarization: boolean;
    enable_language_identification: boolean;
    audio_duration_ms?: number | null;
}

/**
 * Group Soniox tokens into coarse speaker segments to match our frontend schema.
 * Uses all tokens with valid timing for segment boundaries and timestamps.
 * For segment text we use only English/translation tokens so the UI shows
 * clean English for non-native speakers.
 */
function buildSegmentsFromTokens(tokens: SonioxTranscriptToken[]) {
    type Segment = {
        speaker_id: string;
        speaker_label: string;
        start_time_seconds: number;
        end_time_seconds: number;
        text_original: string;
        text_english: string;
    };

    /** Prefer text from tokens that are the translated English output. */
    function englishTextFromTokens(tokenList: SonioxTranscriptToken[]): string {
        const englishTokens = tokenList.filter(
            (t) =>
                t.translation_status === "translation" ||
                (t.language && t.language.startsWith("en"))
        );
        if (englishTokens.length > 0) {
            return englishTokens.map((t) => t.text).join("");
        }
        return tokenList.map((t) => t.text).join("");
    }

    // Prefer tokens that have valid timing information.
    let sourceTokens = tokens.filter(
        (t) =>
            typeof t.start_ms === "number" &&
            typeof t.end_ms === "number" &&
            t.end_ms >= t.start_ms
    );

    // Fallback: if Soniox doesn't populate timestamps (should be rare),
    // use the full token list so at least text is preserved.
    if (sourceTokens.length === 0) {
        sourceTokens = tokens;
    }

    const segments: Segment[] = [];
    const speakerKeyToIndex = new Map<string, number>();
    let nextSpeakerIndex = 1;

    const getSpeakerIndex = (speaker: string | null | undefined): number => {
        const key = speaker ?? "default";
        const existing = speakerKeyToIndex.get(key);
        if (existing !== undefined) return existing;
        const idx = nextSpeakerIndex++;
        speakerKeyToIndex.set(key, idx);
        return idx;
    };

    let currentSpeakerKey: string | null = null;
    let currentTokens: SonioxTranscriptToken[] = [];

    const flushCurrent = () => {
        if (!currentTokens.length) return;
        const speakerKey = currentSpeakerKey ?? "default";
        const speakerIndex = getSpeakerIndex(speakerKey);
        const startMs = currentTokens[0].start_ms;
        const endMs = currentTokens[currentTokens.length - 1].end_ms;
        const textEnglish = englishTextFromTokens(currentTokens);
        segments.push({
            speaker_id: String(speakerIndex - 1),
            speaker_label: `Speaker ${speakerIndex}`,
            start_time_seconds: startMs / 1000,
            end_time_seconds: endMs / 1000,
            text_original: textEnglish,
            text_english: textEnglish,
        });
        currentTokens = [];
    };

    for (const token of sourceTokens) {
        const speakerKey = token.speaker ?? "default";
        if (currentSpeakerKey === null) {
            currentSpeakerKey = speakerKey;
        }

        if (speakerKey !== currentSpeakerKey) {
            flushCurrent();
            currentSpeakerKey = speakerKey;
        }

        currentTokens.push(token);
    }

    flushCurrent();

    return segments;
}

async function createSonioxFile(
    filePath: string,
    apiKey: string
): Promise<string> {
    const buffer = await fs.readFile(filePath);
    const blob = new Blob([buffer]);
    const formData = new FormData();
    formData.append("file", blob, path.basename(filePath));

    const res = await fetch(`${SONIOX_API_BASE}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        logger.error(
            "Soniox file upload failed",
            new Error(text.substring(0, 500)),
            { status: res.status }
        );
        throw new ExternalServiceError(
            `Soniox file upload failed with status ${res.status}`,
            "Soniox"
        );
    }

    const json = (await res.json()) as { id: string };
    if (!json.id) {
        throw new ExternalServiceError(
            "Soniox file upload did not return file_id",
            "Soniox"
        );
    }
    return json.id;
}

async function createSonioxTranscription(
    fileId: string,
    apiKey: string
): Promise<SonioxCreateTranscriptionResponse> {
    const payload = {
        model: SONIOX_MODEL,
        file_id: fileId,
        enable_speaker_diarization: true,
        enable_language_identification: true,
        translation: {
            type: "one_way",
            target_language: "en",
        },
    };

    const res = await fetch(`${SONIOX_API_BASE}/transcriptions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        logger.error(
            "Soniox transcription create failed",
            new Error(text.substring(0, 500)),
            { status: res.status }
        );
        throw new ExternalServiceError(
            `Soniox transcription create failed with status ${res.status}`,
            "Soniox"
        );
    }

    return (await res.json()) as SonioxCreateTranscriptionResponse;
}

/** Create transcription from a public audio URL so Soniox fetches directly (skips our download + upload). */
async function createSonioxTranscriptionWithUrl(
    audioUrl: string,
    apiKey: string
): Promise<SonioxCreateTranscriptionResponse> {
    const payload = {
        model: SONIOX_MODEL,
        audio_url: audioUrl,
        enable_speaker_diarization: true,
        enable_language_identification: true,
        translation: {
            type: "one_way",
            target_language: "en",
        },
    };

    const res = await fetch(`${SONIOX_API_BASE}/transcriptions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        const text = await res.text();
        logger.error(
            "Soniox transcription create with URL failed",
            new Error(text.substring(0, 500)),
            { status: res.status }
        );
        throw new ExternalServiceError(
            `Soniox transcription create failed with status ${res.status}`,
            "Soniox"
        );
    }

    return (await res.json()) as SonioxCreateTranscriptionResponse;
}

async function waitForSonioxTranscription(
    transcriptionId: string,
    apiKey: string
): Promise<void> {
    const start = Date.now();
    const pollIntervalMs = 1500;
    let timeoutMs = 5 * 60 * 1000; // base timeout: 5 minutes
    const maxTimeoutMs = 6 * 60 * 60 * 1000; // hard cap: 6 hours
    let durationBasedTimeoutSet = false;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const res = await fetch(
            `${SONIOX_API_BASE}/transcriptions/${transcriptionId}`,
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            }
        );

        if (!res.ok) {
            const text = await res.text();
            logger.error(
                "Soniox transcription status check failed",
                new Error(text.substring(0, 500)),
                { status: res.status }
            );
            throw new ExternalServiceError(
                `Soniox transcription status check failed with status ${res.status}`,
                "Soniox"
            );
        }

        const json = (await res.json()) as SonioxCreateTranscriptionResponse;

        // Once Soniox reports the audio duration, adapt the timeout:
        // allow processing up to ~6x audio length, with an upper cap.
        if (!durationBasedTimeoutSet && json.audio_duration_ms && json.audio_duration_ms > 0) {
            const durationMs = json.audio_duration_ms;
            const scaled = durationMs * 6;
            timeoutMs = Math.min(
                Math.max(timeoutMs, scaled),
                maxTimeoutMs
            );
            durationBasedTimeoutSet = true;
            logger.info("Adjusted Soniox transcription timeout based on audio duration", {
                transcriptionId,
                audioDurationMs: durationMs,
                timeoutMs,
            });
        }

        if (Date.now() - start > timeoutMs) {
            throw new ExternalServiceError(
                "Soniox transcription timed out",
                "Soniox"
            );
        }

        if (json.status === "completed") {
            return;
        }

        if (json.status === "error") {
            throw new ExternalServiceError(
                json.error_message || "Soniox transcription failed",
                "Soniox"
            );
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
}

async function getSonioxTranscript(
    transcriptionId: string,
    apiKey: string
): Promise<SonioxTranscriptResponse> {
    const res = await fetch(
        `${SONIOX_API_BASE}/transcriptions/${transcriptionId}/transcript`,
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        }
    );

    if (!res.ok) {
        const text = await res.text();
        logger.error(
            "Soniox transcript fetch failed",
            new Error(text.substring(0, 500)),
            { status: res.status }
        );
        throw new ExternalServiceError(
            `Soniox transcript fetch failed with status ${res.status}`,
            "Soniox"
        );
    }

    return (await res.json()) as SonioxTranscriptResponse;
}

export async function POST(req: NextRequest) {
    const tempRoot = "/tmp";
    const tempId = uuidv4();
    const workDir = path.join(tempRoot, `soniox-${tempId}`);

    try {
        const apiKey = process.env.SONIOX_API_KEY;
        if (!apiKey) {
            throw new ExternalServiceError(
                "Soniox API key is not configured",
                "Soniox"
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const videoUrl = formData.get("videoUrl") as string | null;
        const numSpeakersRaw = formData.get("numSpeakers") as string | null;
        const requestedMode = (formData.get("mode") as string | null) || "auto";

        if (!file && !videoUrl) {
            throw new ValidationError("No audio file or video URL provided", {
                required: ["file", "videoUrl"],
            });
        }

        const maxSize = 60 * 60 * 1024 * 1024; // ~1 hour upper bound

        let transcription: SonioxCreateTranscriptionResponse;

        if (file) {
            await fs.ensureDir(workDir);

            if (file.size > maxSize) {
                throw new ValidationError("File size exceeds maximum allowed size", {
                    field: "file",
                    maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB (approx 1 hour)`,
                    actualSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
                });
            }

            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const safeName = file.name || "audio";
            const tempFilePath = path.join(workDir, safeName);
            await fs.writeFile(tempFilePath, buffer);

            logger.info("Uploading file to Soniox Files API", {
                fileName: safeName,
                fileSize: file.size,
                fileType: file.type,
            });

            const fileId = await createSonioxFile(tempFilePath, apiKey);
            transcription = await createSonioxTranscription(fileId, apiKey);
        } else {
            // videoUrl: try Soniox direct fetch first (no download/upload), fallback to download+upload if needed
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(videoUrl!);
            } catch {
                throw new ValidationError("Invalid video URL format", {
                    field: "videoUrl",
                    value: videoUrl,
                });
            }

            const baseName = path.basename(parsedUrl.pathname) || "remote-media";

            try {
                transcription = await createSonioxTranscriptionWithUrl(
                    videoUrl!,
                    apiKey
                );
                logger.info("Using Soniox audio_url (direct fetch) to reduce transcription time", {
                    videoUrl: parsedUrl.toString().substring(0, 200),
                });
            } catch (urlErr) {
                // Fallback: download to our server then upload to Soniox (e.g. if URL is private)
                logger.info("Soniox audio_url failed, falling back to download and upload", {
                    videoUrl: parsedUrl.toString().substring(0, 200),
                });

                await fs.ensureDir(workDir);

                const res = await fetch(parsedUrl.toString());
                if (!res.ok || !res.body) {
                    throw new ExternalServiceError(
                        `Failed to download media from URL (status ${res.status})`,
                        "Soniox"
                    );
                }

                const contentLengthHeader = res.headers.get("content-length");
                if (contentLengthHeader) {
                    const length = Number(contentLengthHeader);
                    if (!Number.isNaN(length) && length > maxSize) {
                        throw new ValidationError("Remote media exceeds maximum allowed size", {
                            field: "videoUrl",
                            maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB (approx 1 hour)`,
                            actualSize: `${(length / (1024 * 1024)).toFixed(2)}MB`,
                        });
                    }
                }

                const arrayBuffer = await res.arrayBuffer();
                const effectiveSize = arrayBuffer.byteLength;
                if (effectiveSize > maxSize) {
                    throw new ValidationError("Remote media exceeds maximum allowed size", {
                        field: "videoUrl",
                        maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB (approx 1 hour)`,
                        actualSize: `${(effectiveSize / (1024 * 1024)).toFixed(2)}MB`,
                    });
                }

                const buffer = Buffer.from(arrayBuffer);
                const tempFilePath = path.join(workDir, baseName);
                await fs.writeFile(tempFilePath, buffer);

                logger.info("Downloaded media for Soniox async STT (fallback)", {
                    fileName: baseName,
                    fileSize: effectiveSize,
                    videoUrl: parsedUrl.toString().substring(0, 200),
                });

                const fileId = await createSonioxFile(tempFilePath, apiKey);
                transcription = await createSonioxTranscription(fileId, apiKey);
            }
        }

        const numSpeakers =
            numSpeakersRaw && !Number.isNaN(Number(numSpeakersRaw))
                ? Number(numSpeakersRaw)
                : undefined;
        if (numSpeakers !== undefined) {
            logger.info("Requested number of speakers (Soniox hint, informational only)", {
                numSpeakers,
            });
        }

        await waitForSonioxTranscription(transcription.id, apiKey);
        const transcript = await getSonioxTranscript(transcription.id, apiKey);

        const segments = buildSegmentsFromTokens(transcript.tokens);

        // Soniox returns unified (possibly translated) text; our frontend expects:
        // - english_transcript: full text
        // - original_transcript: best-effort original or null
        // - language_code: best-effort detected language (we approximate from first token)
        const firstLanguage =
            transcript.tokens.find((t) => t.language)?.language ?? "unknown";

        const responseBody = {
            language_code: firstLanguage,
            original_transcript: requestedMode === "auto" ? null : null,
            english_transcript: transcript.text ?? null,
            segments,
        };

        return NextResponse.json(responseBody);
    } catch (error: unknown) {
        logger.error(
            "Soniox transcription error",
            error instanceof Error ? error : new Error(String(error)),
            { endpoint: "/api/transcribe" }
        );

        if (
            error instanceof ValidationError ||
            error instanceof TranscriptionError ||
            error instanceof ExternalServiceError
        ) {
            return handleError(error);
        }

        return handleError(error);
    } finally {
        try {
            if (await fs.pathExists(workDir)) {
                await fs.remove(workDir);
            }
        } catch (cleanupError) {
            logger.error(
                "Failed to clean up Soniox temp directory",
                cleanupError instanceof Error
                    ? cleanupError
                    : new Error(String(cleanupError)),
                { workDir }
            );
        }
    }
}
