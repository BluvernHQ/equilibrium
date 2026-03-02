import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-utils";
import {
    ValidationError,
    ConflictError,
} from "@/lib/errors";

async function getFolders(req: NextRequest) {
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
}

async function postFolder(req: NextRequest) {
    const body = await req.json();
    const { name, parentId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
        throw new ValidationError("Folder name is required", {
            field: "name",
        });
    }

    const parentIdVal = parentId || null;
    const existing = await prisma.folder.findFirst({
        where: {
            name: name.trim(),
            parent_id: parentIdVal === 'root' || !parentIdVal ? null : parentIdVal,
        },
    });
    if (existing) {
        throw new ConflictError("A folder with this name already exists in this location", {
            field: "name",
            parentId: parentIdVal,
        });
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
}

export const GET = apiHandler(getFolders);
export const POST = apiHandler(postFolder);
