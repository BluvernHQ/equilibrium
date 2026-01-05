import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface TranscriptBlockData {
    speaker_label?: string;
    start_time_seconds?: number;
    end_time_seconds?: number;
    text: string;
    // Legacy format support
    speaker?: string;
    start?: number;
    end?: number;
    words?: Array<{ start: number; end: number; text: string }>;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { 
            videoId, // Optional - if provided, use existing video
            videoMetadata, // Optional - video info to create if videoId not provided
            transcriptData, // Can be array of blocks or AssemblyAI format
            transcriptionType = "auto",
            language = "en",
            speakerData // Optional - array of speaker information with avatars
        } = body;

        if (!transcriptData) {
            return NextResponse.json(
                { error: "Missing required field: transcriptData" },
                { status: 400 }
            );
        }

        // If videoId provided, verify video exists
        // Otherwise, create video from metadata
        let video;
        let finalVideoId: string;

        if (videoId) {
            // @ts-ignore - Prisma types generated at runtime
            video = await prisma.video.findUnique({
                where: { id: videoId },
            });

            if (!video) {
                return NextResponse.json(
                    { error: "Video not found" },
                    { status: 404 }
                );
            }
            
            // If video exists and we have videoMetadata, update it to ensure video URL is current
            if (body.videoMetadata && video) {
                const { source_url, fileUrl, fileKey, source_type, fileName } = body.videoMetadata;
                const urlToSave = source_url || fileUrl;
                
                // Build update data - only include fields that are provided
                const updateData: any = {};
                if (urlToSave) {
                    updateData.source_url = urlToSave;
                }
                if (source_type) {
                    updateData.source_type = source_type;
                } else if (fileKey && !(video as any).source_type) {
                    updateData.source_type = "s3";
                }
                if (fileUrl) {
                    updateData.fileUrl = fileUrl;
                }
                if (fileKey) {
                    updateData.fileKey = fileKey;
                }
                if (fileName) {
                    updateData.fileName = fileName;
                }
                
                // Only update if we have something to update
                if (Object.keys(updateData).length > 0) {
                    // @ts-ignore
                    video = await prisma.video.update({
                        where: { id: videoId },
                        data: updateData,
                    });
                }
            }
            
            finalVideoId = videoId;
        } else if (videoMetadata) {
            // Create video from metadata
            const { fileName, fileKey, fileUrl, fileSize, source_type, source_url, provider_video_id, duration_seconds } = videoMetadata;
            
            if (!fileUrl && !source_url) {
                return NextResponse.json(
                    { error: "Missing video URL in metadata" },
                    { status: 400 }
                );
            }

            // Determine source_type if not provided
            const finalSourceType = source_type || 
                (fileKey ? "s3" : 
                 (source_url?.includes("youtube.com") || source_url?.includes("youtu.be") ? "youtube" : 
                  (source_url ? "external_url" : "local_upload")));

            const canonicalUrl = source_url || fileUrl || "";

            // Check if video already exists
            // @ts-ignore
            const existingVideo = await prisma.video.findFirst({
                where: {
                    OR: [
                        // @ts-ignore
                        { source_url: canonicalUrl },
                        ...(fileKey ? [{ fileKey }] : [])
                    ]
                },
            });

            if (existingVideo) {
                video = existingVideo;
                finalVideoId = existingVideo.id;
            } else {
                // Create new video
                // @ts-ignore
                video = await prisma.video.create({
                    data: {
                        // @ts-ignore
                        source_type: finalSourceType,
                        // @ts-ignore
                        source_url: canonicalUrl,
                        // @ts-ignore
                        provider_video_id,
                        // @ts-ignore
                        duration_seconds,
                        // Legacy fields
                        fileName: fileName || null,
                        fileKey: fileKey || null,
                        fileUrl: fileUrl || null,
                        fileSize: fileSize ? BigInt(fileSize) : null,
                    },
                });
                finalVideoId = video.id;
            }
        } else {
            return NextResponse.json(
                { error: "Missing videoId or videoMetadata" },
                { status: 400 }
            );
        }

        // Get the latest transcript version for this video
        // @ts-ignore - Prisma types generated at runtime
        const latestTranscript = await prisma.transcript.findFirst({
            where: { video_id: finalVideoId },
            orderBy: { version: 'desc' },
        });

        // Create new version (immutability principle)
        const newVersion = latestTranscript ? latestTranscript.version + 1 : 1;

        // Normalize transcript data into blocks
        let blocks: TranscriptBlockData[] = [];
        
        if (Array.isArray(transcriptData)) {
            // Check if it's the formatted data format from SessionContext
            // Format: { id, name, time, text, startTime, endTime }
            if (transcriptData.length > 0 && 'startTime' in transcriptData[0] && 'name' in transcriptData[0]) {
                // Convert from SessionContext formattedData format
                blocks = transcriptData.map((entry: any) => ({
                    speaker_label: entry.name || entry.speaker_label,
                    start_time_seconds: entry.startTime ?? entry.start_time_seconds,
                    end_time_seconds: entry.endTime ?? entry.end_time_seconds,
                    text: entry.text,
                }));
            } else {
                // Already in block format
                blocks = transcriptData;
            }
        } else if (transcriptData.utterances) {
            // AssemblyAI format with utterances
            blocks = transcriptData.utterances.map((utterance: any) => ({
                speaker_label: utterance.speaker || `Speaker ${utterance.speaker || 'A'}`,
                start_time_seconds: utterance.start / 1000, // Convert ms to seconds
                end_time_seconds: utterance.end / 1000,
                text: utterance.text,
            }));
        } else if (transcriptData.words) {
            // AssemblyAI format with words - group into sentences
            const words = transcriptData.words;
            let currentBlock: TranscriptBlockData = { text: "" };
            blocks = [];
            
            for (const word of words) {
                if (!currentBlock.start_time_seconds) {
                    currentBlock.start_time_seconds = word.start / 1000;
                    currentBlock.speaker_label = word.speaker ? `Speaker ${word.speaker}` : undefined;
                }
                currentBlock.text += (currentBlock.text ? " " : "") + word.text;
                currentBlock.end_time_seconds = word.end / 1000;
                
                // Break on sentence endings
                if (word.text.match(/[.!?]$/)) {
                    blocks.push(currentBlock);
                    currentBlock = { text: "" };
                }
            }
            if (currentBlock.text) {
                blocks.push(currentBlock);
            }
        } else if (transcriptData.text) {
            // Simple text format - split into sentences
            const sentences = transcriptData.text.split(/([.!?]\s+)/);
            let currentTime = 0;
            blocks = sentences
                .filter((s: string) => s.trim())
                .map((sentence: string, index: number) => {
                    const block = {
                        text: sentence.trim(),
                        start_time_seconds: currentTime,
                        end_time_seconds: currentTime + (sentence.length * 0.1), // Rough estimate
                        order_index: index,
                    };
                    currentTime = block.end_time_seconds;
                    return block;
                });
        }

        // Create transcript and blocks in a transaction
        // @ts-ignore - Prisma types generated at runtime (will be available after prisma generate)
        const transcript = await prisma.$transaction(async (tx: any) => {
            // Create transcript
            const newTranscript = await tx.transcript.create({
                data: {
                    video_id: finalVideoId,
                    version: newVersion,
                    language,
                    transcription_type: transcriptionType,
                },
            });

            // Create blocks
            const createdBlocks = await Promise.all(
                blocks.map((block: TranscriptBlockData, index: number) => 
                    tx.transcriptBlock.create({
                        data: {
                            transcript_id: newTranscript.id,
                            speaker_label: block.speaker_label || block.speaker,
                            start_time_seconds: block.start_time_seconds ?? block.start,
                            end_time_seconds: block.end_time_seconds ?? block.end,
                            text: block.text,
                            order_index: index,
                        },
                    })
                )
            );

            // Save speaker data with avatars if provided
            if (speakerData && Array.isArray(speakerData) && speakerData.length > 0) {
                try {
                    // Check if Speaker model exists in Prisma client
                    // Prisma converts model names: Speaker -> speaker (lowercase first letter)
                    const prismaClient = tx as any;
                    
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
                        // Fallback: Use raw SQL to insert/update speakers
                        console.warn("Speaker model not available in Prisma client. Using raw SQL fallback.");
                        await Promise.all(
                            speakerData.map(async (speaker: any) => {
                                const speakerLabel = speaker.speaker_label || speaker.name;
                                // Use raw SQL to upsert speaker
                                await tx.$executeRaw`
                                    INSERT INTO "Speaker" (id, video_id, name, speaker_label, avatar_url, avatar_key, is_moderator, created_at, updated_at)
                                    VALUES (gen_random_uuid(), ${finalVideoId}::uuid, ${speaker.name}, ${speakerLabel}, ${speaker.avatar_url || null}, ${speaker.avatar_key || null}, ${speaker.is_moderator || false}, NOW(), NOW())
                                    ON CONFLICT (video_id, speaker_label) 
                                    DO UPDATE SET 
                                        name = EXCLUDED.name,
                                        avatar_url = EXCLUDED.avatar_url,
                                        avatar_key = EXCLUDED.avatar_key,
                                        is_moderator = EXCLUDED.is_moderator,
                                        updated_at = NOW()
                                `;
                            })
                        );
                        console.log(`Successfully saved ${speakerData.length} speaker(s) using raw SQL, including ${speakerData.filter((s: any) => s.is_moderator).length} moderator(s)`);
                    } else {
                        await Promise.all(
                            speakerData.map((speaker: any) => {
                                const speakerLabel = speaker.speaker_label || speaker.name;
                                // Upsert speaker (create or update)
                                return SpeakerModel.upsert({
                                    where: {
                                        video_id_speaker_label: {
                                            video_id: finalVideoId,
                                            speaker_label: speakerLabel,
                                        },
                                    },
                                    create: {
                                        video_id: finalVideoId,
                                        name: speaker.name,
                                        speaker_label: speakerLabel,
                                        avatar_url: speaker.avatar_url || null,
                                        avatar_key: speaker.avatar_key || null,
                                        is_moderator: speaker.is_moderator || false,
                                    },
                                    update: {
                                        name: speaker.name,
                                        avatar_url: speaker.avatar_url !== undefined ? speaker.avatar_url : undefined,
                                        avatar_key: speaker.avatar_key !== undefined ? speaker.avatar_key : undefined,
                                        is_moderator: speaker.is_moderator !== undefined ? speaker.is_moderator : undefined,
                                    },
                                });
                            })
                        );
                        console.log(`Successfully saved ${speakerData.length} speaker(s) including ${speakerData.filter((s: any) => s.is_moderator).length} moderator(s)`);
                    }
                } catch (speakerError: any) {
                    // If Speaker table doesn't exist yet, log warning but don't fail the save
                    console.error("Could not save speakers:", speakerError.message);
                    console.error("Speaker error details:", {
                        error: speakerError,
                        stack: speakerError.stack,
                    });
                }
            }

            return {
                ...newTranscript,
                blocks: createdBlocks,
            };
        });

        return NextResponse.json({
            success: true,
            transcript: {
                id: transcript.id,
                video_id: finalVideoId,
                version: transcript.version,
                language: transcript.language,
                transcription_type: transcript.transcription_type,
                created_at: transcript.created_at,
                blocks_count: transcript.blocks.length,
            },
            video_id: finalVideoId, // Also return at top level for convenience
        });

    } catch (error: any) {
        console.error("Save transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save transcription" },
            { status: 500 }
        );
    }
}

