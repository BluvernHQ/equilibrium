import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs-extra";
import { v4 as uuidv4 } from "uuid";
import { SarvamAIClient } from "sarvamai";
import {
    ValidationError,
    TranscriptionError,
    ExternalServiceError,
    handleError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

const sarvamClient = new SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY || "",
});

interface SarvamDiarizedEntry {
    transcript: string;
    start_time_seconds: number;
    end_time_seconds: number;
    speaker_id: string;
}

interface SarvamTranscriptFile {
    transcript?: string;
    language_code?: string;
    diarized_transcript?: {
        entries: SarvamDiarizedEntry[];
    };
}

async function readFirstJsonFile(dir: string): Promise<SarvamTranscriptFile> {
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));
    if (jsonFiles.length === 0) {
        throw new TranscriptionError("No transcript output files found", {
            service: "SarvamAI",
        });
    }
    const filePath = path.join(dir, jsonFiles[0]);
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as SarvamTranscriptFile;
}

// Default ~1 hour upper bound (in bytes) unless overridden via env.
const DEFAULT_MAX_BYTES = 60 * 60 * 1024 * 1024;

function getMaxUploadBytes(): number {
    const envValue = process.env.SARVAM_MAX_BYTES || process.env.SARVAM_MAX_MB;
    if (!envValue) {
        return DEFAULT_MAX_BYTES;
    }

    // Support either raw bytes (SARVAM_MAX_BYTES) or MB (SARVAM_MAX_MB).
    const numeric = Number(envValue);
    if (Number.isNaN(numeric) || numeric <= 0) {
        return DEFAULT_MAX_BYTES;
    }

    // Heuristic: if the value is small, treat it as MB; if large, as bytes.
    // e.g. "500" => 500 MB, "104857600" => 100 MB in bytes.
    if (numeric < 10_000) {
        return numeric * 1024 * 1024;
    }
    return numeric;
}

