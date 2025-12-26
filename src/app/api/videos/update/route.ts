import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH - Update video properties (like fileName/session name)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoId, fileName, duration_seconds, provider_video_id } = body;

        if (!videoId) {
            return NextResponse.json(
                { error: "Video ID is required" },
                { status: 400 }
            );
        }

        // Build update data object with only provided fields
        const updateData: Record<string, any> = {};
        if (fileName !== undefined) updateData.fileName = fileName;
        if (duration_seconds !== undefined) updateData.duration_seconds = duration_seconds;
        if (provider_video_id !== undefined) updateData.provider_video_id = provider_video_id;

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json(
                { error: "No update fields provided" },
                { status: 400 }
            );
        }

        // @ts-ignore
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

    } catch (error: any) {
        console.error("Update video error:", error);
        
        if (error.code === 'P2025') {
            return NextResponse.json(
                { error: "Video not found" },
                { status: 404 }
            );
        }
        
        return NextResponse.json(
            { error: error.message || "Failed to update video" },
            { status: 500 }
        );
    }
}

