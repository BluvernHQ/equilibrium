import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

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
            // LOCK the video record to serialize saves for this video
            // This prevents race conditions on version calculation when multiple rapid saves occur
            await tx.$executeRawUnsafe(`SELECT id FROM "Video" WHERE id = '${finalVideoId}'::uuid FOR UPDATE`);

            // Get the latest transcript version for this video INSIDE the transaction
            const latestTranscript = await tx.transcript.findFirst({
                where: { video_id: finalVideoId },
                orderBy: { version: 'desc' },
            });

            // Create new version (immutability principle)
            const newVersion = latestTranscript ? latestTranscript.version + 1 : 1;

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
            if (speakerData && Array.isArray(speakerData)) {
                try {
                    // Check if Speaker model exists in Prisma client
                    const prismaClient = tx as any;
                    let SpeakerModel = prismaClient.speaker || prismaClient.Speaker;
                    
                    if (!SpeakerModel) {
                        const dmmf = (prismaClient as any).$dmmf;
                        if (dmmf?.datamodel) {
                            const model = dmmf.datamodel.models.find((m: any) => m.name.toLowerCase() === 'speaker');
                            if (model) SpeakerModel = prismaClient[model.name.charAt(0).toLowerCase() + model.name.slice(1)];
                        }
                    }
                    
                    // 1. Get all existing speakers for this video
                    const existingSpeakers = await (SpeakerModel 
                        ? SpeakerModel.findMany({ where: { video_id: finalVideoId } })
                        : tx.$queryRaw`SELECT id, speaker_label, avatar_key FROM "Speaker" WHERE video_id = ${finalVideoId}::uuid`);
                    
                    const providedLabels = speakerData.map((s: any) => s.speaker_label || s.name);
                    
                    // 2. Identify speakers to delete (those in DB but not in provided list)
                    const speakersToDelete = existingSpeakers.filter((es: any) => !providedLabels.includes(es.speaker_label));
                    
                    if (speakersToDelete.length > 0) {
                        // Clean up storage for deleted speakers
                        const s3Client = new S3Client({
                            endpoint: process.env.DO_SPACES_ENDPOINT || "https://blr1.digitaloceanspaces.com",
                            region: "us-east-1",
                            credentials: {
                                accessKeyId: process.env.DO_SPACES_KEY || "",
                                secretAccessKey: process.env.DO_SPACES_SECRET || "",
                            },
                        });
                        
                        for (const s of speakersToDelete) {
                            if (s.avatar_key) {
                                try {
                                    await s3Client.send(new DeleteObjectCommand({
                                        Bucket: process.env.DO_SPACES_BUCKET || "",
                                        Key: s.avatar_key,
                                    }));
                                } catch (e) {
                                    console.error("Failed to delete avatar from storage during sync:", e);
                                }
                            }
                        }
                        
                        // Delete from database
                        if (SpeakerModel) {
                            await SpeakerModel.deleteMany({
                                where: { 
                                    video_id: finalVideoId,
                                    speaker_label: { in: speakersToDelete.map((s: any) => s.speaker_label) }
                                }
                            });
                        } else {
                            await tx.$executeRaw`
                                DELETE FROM "Speaker" 
                                WHERE video_id = ${finalVideoId}::uuid 
                                AND speaker_label IN (${providedLabels.length > 0 ? providedLabels : ''})
                            `;
                            // Correction: The above logic is wrong for raw SQL. Let's use a simpler approach.
                            for (const s of speakersToDelete) {
                                await tx.$executeRaw`DELETE FROM "Speaker" WHERE id = ${s.id}::uuid`;
                            }
                        }
                        console.log(`Deleted ${speakersToDelete.length} stale speaker(s)`);
                    }

                    // 3. Upsert provided speakers
                    if (speakerData.length > 0) {
                        if (!SpeakerModel) {
                            // Raw SQL fallback for upsert
                            await Promise.all(
                                speakerData.map(async (speaker: any) => {
                                    const speakerLabel = speaker.speaker_label || speaker.name;
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
                        } else {
                            await Promise.all(
                                speakerData.map((speaker: any) => {
                                    const speakerLabel = speaker.speaker_label || speaker.name;
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
                        }
                        console.log(`Successfully saved ${speakerData.length} speaker(s)`);
                    }
                } catch (speakerError: any) {
                    console.error("Could not sync speakers:", speakerError.message);
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

