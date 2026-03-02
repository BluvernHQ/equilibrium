import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        const video = await prisma.video.findUnique({
            where: { id: videoId },
        });

        if (!video) {
            throw new NotFoundError("Video not found", "video");
        }

        const deleteTranscriptResult = await prisma.transcript.deleteMany({
            where: { video_id: videoId },
        });

        const deleteSpeakerResult = await prisma.speaker.deleteMany({
            where: { video_id: videoId },
        });

        return NextResponse.json({
            success: true,
            message: "Transcription and speakers deleted successfully",
            deletedTranscriptsCount: deleteTranscriptResult.count,
            deletedSpeakersCount: deleteSpeakerResult.count,
        });
    } catch (error: unknown) {
        if (error instanceof NotFoundError) {
            return handleError(error);
        }
        logger.error(
            "Delete transcription failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/transcriptions/[videoId]/delete" }
        );
        return handleError(error);
    }
}

