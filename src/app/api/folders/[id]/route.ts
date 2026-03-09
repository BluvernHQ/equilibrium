import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-utils";
import {
    ValidationError,
    NotFoundError,
    ConflictError,
} from "@/lib/errors";
import { DELETE as deleteVideoRoute } from "@/app/api/videos/delete/[videoId]/route";

type RouteContext = { params: Promise<{ id: string }> };

async function getFolder(_req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const folder = await prisma.folder.findUnique({
        where: { id },
        select: { id: true, name: true, parent_id: true },
    });
    if (!folder) {
        throw new NotFoundError("Folder not found", "folder");
    }
    return NextResponse.json({ success: true, folder });
}

async function patchFolder(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
        throw new ValidationError("Folder name is required", {
            field: "name",
        });
    }

    const existingFolder = await prisma.folder.findUnique({
        where: { id },
        select: { parent_id: true },
    });
    if (!existingFolder) {
        throw new NotFoundError("Folder not found", "folder");
    }
    const siblingWithSameName = await prisma.folder.findFirst({
        where: {
            name: name.trim(),
            parent_id: existingFolder.parent_id,
            id: { not: id },
        },
    });
    if (siblingWithSameName) {
        throw new ConflictError("A folder with this name already exists in this location", {
            field: "name",
            folderId: id,
        });
    }

    const folder = await prisma.folder.update({
        where: { id },
        data: { name: name.trim() },
    });

    return NextResponse.json({
        success: true,
        folder: folder,
    });
}

async function deleteFolder(req: NextRequest, { params }: RouteContext) {
    const { id } = await params;

    const folder = await prisma.folder.findUnique({
        where: { id },
        select: { id: true },
    });
    if (!folder) {
        throw new NotFoundError("Folder not found", "folder");
    }

    // Delete all videos in this folder using the same logic as the video delete API
    const videosInFolder = await prisma.video.findMany({
        where: { folder_id: id },
        select: { id: true },
    });

    for (const video of videosInFolder) {
        // Reuse the existing DELETE handler to ensure storage and related data are cleaned up
        await deleteVideoRoute(
            new NextRequest(req.url, { method: "DELETE" }),
            { params: Promise.resolve({ videoId: video.id }) }
        );
    }

    await prisma.sessions.updateMany({
        where: { folder_id: id },
        data: { folder_id: null },
    });

    const children = await prisma.folder.findMany({
        where: { parent_id: id },
        select: { id: true },
    });
    for (const child of children) {
        const childReq = new NextRequest(req.url, { method: "DELETE" });
        await deleteFolder(childReq, { params: Promise.resolve({ id: child.id }) });
    }

    await prisma.folder.delete({
        where: { id },
    });

    return NextResponse.json({
        success: true,
        message: "Folder deleted successfully",
    });
}

export const GET = apiHandler(getFolder);
export const PATCH = apiHandler(patchFolder);
export const DELETE = apiHandler(deleteFolder);
