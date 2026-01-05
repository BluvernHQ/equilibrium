import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        // Verify video exists
        // @ts-ignore - Prisma types generated at runtime
        const video = await prisma.video.findUnique({
            where: { id: videoId },
        });

        if (!video) {
            return NextResponse.json(
                { error: "Video not found" },
                { status: 404 }
            );
        }

        // Delete all transcripts for this video (cascade will handle blocks, sections, etc.)
        // @ts-ignore - Prisma types generated at runtime
        const deleteResult = await prisma.transcript.deleteMany({
            where: { video_id: videoId },
        });

        return NextResponse.json({
            success: true,
            message: "Transcription deleted successfully",
            deletedCount: deleteResult.count,
        });

    } catch (error: any) {
        console.error("Delete transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete transcription" },
            { status: 500 }
        );
    }
}

