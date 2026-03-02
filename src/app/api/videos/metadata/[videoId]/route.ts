import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, NotFoundError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// GET - Get video by ID
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        // Use a simpler query first to avoid complex include/select issues
        // @ts-ignore
        const video = await prisma.video.findUnique({
            where: { id: videoId }
        });

        if (!video) {
            return NextResponse.json(
                { error: "Video not found" },
                { status: 404 }
            );
        }

        // Get transcript count separately to be safe
        // @ts-ignore
        const latestTranscript = await prisma.transcript.findFirst({
            where: { video_id: videoId },
            orderBy: { version: 'desc' },
            select: {
                id: true,
                version: true,
                language: true,
                transcription_type: true,
                created_at: true
            }
        });

        return NextResponse.json({
            success: true,
            video: {
                id: video.id,
                fileName: video.fileName,
                source_type: video.source_type,
                source_url: video.source_url,
                fileUrl: video.fileUrl,
                createdAt: video.createdAt ? video.createdAt.toISOString() : new Date().toISOString(),
                hasTranscript: !!latestTranscript,
                latestTranscript: latestTranscript || null,
            },
        });
    } catch (error: any) {
        console.error("Get video metadata error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get video" },
            { status: 500 }
        );
    }
}

// PATCH - Update video metadata (including name)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;
        const body = await req.json();
        const { fileName, duration_seconds } = body;

        // Build update data
        const updateData: any = {};
        
        if (fileName !== undefined) {
            updateData.fileName = fileName;
        }
        
        if (duration_seconds !== undefined) {
            updateData.duration_seconds = duration_seconds;
        }

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError("No fields to update", { allowed: ["fileName", "duration_seconds"] });
        }

        const video = await prisma.video.update({
            where: { id: videoId },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            video: {
                id: video.id,
                fileName: video.fileName,
                source_type: video.source_type,
                source_url: video.source_url,
                duration_seconds: video.duration_seconds,
                updatedAt: video.updatedAt.toISOString(),
            },
        });
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return handleError(error);
        }
        if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
            return handleError(new NotFoundError("Video not found", "video"));
        }
        logger.error(
            "Update video failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/videos/metadata/[videoId]" }
        );
        return handleError(error);
    }
}

