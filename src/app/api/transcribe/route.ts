import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";
import {
    ValidationError,
    TranscriptionError,
    ExternalServiceError,
    handleError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
    try {
        // Validate API key
        if (!process.env.ASSEMBLYAI_API_KEY) {
            throw new ExternalServiceError(
                "AssemblyAI API key is not configured",
                "AssemblyAI"
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const videoUrl = formData.get("videoUrl") as string;

        let uploadUrl: string;

        if (file) {
            // Validate file size (e.g., max 500MB)
            const maxSize = 500 * 1024 * 1024; // 500MB
            if (file.size > maxSize) {
                throw new ValidationError("File size exceeds maximum allowed size", {
                    field: "file",
                    maxSize: `${maxSize / (1024 * 1024)}MB`,
                    actualSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`,
                });
            }

            logger.info("Uploading file to AssemblyAI", {
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
            });

            // Handle file upload (from direct upload)
            // Convert File to Buffer
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Upload the file to AssemblyAI
            uploadUrl = await client.files.upload(buffer);
            
            logger.externalService("AssemblyAI", "file_upload", {
                uploadUrl: uploadUrl.substring(0, 50) + "...",
            });
        } else if (videoUrl) {
            // Validate URL format
            try {
                new URL(videoUrl);
            } catch {
                throw new ValidationError("Invalid video URL format", {
                    field: "videoUrl",
                    value: videoUrl,
                });
            }
            
            // Handle video URL (from recordings page)
            // AssemblyAI can transcribe directly from a public URL
            uploadUrl = videoUrl;
            
            logger.info("Using video URL for transcription", {
                videoUrl: videoUrl.substring(0, 100) + "...",
            });
        } else {
            throw new ValidationError("No file or video URL provided", {
                required: ["file", "videoUrl"],
            });
        }

        // Start Transcription with Speaker Diarization
        const config = {
            audio: uploadUrl, // The URL (either from upload or direct URL)
            speaker_labels: true,
        };

        logger.externalService("AssemblyAI", "transcribe_start", {
            audioUrl: uploadUrl.substring(0, 50) + "...",
        });

        const transcript = await client.transcripts.transcribe(config);
        
        logger.externalService("AssemblyAI", "transcribe_complete", {
            transcriptId: transcript.id,
            status: transcript.status,
        });

        return NextResponse.json(transcript);

    } catch (error: unknown) {
        // If it's already a structured error, it will be handled properly
        if (error instanceof ValidationError || 
            error instanceof TranscriptionError || 
            error instanceof ExternalServiceError) {
            logger.error(
                "Transcription error",
                error,
                { endpoint: "/api/transcribe" }
            );
            return handleError(error);
        }

        // Handle AssemblyAI specific errors
        if (error && typeof error === 'object' && 'message' in error) {
            const aiError = error as { message: string; status?: number };
            
            logger.error(
                "AssemblyAI transcription error",
                new Error(aiError.message),
                {
                    endpoint: "/api/transcribe",
                    status: aiError.status,
                }
            );

            throw new TranscriptionError(
                `Transcription failed: ${aiError.message}`,
                { service: "AssemblyAI", status: aiError.status }
        );
        }

        logger.error(
            "Unexpected transcription error",
            error instanceof Error ? error : new Error(String(error)),
            { endpoint: "/api/transcribe" }
        );
        
        return handleError(error);
    }
}
