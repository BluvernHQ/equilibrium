import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        // Get the latest transcription for this video
        // @ts-ignore - Prisma types generated at runtime
        const transcription = await prisma.transcription.findFirst({
            where: { videoId },
            orderBy: { createdAt: 'desc' },
            include: {
                video: {
                    select: {
                        id: true,
                        fileName: true,
                        fileUrl: true,
                        fileKey: true,
                    },
                },
            },
        });

        if (!transcription) {
            return NextResponse.json(
                { error: "Transcription not found" },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            transcription,
        });

    } catch (error: any) {
        console.error("Get transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get transcription" },
            { status: 500 }
        );
    }
}

