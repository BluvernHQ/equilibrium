import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { videoIds, sessionIds, folderId } = body;

        if ((!videoIds || videoIds.length === 0) && (!sessionIds || sessionIds.length === 0)) {
            throw new ValidationError("At least one video or session ID is required", {
                provided: { videoIds: !!videoIds?.length, sessionIds: !!sessionIds?.length },
            });
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
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return handleError(error);
        }
        logger.error(
            "Move items failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/folders/move" }
        );
        return handleError(error);
    }
}
