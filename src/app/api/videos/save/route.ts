import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { 
            // New fields (per documentation)
            source_type,      // youtube | s3 | local_upload | external_url
            source_url,       // Canonical URL (required)
            provider_video_id, // Optional, e.g. YouTube ID
            duration_seconds,  // Optional, video duration
            
            // Legacy fields (for backward compatibility)
            fileName,
            fileKey,
            fileUrl,
            fileSize
        } = body;

        // Validate required fields
        if (!source_url && !fileUrl) {
            return NextResponse.json(
                { error: "Missing required field: source_url or fileUrl" },
                { status: 400 }
            );
        }

        // Determine source_type if not provided
        const finalSourceType = source_type || 
            (fileKey ? "s3" : 
             (source_url?.includes("youtube.com") || source_url?.includes("youtu.be") ? "youtube" : 
              (source_url ? "external_url" : "local_upload")));

        // Use source_url or fileUrl as canonical URL
        const canonicalUrl = source_url || fileUrl || "";

        // Check if video already exists by source_url or fileKey
        // @ts-ignore - Prisma types generated at runtime (will be available after prisma generate)
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
            // Update existing video
            // @ts-ignore - Prisma types generated at runtime (will be available after prisma generate)
            const video = await prisma.video.update({
                where: { id: existingVideo.id },
                data: {
                    // @ts-ignore
                    source_type: finalSourceType,
                    // @ts-ignore
                    source_url: canonicalUrl,
                    // @ts-ignore
                    provider_video_id: provider_video_id || (existingVideo as any).provider_video_id,
                    // @ts-ignore
                    duration_seconds: duration_seconds ?? (existingVideo as any).duration_seconds,
                    // Legacy fields
                    fileName: fileName || existingVideo.fileName,
                    fileKey: fileKey || existingVideo.fileKey,
                    fileUrl: fileUrl || existingVideo.fileUrl,
                    fileSize: fileSize ? BigInt(fileSize) : existingVideo.fileSize,
                    updatedAt: new Date(),
                },
            });

            return NextResponse.json({
                success: true,
                video: {
                    ...video,
                    fileSize: video.fileSize?.toString(),
                },
            });
        }

        // Create new video record
        // @ts-ignore - Prisma types generated at runtime (will be available after prisma generate)
        const video = await prisma.video.create({
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
                fileSize: fileSize ? BigInt(fileSize) : undefined,
            },
        });

        return NextResponse.json({
            success: true,
            video: {
                ...video,
                fileSize: video.fileSize?.toString(),
            },
        });

    } catch (error: any) {
        console.error("Save video error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to save video" },
            { status: 500 }
        );
    }
}

