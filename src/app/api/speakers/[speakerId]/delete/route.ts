import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Create S3 client function (reusing from upload-avatar)
const createS3Client = () => {
    const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || "https://blr1.digitaloceanspaces.com";
    const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
    const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;

    return new S3Client({
        endpoint: DO_SPACES_ENDPOINT,
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
    { params }: { params: Promise<{ speakerId: string }> }
) {
    try {
        const { speakerId } = await params;

        // 1. Find the speaker to get the avatar_key
        // @ts-ignore
        const speaker = await prisma.speaker.findUnique({
            where: { id: speakerId },
        });

        if (!speaker) {
            return NextResponse.json(
                { error: "Speaker not found" },
                { status: 404 }
            );
        }

        // 2. Delete the avatar image from storage if it exists
        if (speaker.avatar_key) {
            try {
                const s3Client = createS3Client();
                const deleteParams = {
                    Bucket: process.env.DO_SPACES_BUCKET || "",
                    Key: speaker.avatar_key,
                };
                await s3Client.send(new DeleteObjectCommand(deleteParams));
                console.log(`Successfully deleted avatar from storage: ${speaker.avatar_key}`);
            } catch (s3Error) {
                console.error("Failed to delete avatar from storage:", s3Error);
                // We continue even if storage deletion fails, to ensure database is cleaned up
            }
        }

        // 3. Delete the speaker record from database
        // @ts-ignore
        await prisma.speaker.delete({
            where: { id: speakerId },
        });

        return NextResponse.json({
            success: true,
            message: "Speaker and avatar deleted successfully",
        });

    } catch (error: any) {
        console.error("Delete speaker error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete speaker" },
            { status: 500 }
        );
    }
}

