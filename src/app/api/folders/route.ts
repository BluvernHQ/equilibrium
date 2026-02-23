import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const parentId = searchParams.get('parentId');

        const folders = await prisma.folder.findMany({
            where: {
                parent_id: parentId === 'root' ? null : parentId,
            },
            orderBy: {
                name: 'asc',
            },
            include: {
                _count: {
                    select: {
                        videos: true,
                        sessions: true,
                        children: true,
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            folders: folders,
        });
    } catch (error: any) {
        console.error("List folders error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to list folders" },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, parentId } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Folder name is required" },
                { status: 400 }
            );
        }

        const parentIdVal = parentId || null;
        const existing = await prisma.folder.findFirst({
            where: {
                name: name.trim(),
                parent_id: parentIdVal === 'root' || !parentIdVal ? null : parentIdVal,
            },
        });
        if (existing) {
            return NextResponse.json(
                { error: "A folder with this name already exists in this location" },
                { status: 409 }
            );
        }

        const folder = await prisma.folder.create({
            data: {
                name: name.trim(),
                parent_id: parentIdVal === 'root' || !parentIdVal ? null : parentIdVal,
            },
        });

        return NextResponse.json({
            success: true,
            folder: folder,
        });
    } catch (error: any) {
        console.error("Create folder error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create folder" },
            { status: 500 }
        );
    }
}
