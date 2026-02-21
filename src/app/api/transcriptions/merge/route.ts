import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoIds, folderId } = body;

        if (!videoIds || videoIds.length < 2) {
            return NextResponse.json(
                { error: "At least two video IDs are required for merging" },
                { status: 400 }
            );
        }

        // 1. Fetch all transcripts and their blocks
        // @ts-ignore
        const videos = await prisma.video.findMany({
            where: {
                id: { in: videoIds }
            },
            include: {
                transcripts: {
                    orderBy: { version: 'desc' },
                    take: 1,
                    include: {
                        blocks: {
                            orderBy: { order_index: 'asc' }
                        }
                    }
                }
            }
        });

        if (videos.length !== videoIds.length) {
            return NextResponse.json(
                { error: "Some videos were not found" },
                { status: 404 }
            );
        }

        // 2. Prepare the merged blocks
        const mergedBlocks: any[] = [];
        let currentOrderIndex = 0;

        // We'll prefix the text with the original video name to give context
        videos.forEach((video: any) => {
            const latestTranscript = video.transcripts[0];
            if (latestTranscript && latestTranscript.blocks) {
                // Add a header block for the video
                mergedBlocks.push({
                    speaker_label: "SYSTEM",
                    text: `--- START OF: ${video.fileName || video.id} ---`,
                    order_index: currentOrderIndex++,
                    start_time_seconds: 0,
                    end_time_seconds: 0,
                });

                latestTranscript.blocks.forEach((block: any) => {
                    mergedBlocks.push({
                        speaker_label: block.speaker_label,
                        text: block.text,
                        order_index: currentOrderIndex++,
                        start_time_seconds: block.start_time_seconds,
                        end_time_seconds: block.end_time_seconds,
                    });
                });
                
                mergedBlocks.push({
                    speaker_label: "SYSTEM",
                    text: `--- END OF: ${video.fileName || video.id} ---`,
                    order_index: currentOrderIndex++,
                    start_time_seconds: 0,
                    end_time_seconds: 0,
                });
            }
        });

        // 3. Create the "Virtual Video" for the merged transcript
        const dateStr = new Date().toLocaleDateString();
        const mergedVideoName = `Merged Transcription - ${dateStr} (${videos.length} items)`;

        // @ts-ignore
        const result = await prisma.$transaction(async (tx: any) => {
            // Create the virtual video record
            const newVideo = await tx.video.create({
                data: {
                    source_type: 'merged',
                    source_url: 'merged://' + uuidv4(), // Placeholder
                    fileName: mergedVideoName,
                    folder_id: folderId || null,
                }
            });

            // Create the transcript
            const newTranscript = await tx.transcript.create({
                data: {
                    video_id: newVideo.id,
                    version: 1,
                    language: 'en',
                    transcription_type: 'manual', // Merged is essentially manual/hybrid
                }
            });

            // Create all blocks
            await tx.transcriptBlock.createMany({
                data: mergedBlocks.map(block => ({
                    ...block,
                    transcript_id: newTranscript.id,
                }))
            });

            return newVideo;
        });

        return NextResponse.json({
            success: true,
            videoId: result.id,
            message: "Transcriptions merged successfully",
        });

    } catch (error: any) {
        console.error("Merge transcriptions error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to merge transcriptions" },
            { status: 500 }
        );
    }
}
