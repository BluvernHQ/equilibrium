import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, ValidationError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

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

        const trimmedName = name.trim();

        // Enforce: all secondary tags within a single primary tag must be unique
        // @ts-ignore
        const existing = await prisma.secondaryTag.findFirst({
            where: {
                primary_tag_id: primaryTagId,
                name: trimmedName,
            }
        });

        if (existing) {
            return NextResponse.json(
                { error: "Secondary tag name must be unique within this primary tag" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const secondaryTag = await prisma.secondaryTag.create({
            data: {
                primary_tag: {
                    connect: { id: primaryTagId }
                },
                name: trimmedName,
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
    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return handleError(error);
        }
        logger.error(
            "Create secondary tag failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/tags/secondary" }
        );
        return handleError(error);
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

// PATCH - Update a secondary tag
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Secondary Tag ID is required" },
                { status: 400 }
            );
        }

        if (name !== undefined && !name.trim()) {
            return NextResponse.json(
                { error: "Secondary tag name is required" },
                { status: 400 }
            );
        }

        let trimmedName: string | undefined = undefined;
        if (name !== undefined) {
            trimmedName = name.trim();
        }

        // When renaming, enforce uniqueness within the same primary tag
        if (trimmedName) {
            // @ts-ignore
            const existingTag = await prisma.secondaryTag.findUnique({
                where: { id },
            });

            if (!existingTag) {
                return NextResponse.json(
                    { error: "Secondary tag not found" },
                    { status: 404 }
                );
            }

            // @ts-ignore
            const duplicate = await prisma.secondaryTag.findFirst({
                where: {
                    primary_tag_id: existingTag.primary_tag_id,
                    name: trimmedName,
                    NOT: { id },
                }
            });

            if (duplicate) {
                return NextResponse.json(
                    { error: "Secondary tag name must be unique within this primary tag" },
                    { status: 400 }
                );
            }
        }

        // @ts-ignore
        const secondaryTag = await prisma.secondaryTag.update({
            where: { id },
            data: {
                name: trimmedName,
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
    } catch (error: unknown) {
        if (error && typeof error === "object" && "code" in error && (error as { code: string }).code === "P2025") {
            return handleError(new NotFoundError("Secondary tag not found", "resource"));
        }
        if (error instanceof ValidationError) {
            return handleError(error);
        }
        logger.error(
            "Update secondary tag failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/tags/secondary" }
        );
        return handleError(error);
    }
}
