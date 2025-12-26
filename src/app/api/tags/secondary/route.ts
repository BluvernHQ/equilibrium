import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Create a secondary tag for a primary tag
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { primaryTagId, name } = body;

        if (!primaryTagId) {
            return NextResponse.json(
                { error: "Primary Tag ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Secondary tag name is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const secondaryTag = await prisma.secondaryTag.create({
            data: {
                primary_tag: {
                    connect: { id: primaryTagId }
                },
                name: name.trim(),
            }
        });

        return NextResponse.json({
            success: true,
            secondaryTag: {
                id: secondaryTag.id,
                primaryTagId: secondaryTag.primary_tag_id,
                name: secondaryTag.name,
            },
        });
    } catch (error: any) {
        console.error("Create secondary tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create secondary tag" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a secondary tag
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Secondary Tag ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        await prisma.secondaryTag.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: "Secondary tag deleted",
        });
    } catch (error: any) {
        console.error("Delete secondary tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete secondary tag" },
            { status: 500 }
        );
    }
}

