import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoIds, sessionIds, folderId } = body;

        if ((!videoIds || videoIds.length === 0) && (!sessionIds || sessionIds.length === 0)) {
            return NextResponse.json(
                { error: "At least one video or session ID is required" },
                { status: 400 }
            );
        }

        const updates = [];

        if (videoIds && videoIds.length > 0) {
            updates.push(prisma.video.updateMany({
                where: {
                    id: { in: videoIds }
                },
                data: {
                    folder_id: folderId || null
                }
            }));
        }

        if (sessionIds && sessionIds.length > 0) {
            updates.push(prisma.sessions.updateMany({
                where: {
                    id: { in: sessionIds }
                },
                data: {
                    folder_id: folderId || null
                }
            }));
        }

        await Promise.all(updates);

        return NextResponse.json({
            success: true,
            message: "Items moved successfully",
        });
    } catch (error: any) {
        console.error("Move items error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to move items" },
            { status: 500 }
        );
    }
}
