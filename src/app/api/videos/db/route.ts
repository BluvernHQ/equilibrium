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
                            select: {
                                blocks: true,
                                tag_impressions: true, // Count tag impressions to determine hasSession
                            },
                        },
                    },
                } : {
                    select: {
                        id: true,
                        version: true,
                        created_at: true,
                        transcription_type: true, // Include transcription type
                        _count: {
                            select: {
                                blocks: true,
                                tag_impressions: true, // Count tag impressions to determine hasSession
                            },
                        },
                    },
                    orderBy: { version: 'desc' },
                    take: 1,
                },
            },
        });

        // Format the response efficiently
        const formattedVideos = videos.map((video: any) => {
            const latestTranscript = video.transcripts[0];
            const tagImpressionCount = latestTranscript?._count?.tag_impressions || 0;

            return {
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
                // Session info - true when tagging has been started
                hasSession: tagImpressionCount > 0,
                latestTranscript: latestTranscript ? {
                    id: latestTranscript.id,
                    version: latestTranscript.version,
                    language: latestTranscript.language,
                    transcription_type: latestTranscript.transcription_type,
                    created_at: latestTranscript.created_at.toISOString(),
                    blocks_count: latestTranscript._count?.blocks || latestTranscript.blocks?.length || 0,
                    tag_impressions_count: tagImpressionCount,
                    ...(includeBlocks && latestTranscript.blocks ? {
                        blocks: latestTranscript.blocks.map((block: any) => ({
                            id: block.id,
                            speaker_label: block.speaker_label,
                            start_time_seconds: block.start_time_seconds,
                            end_time_seconds: block.end_time_seconds,
                            text: block.text,
                            order_index: block.order_index,
                        })),
                    } : {}),
                } : null,
            };
        });

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

