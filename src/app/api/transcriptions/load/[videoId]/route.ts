import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;
        const { searchParams } = new URL(req.url);
        const version = searchParams.get("version"); // Optional: get specific version

        // Get the video info first
        // @ts-ignore - Prisma types generated at runtime
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: {
                id: true,
                fileName: true,
                source_url: true,
                fileUrl: true,
                source_type: true,
            },
        });

        if (!video) {
            return NextResponse.json(
                { error: "Video not found" },
                { status: 404 }
            );
        }

        // Get the latest transcript (or specific version) for this video
        // @ts-ignore - Prisma types generated at runtime
        const transcript = await prisma.transcript.findFirst({
            where: {
                video_id: videoId,
                ...(version ? { version: parseInt(version) } : {}),
            },
            orderBy: version ? undefined : { version: 'desc' },
            include: {
                blocks: {
                    orderBy: { order_index: 'asc' },
                },
                sections: {
                    include: {
                        subsections: true,
                    },
                },
            },
        });

        if (!transcript) {
            return NextResponse.json(
                { error: "Transcript not found" },
                { status: 404 }
            );
        }

        // Format response efficiently
        return NextResponse.json({
            success: true,
            video: {
                id: video.id,
                fileName: video.fileName,
                source_url: video.source_url || video.fileUrl,
                source_type: video.source_type,
            },
            transcription: {
                id: transcript.id,
                video_id: transcript.video_id,
                version: transcript.version,
                language: transcript.language,
                transcription_type: transcript.transcription_type,
                created_at: transcript.created_at.toISOString(),
                blocks: transcript.blocks.map((block: any) => ({
                    id: block.id,
                    speaker_label: block.speaker_label,
                    start_time_seconds: block.start_time_seconds,
                    end_time_seconds: block.end_time_seconds,
                    text: block.text,
                    order_index: block.order_index,
                })),
                sections: transcript.sections.map((section: any) => ({
                    id: section.id,
                    name: section.name,
                    start_block_index: section.start_block_index,
                    end_block_index: section.end_block_index,
                    subsections: section.subsections,
                })),
                blocks_count: transcript.blocks.length,
            },
        });

    } catch (error: any) {
        console.error("Load transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load transcription" },
            { status: 500 }
        );
    }
}

