import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Format endpoint URL for S3 client
const formatEndpoint = (endpoint: string | undefined, originEndpoint: string | undefined, bucket: string | undefined, region: string): string => {
    if (endpoint) {
        let formatted = endpoint.replace(/^https?:\/\//, '');
        if (bucket && formatted.startsWith(`${bucket}.`)) {
            formatted = formatted.substring(bucket.length + 1);
        }
        return `https://${formatted}`;
    }
    
    if (originEndpoint) {
        let url = originEndpoint.replace(/^https?:\/\//, '');
        if (bucket && url.startsWith(`${bucket}.`)) {
            url = url.substring(bucket.length + 1);
        }
        return `https://${url}`;
    }
    
    return `https://${region}.digitaloceanspaces.com`;
};

// Create S3 client function
const createS3Client = (endpoint: string) => {
    const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
    const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;

    return new S3Client({
        endpoint: endpoint,
        region: "us-east-1",
        forcePathStyle: false,
        credentials: {
            accessKeyId: DO_SPACES_KEY || "",
            secretAccessKey: DO_SPACES_SECRET || "",
        },
    });
};

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        // Get video from database
        // @ts-ignore - Prisma types generated at runtime
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            include: {
                transcripts: {
                    include: {
                        blocks: true,
                        sections: {
                            include: {
                                subsections: true,
                            },
                        },
                    },
                },
            },
        });

        if (!video) {
            return NextResponse.json(
                { error: "Video not found" },
                { status: 404 }
            );
        }

        // Get speakers separately to delete their avatars
        // @ts-ignore - Prisma types generated at runtime
        const speakers = await (prisma as any).speaker.findMany({
            where: { video_id: videoId },
            select: {
                avatar_key: true,
            },
        });

        // Delete video file from Digital Ocean Spaces if fileKey exists
        if (video.fileKey) {
            try {
                const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
                const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
                const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
                const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

                if (DO_SPACES_BUCKET) {
                    const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
                    const s3Client = createS3Client(formattedEndpoint);

                    const deleteCommand = new DeleteObjectCommand({
                        Bucket: DO_SPACES_BUCKET,
                        Key: video.fileKey,
                    });

                    await s3Client.send(deleteCommand);
                    console.log(`Deleted video file: ${video.fileKey}`);
                }
            } catch (s3Error: any) {
                console.warn("Failed to delete video file from Spaces:", s3Error.message);
                // Continue with database deletion even if S3 deletion fails
            }
        }

        // Delete speaker avatars from Digital Ocean Spaces
        if (speakers && Array.isArray(speakers) && speakers.length > 0) {
            const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
            const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
            const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
            const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

            if (DO_SPACES_BUCKET) {
                const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
                const s3Client = createS3Client(formattedEndpoint);

                for (const speaker of speakers) {
                    if (speaker.avatar_key) {
                        try {
                            const deleteCommand = new DeleteObjectCommand({
                                Bucket: DO_SPACES_BUCKET,
                                Key: speaker.avatar_key,
                            });
                            await s3Client.send(deleteCommand);
                            console.log(`Deleted speaker avatar: ${speaker.avatar_key}`);
                        } catch (avatarError: any) {
                            console.warn(`Failed to delete speaker avatar ${speaker.avatar_key}:`, avatarError.message);
                        }
                    }
                }
            }
        }

        // Delete video and all related data from database (cascade will handle transcripts, blocks, etc.)
        // @ts-ignore - Prisma types generated at runtime
        await prisma.video.delete({
            where: { id: videoId },
        });

        return NextResponse.json({
            success: true,
            message: "Video and all associated data deleted successfully",
        });

    } catch (error: any) {
        console.error("Delete video error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete video" },
            { status: 500 }
        );
    }
}

