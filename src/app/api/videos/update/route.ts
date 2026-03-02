import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, ValidationError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// PATCH - Update video properties (like fileName/session name)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoId, fileName, duration_seconds, provider_video_id } = body;

        if (!videoId) {
            throw new ValidationError("Video ID is required", { field: "videoId" });
        }

        // Build update data object with only provided fields
        const updateData: Record<string, any> = {};
        if (fileName !== undefined) updateData.fileName = fileName;
        if (duration_seconds !== undefined) updateData.duration_seconds = duration_seconds;
        if (provider_video_id !== undefined) updateData.provider_video_id = provider_video_id;

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError("No update fields provided", {
                allowed: ["fileName", "duration_seconds", "provider_video_id"],
            });
        }

        const updatedVideo = await prisma.video.update({
            where: { id: videoId },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            video: {
                id: updatedVideo.id,
                fileName: updatedVideo.fileName,
                source_url: updatedVideo.source_url,
                source_type: updatedVideo.source_type,
                duration_seconds: updatedVideo.duration_seconds,
                updatedAt: updatedVideo.updatedAt.toISOString(),
            },
        });

    } catch (error: unknown) {
        if (
            error instanceof ValidationError ||
            error instanceof NotFoundError
        ) {
            return handleError(error);
        }
        if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
            return handleError(new NotFoundError("Video not found", "video"));
        }
        logger.error(
            "Update video failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/videos/update" }
        );
        return handleError(error);
    }
}

