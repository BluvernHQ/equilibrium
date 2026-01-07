import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
            return NextResponse.json(
                { error: "No fields to update" },
                { status: 400 }
            );
        }

        // @ts-ignore
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

