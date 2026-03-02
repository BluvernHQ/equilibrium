import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        const transcription = await prisma.transcript.findFirst({
            where: { video_id: videoId },
            orderBy: { created_at: 'desc' },
            include: {
                video: {
                    select: {
                        id: true,
                        fileName: true,
                        fileUrl: true,
                        fileKey: true,
                    },
                },
            },
        });

        if (!transcription) {
            throw new NotFoundError("Transcription not found", "transcript");
        }

        return NextResponse.json({
            success: true,
            transcription,
        });
    } catch (error: unknown) {
        if (error instanceof NotFoundError) {
            return handleError(error);
        }
        logger.error(
            "Get transcription failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/transcriptions/[videoId]" }
        );
        return handleError(error);
    }
}

