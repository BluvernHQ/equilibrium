import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List branch tags for a master tag
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const masterTagId = searchParams.get("masterTagId");

        if (!masterTagId) {
            return NextResponse.json(
                { error: "Master Tag ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const branchTags = await prisma.branchTag.findMany({
            where: { master_tag_id: masterTagId },
            orderBy: { created_at: 'asc' }
        });

        return NextResponse.json({
            success: true,
            branchTags: branchTags.map((tag: any) => ({
                id: tag.id,
                masterTagId: tag.master_tag_id,
                name: tag.name,
                description: tag.description,
                createdAt: tag.created_at,
            })),
        });
    } catch (error: any) {
        console.error("Get branch tags error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get branch tags" },
            { status: 500 }
        );
    }
}

// POST - Create a branch tag
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { masterTagId, name, description } = body;

        if (!masterTagId) {
            return NextResponse.json(
                { error: "Master Tag ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Branch tag name is required" },
                { status: 400 }
            );
        }

        // Verify master tag exists
        // @ts-ignore
        const masterTag = await prisma.masterTag.findUnique({
            where: { id: masterTagId }
        });

        if (!masterTag) {
            return NextResponse.json(
                { error: "Master tag not found" },
                { status: 404 }
            );
        }

        // RULE: Branch names must be unique within a Master tag
        // Check for duplicate name within master tag
        // @ts-ignore
        const existing = await prisma.branchTag.findFirst({
            where: {
                master_tag_id: masterTagId,
                name: name.trim(),
            }
        });

        if (existing) {
            return NextResponse.json(
                { error: "Branch tag name must be unique within the master tag" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const branchTag = await prisma.branchTag.create({
            data: {
                master_tag: {
                    connect: { id: masterTagId }
                },
                name: name.trim(),
                description: description || null,
            }
        });

        return NextResponse.json({
            success: true,
            branchTag: {
                id: branchTag.id,
                masterTagId: branchTag.master_tag_id,
                name: branchTag.name,
                description: branchTag.description,
                createdAt: branchTag.created_at,
            },
        });
    } catch (error: any) {
        console.error("Create branch tag error:", error);

        // Handle unique constraint violation
        if (error.code === 'P2002') {
            return NextResponse.json(
                { error: "Branch tag name must be unique within the master tag" },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to create branch tag" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a branch tag
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Branch Tag ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        await prisma.branchTag.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: "Branch tag deleted",
        });
    } catch (error: any) {
        console.error("Delete branch tag error:", error);

        if (error.code === 'P2025') {
            return NextResponse.json(
                { error: "Branch tag not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to delete branch tag" },
            { status: 500 }
        );
    }
}

// PATCH - Update a branch tag
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name, description } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Branch Tag ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const branchTag = await prisma.branchTag.update({
            where: { id },
            data: {
                name: name !== undefined ? name.trim() : undefined,
                description: description !== undefined ? description : undefined,
            }
        });

        return NextResponse.json({
            success: true,
            branchTag: {
                id: branchTag.id,
                masterTagId: branchTag.master_tag_id,
                name: branchTag.name,
                description: branchTag.description,
                createdAt: branchTag.created_at,
            },
        });
    } catch (error: any) {
        console.error("Update branch tag error:", error);

        if (error.code === 'P2025') {
            return NextResponse.json(
                { error: "Branch tag not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: error.message || "Failed to update branch tag" },
            { status: 500 }
        );
    }
}