export async function POST(req: NextRequest) {
    const tempRoot = "/tmp";
    const tempId = uuidv4();
    const workDir = path.join(tempRoot, `sarvam-${tempId}`);

    try {
        if (!process.env.SARVAM_API_KEY) {
            throw new ExternalServiceError(
                "Sarvam AI API key is not configured",
                "SarvamAI"
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

        const maxSize = getMaxUploadBytes();

        await fs.ensureDir(workDir);

        let tempFilePath: string;
        let effectiveSize = 0;

        if (file) {
            if (file.size > maxSize) {
                throw new ValidationError("File size exceeds maximum allowed size", {
                    field: "file",
                    maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB`,
                    actualSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
                });
            }

            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const safeName = file.name || "audio";
            tempFilePath = path.join(workDir, safeName);
            await fs.writeFile(tempFilePath, buffer);
            effectiveSize = buffer.byteLength;

            logger.info("Uploading file to SarvamAI batch STT", {
                fileName: safeName,
                fileSize: file.size,
                fileType: file.type,
            });
        } else {
            // Use remote video/audio URL (e.g., from Spaces)
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(videoUrl!);
            } catch {
                throw new ValidationError("Invalid video URL format", {
                    field: "videoUrl",
                    value: videoUrl,
                });
            }

            logger.info("Downloading media from URL for SarvamAI batch STT", {
                videoUrl: parsedUrl.toString().substring(0, 200),
            });

            const res = await fetch(parsedUrl.toString());
            if (!res.ok || !res.body) {
                throw new ExternalServiceError(
                    `Failed to download media from URL (status ${res.status})`,
                    "SarvamAI"
                );
            }

            const contentLengthHeader = res.headers.get("content-length");
            if (contentLengthHeader) {
                const length = Number(contentLengthHeader);
                if (!Number.isNaN(length) && length > maxSize) {
                    throw new ValidationError("Remote media exceeds maximum allowed size", {
                        field: "videoUrl",
                        maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB`,
                        actualSize: `${(length / (1024 * 1024)).toFixed(2)}MB`,
                    });
                }
            }

            const arrayBuffer = await res.arrayBuffer();
            effectiveSize = arrayBuffer.byteLength;
            if (effectiveSize > maxSize) {
                throw new ValidationError("Remote media exceeds maximum allowed size", {
                    field: "videoUrl",
                    maxSize: `${(maxSize / (1024 * 1024)).toFixed(0)}MB`,
                    actualSize: `${(effectiveSize / (1024 * 1024)).toFixed(2)}MB`,
                });
            }

            const buffer = Buffer.from(arrayBuffer);
            const pathName = parsedUrl.pathname || "/remote-media";
            const baseName = path.basename(pathName) || "remote-media";
            tempFilePath = path.join(workDir, baseName);
            await fs.writeFile(tempFilePath, buffer);

            logger.info("Downloaded media for SarvamAI batch STT", {
                fileName: baseName,
                fileSize: effectiveSize,
                videoUrl: parsedUrl.toString().substring(0, 200),
            });
        }

        const numSpeakers =
            numSpeakersRaw && !Number.isNaN(Number(numSpeakersRaw))
                ? Number(numSpeakersRaw)
                : undefined;

        // Auto language detection via language_code = "unknown"
        const baseJobParams = {
            model: "saaras:v3" as const,
            languageCode: "unknown" as const,
            withDiarization: true,
            numSpeakers,
        };

        // Primary job: translate + diarization → English diarized transcript
        // Note: createJob() does NOT pass mode to the API. Use initialise() directly so
        // mode: "translate" is sent, matching Sarvam's playground and producing English output.
        const initRes = await sarvamClient.speechToTextJob.initialise({
            job_parameters: {
                model: "saaras:v3",
                mode: "translate",
                language_code: "unknown",
                with_diarization: true,
                with_timestamps: false,
                num_speakers: numSpeakers,
            },
        });
        const jobId = (initRes as { job_id?: string }).job_id;
        if (!jobId) {
            throw new TranscriptionError("Sarvam job init did not return job_id", {
                service: "SarvamAI",
            });
        }
        const translateJob = sarvamClient.speechToTextJob.getJob(jobId);

        await translateJob.uploadFiles([tempFilePath]);
        await translateJob.start();
        await translateJob.waitUntilComplete();

        const translateOutputDir = path.join(workDir, "translate-output");
        await translateJob.downloadOutputs(translateOutputDir);

        const translateJson = await readFirstJsonFile(translateOutputDir);

        // Optional second job: original-language transcription (non-diarized)
        let originalTranscript: string | null = null;
        let originalLanguageCode: string | undefined = undefined;

        if (requestedMode === "auto") {
            const transcribeJob = await sarvamClient.speechToTextJob.createJob({
                ...(baseJobParams as any),
                mode: "transcribe",
            } as any);

            await transcribeJob.uploadFiles([tempFilePath]);
            await transcribeJob.start();
            await transcribeJob.waitUntilComplete();

            const transcribeOutputDir = path.join(workDir, "transcribe-output");
            await transcribeJob.downloadOutputs(transcribeOutputDir);

            const transcribeJson = await readFirstJsonFile(transcribeOutputDir);
            originalTranscript = transcribeJson.transcript ?? null;
            originalLanguageCode = transcribeJson.language_code;
        }

        const diarizedEntries: SarvamDiarizedEntry[] =
            translateJson.diarized_transcript?.entries || [];

        // With mode: "translate", the batch job already returns English in entry.transcript.
        // No per-segment translation needed; use it directly.
        const segments = diarizedEntries.map((entry) => ({
            speaker_id: entry.speaker_id,
            speaker_label: `Speaker ${Number(entry.speaker_id) + 1}`,
            start_time_seconds: entry.start_time_seconds,
            end_time_seconds: entry.end_time_seconds,
            text_original: entry.transcript,
            text_english: entry.transcript,
        }));

        const responseBody = {
            language_code:
                originalLanguageCode ??
                translateJson.language_code ??
                "unknown",
            original_transcript: originalTranscript,
            english_transcript: translateJson.transcript ?? null,
            segments,
        };

        return NextResponse.json(responseBody);
    } catch (error: unknown) {
        logger.error(
            "SarvamAI transcription error",
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
                "Failed to clean up SarvamAI temp directory",
                cleanupError instanceof Error
                    ? cleanupError
                    : new Error(String(cleanupError)),
                { workDir }
            );
        }
    }
}
