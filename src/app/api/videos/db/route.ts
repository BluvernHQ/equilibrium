import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const includeTranscripts = searchParams.get("includeTranscripts") === "true";
        const includeBlocks = searchParams.get("includeBlocks") === "true";

        // @ts-ignore - Prisma types generated at runtime (will be available after prisma generate)
        const videos = await prisma.video.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                // @ts-ignore
                transcripts: includeTranscripts ? {
                    orderBy: { version: 'desc' },
                    take: 1, // Get only the latest transcript
                    include: {
                        blocks: includeBlocks ? {
                            orderBy: { order_index: 'asc' },
                        } : false,
                        _count: {
                            select: { blocks: true },
                        },
                    },
                } : {
                    select: {
                        id: true,
                        version: true,
                        created_at: true,
                        _count: {
                            select: { blocks: true },
                        },
                    },
                    orderBy: { version: 'desc' },
                    take: 1,
                },
            },
        });

        // Format the response efficiently
        const formattedVideos = videos.map((video: any) => ({
            id: video.id,
            // New fields (per documentation)
            source_type: video.source_type,
            source_url: video.source_url,
            provider_video_id: video.provider_video_id,
            duration_seconds: video.duration_seconds,
            // Legacy fields
            fileName: video.fileName,
            fileKey: video.fileKey,
            fileUrl: video.fileUrl,
            fileSize: video.fileSize?.toString(),
            // Timestamps
            createdAt: video.createdAt.toISOString(),
            updatedAt: video.updatedAt.toISOString(),
            // Transcript info
            hasTranscript: video.transcripts.length > 0,
            latestTranscript: video.transcripts[0] ? {
                id: video.transcripts[0].id,
                version: video.transcripts[0].version,
                language: video.transcripts[0].language,
                transcription_type: video.transcripts[0].transcription_type,
                created_at: video.transcripts[0].created_at.toISOString(),
                blocks_count: video.transcripts[0]._count?.blocks || video.transcripts[0].blocks?.length || 0,
                ...(includeBlocks && video.transcripts[0].blocks ? {
                    blocks: video.transcripts[0].blocks.map((block: any) => ({
                        id: block.id,
                        speaker_label: block.speaker_label,
                        start_time_seconds: block.start_time_seconds,
                        end_time_seconds: block.end_time_seconds,
                        text: block.text,
                        order_index: block.order_index,
                    })),
                } : {}),
            } : null,
        }));

        return NextResponse.json({
            success: true,
            videos: formattedVideos,
            count: formattedVideos.length,
        });

    } catch (error: any) {
        console.error("Get videos from DB error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get videos" },
            { status: 500 }
        );
    }
}

