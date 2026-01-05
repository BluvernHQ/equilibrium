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
                fileKey: true,
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

        // Get speaker data with avatars for this video
        let speakers: any[] = [];
        try {
            // Check if Speaker model exists in Prisma client
            // Prisma converts model names: Speaker -> speaker (lowercase first letter)
            const prismaClient = prisma as any;
            
            // Try different possible model name variations
            let SpeakerModel = prismaClient.speaker;
            if (!SpeakerModel) {
                // Try capitalized version
                SpeakerModel = prismaClient.Speaker;
            }
            if (!SpeakerModel) {
                // Try accessing via $dmmf (Data Model Meta Format) to find the actual name
                const dmmf = (prismaClient as any).$dmmf;
                if (dmmf && dmmf.datamodel) {
                    const speakerModel = dmmf.datamodel.models.find((m: any) => 
                        m.name.toLowerCase() === 'speaker'
                    );
                    if (speakerModel) {
                        SpeakerModel = prismaClient[speakerModel.name.charAt(0).toLowerCase() + speakerModel.name.slice(1)];
                    }
                }
            }
            
            if (!SpeakerModel) {
                // Fallback: Use raw SQL to load speakers
                console.warn("Speaker model not available in Prisma client. Using raw SQL fallback.");
                const rawSpeakers = await prisma.$queryRaw<any[]>`
                    SELECT id, name, speaker_label, avatar_url, avatar_key, is_moderator
                    FROM "Speaker"
                    WHERE video_id = ${videoId}::uuid
                `;
                speakers = rawSpeakers.map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    speaker_label: s.speaker_label,
                    avatar_url: s.avatar_url,
                    avatar_key: s.avatar_key,
                    is_moderator: s.is_moderator,
                }));
                console.log(`Loaded ${speakers.length} speaker(s) using raw SQL, including ${speakers.filter((s: any) => s.is_moderator).length} moderator(s) for video ${videoId}`);
            } else {
                speakers = await SpeakerModel.findMany({
                    where: { video_id: videoId },
                    select: {
                        id: true,
                        name: true,
                        speaker_label: true,
                        avatar_url: true,
                        avatar_key: true,
                        is_moderator: true,
                    },
                });
                console.log(`Loaded ${speakers.length} speaker(s) including ${speakers.filter((s: any) => s.is_moderator).length} moderator(s) for video ${videoId}`);
            }
        } catch (speakerError: any) {
            // If Speaker table doesn't exist yet or there's an error, just use empty array
            console.error("Could not load speakers:", speakerError.message);
            console.error("Speaker error details:", {
                error: speakerError,
                stack: speakerError.stack,
            });
            speakers = [];
        }

        if (!transcript) {
            return NextResponse.json(
                { error: "Transcript not found" },
                { status: 404 }
            );
        }

        // Format response efficiently - ensure we return fileKey for presigned URL generation
        return NextResponse.json({
            success: true,
            video: {
                id: video.id,
                fileName: video.fileName,
                source_url: video.source_url || video.fileUrl,
                fileUrl: video.fileUrl,
                fileKey: video.fileKey,
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
            speakers: speakers.map((speaker: any) => ({
                id: speaker.id,
                name: speaker.name,
                speaker_label: speaker.speaker_label,
                avatar_url: speaker.avatar_url,
                avatar_key: speaker.avatar_key,
                is_moderator: speaker.is_moderator,
            })),
        });

    } catch (error: any) {
        console.error("Load transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load transcription" },
            { status: 500 }
        );
    }
}

