import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const folder = await prisma.folder.findUnique({
            where: { id },
            select: { id: true, name: true, parent_id: true },
        });
        if (!folder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }
        return NextResponse.json({ success: true, folder });
    } catch (error: any) {
        console.error("Get folder error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get folder" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Folder name is required" },
                { status: 400 }
            );
        }

        const existingFolder = await prisma.folder.findUnique({
            where: { id },
            select: { parent_id: true },
        });
        if (!existingFolder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }
        const siblingWithSameName = await prisma.folder.findFirst({
            where: {
                name: name.trim(),
                parent_id: existingFolder.parent_id,
                id: { not: id },
            },
        });
        if (siblingWithSameName) {
            return NextResponse.json(
                { error: "A folder with this name already exists in this location" },
                { status: 409 }
            );
        }

        // @ts-ignore
        const folder = await prisma.folder.update({
            where: { id: id },
            data: { name: name.trim() },
        });

        return NextResponse.json({
            success: true,
            folder: folder,
        });
    } catch (error: any) {
        console.error("Rename folder error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to rename folder" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const folder = await prisma.folder.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!folder) {
            return NextResponse.json({ error: "Folder not found" }, { status: 404 });
        }

        // Unlink all videos and sessions from this folder so they are not orphaned
        await prisma.video.updateMany({
            where: { folder_id: id },
            data: { folder_id: null },
        });
        // @ts-ignore - sessions table name
        await prisma.sessions.updateMany({
            where: { folder_id: id },
            data: { folder_id: null },
        });

        // Delete child folders recursively (they will unlink their own videos/sessions)
        const children = await prisma.folder.findMany({
            where: { parent_id: id },
            select: { id: true },
        });
        for (const child of children) {
            const childReq = new NextRequest(req.url, { method: "DELETE" });
            await DELETE(childReq, { params: Promise.resolve({ id: child.id }) });
        }

        // @ts-ignore
        await prisma.folder.delete({
            where: { id: id },
        });

        return NextResponse.json({
            success: true,
            message: "Folder deleted successfully",
        });
    } catch (error: any) {
        console.error("Delete folder error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete folder" },
            { status: 500 }
        );
    }
}
