import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List sections for a transcript
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const transcriptId = searchParams.get("transcriptId");

        if (!transcriptId) {
            return NextResponse.json(
                { error: "Transcript ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const sections = await prisma.section.findMany({
            where: { transcript_id: transcriptId },
            include: {
                subsections: {
                    orderBy: { start_block_index: 'asc' }
                }
            },
            orderBy: { start_block_index: 'asc' }
        });

        return NextResponse.json({
            success: true,
            sections: sections.map((section: any) => ({
                id: section.id,
                name: section.name,
                startBlockIndex: section.start_block_index,
                endBlockIndex: section.end_block_index,
                subsections: section.subsections.map((sub: any) => ({
                    id: sub.id,
                    name: sub.name,
                    startBlockIndex: sub.start_block_index,
                    endBlockIndex: sub.end_block_index,
                })),
            })),
        });
    } catch (error: any) {
        console.error("Get sections error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get sections" },
            { status: 500 }
        );
    }
}

// POST - Create a section
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { transcriptId, name, startBlockIndex, endBlockIndex } = body;

        if (!transcriptId) {
            return NextResponse.json(
                { error: "Transcript ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Section name is required" },
                { status: 400 }
            );
        }

        if (typeof startBlockIndex !== 'number') {
            return NextResponse.json(
                { error: "Start block index is required" },
                { status: 400 }
            );
        }

        // RULE: Check for duplicate section name within the same transcript (case-insensitive)
        // @ts-ignore
        const existingSections = await prisma.section.findMany({
            where: {
                transcript_id: transcriptId
            },
            select: {
                name: true
            }
        });

        const trimmedName = name.trim().toLowerCase();
        const isDuplicate = existingSections.some(
            (section: any) => section.name.toLowerCase() === trimmedName
        );

        if (isDuplicate) {
            return NextResponse.json(
                { error: "Section name must be unique within the same transcript" },
                { status: 400 }
            );
        }

        // @ts-ignore - Prisma v7 requires relation connect syntax
        const section = await prisma.section.create({
            data: {
                transcript: {
                    connect: { id: transcriptId }
                },
                name: name.trim(),
                start_block_index: startBlockIndex,
                end_block_index: endBlockIndex ?? null,
            }
        });

        return NextResponse.json({
            success: true,
            section: {
                id: section.id,
                name: section.name,
                startBlockIndex: section.start_block_index,
                endBlockIndex: section.end_block_index,
            },
        });
    } catch (error: any) {
        console.error("Create section error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create section" },
            { status: 500 }
        );
    }
}

// PUT - Update a section (including closing it by setting endBlockIndex)
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name, startBlockIndex, endBlockIndex } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Section ID is required" },
                { status: 400 }
            );
        }

        // Get existing section to check transcript_id
        // @ts-ignore
        const existing = await prisma.section.findUnique({
            where: { id }
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Section not found" },
                { status: 404 }
            );
        }

        // If name is being updated, validate the new name for duplicates
        if (name !== undefined && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
            // RULE: Check for duplicate section name within the same transcript (case-insensitive)
            // @ts-ignore
            const allSections = await prisma.section.findMany({
                where: {
                    transcript_id: existing.transcript_id
                },
                select: {
                    id: true,
                    name: true
                }
            });

            const trimmedName = name.trim().toLowerCase();
            const isDuplicate = allSections.some(
                (section: any) => section.id !== id && section.name.toLowerCase() === trimmedName
            );

            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Section name must be unique within the same transcript" },
                    { status: 400 }
                );
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (startBlockIndex !== undefined) updateData.start_block_index = startBlockIndex;
        if (endBlockIndex !== undefined) updateData.end_block_index = endBlockIndex;

        // @ts-ignore
        const section = await prisma.section.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            section: {
                id: section.id,
                name: section.name,
                startBlockIndex: section.start_block_index,
                endBlockIndex: section.end_block_index,
            },
        });
    } catch (error: any) {
        console.error("Update section error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update section" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a section
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Section ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        await prisma.section.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: "Section deleted",
        });
    } catch (error: any) {
        console.error("Delete section error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete section" },
            { status: 500 }
        );
    }
}

