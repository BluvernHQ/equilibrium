import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List subsections for a section
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const sectionId = searchParams.get("sectionId");

        if (!sectionId) {
            return NextResponse.json(
                { error: "Section ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const subsections = await prisma.subsection.findMany({
            where: { section_id: sectionId },
            orderBy: { start_block_index: 'asc' }
        });

        return NextResponse.json({
            success: true,
            subsections: subsections.map((sub: any) => ({
                id: sub.id,
                sectionId: sub.section_id,
                name: sub.name,
                startBlockIndex: sub.start_block_index,
                endBlockIndex: sub.end_block_index,
            })),
        });
    } catch (error: any) {
        console.error("Get subsections error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get subsections" },
            { status: 500 }
        );
    }
}

// POST - Create a subsection
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { sectionId, name, startBlockIndex, endBlockIndex } = body;

        if (!sectionId) {
            return NextResponse.json(
                { error: "Section ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Subsection name is required" },
                { status: 400 }
            );
        }

        if (typeof startBlockIndex !== 'number') {
            return NextResponse.json(
                { error: "Start block index is required" },
                { status: 400 }
            );
        }

        // Verify section exists
        // @ts-ignore
        const section = await prisma.section.findUnique({
            where: { id: sectionId }
        });

        if (!section) {
            return NextResponse.json(
                { error: "Parent section not found" },
                { status: 404 }
            );
        }

        // RULE: Subsection cannot have the same name as its parent Section
        if ((section as any).name.toLowerCase().trim() === name.toLowerCase().trim()) {
            return NextResponse.json(
                { error: "Subsection cannot have the same name as its parent Section" },
                { status: 400 }
            );
        }

        // RULE: Check for duplicate name within section (unique per section)
        // @ts-ignore
        const existing = await prisma.subsection.findFirst({
            where: {
                section_id: sectionId,
                name: name.trim(),
            }
        });

        if (existing) {
            return NextResponse.json(
                { error: "Subsection name must be unique within the section" },
                { status: 400 }
            );
        }

        // @ts-ignore - Prisma v7 requires relation connect syntax
        const subsection = await prisma.subsection.create({
            data: {
                section: {
                    connect: { id: sectionId }
                },
                name: name.trim(),
                start_block_index: startBlockIndex,
                end_block_index: endBlockIndex ?? null,
            }
        });

        return NextResponse.json({
            success: true,
            subsection: {
                id: subsection.id,
                sectionId: subsection.section_id,
                name: subsection.name,
                startBlockIndex: subsection.start_block_index,
                endBlockIndex: subsection.end_block_index,
            },
        });
    } catch (error: any) {
        console.error("Create subsection error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create subsection" },
            { status: 500 }
        );
    }
}

// PUT - Update a subsection (including closing it by setting endBlockIndex)
export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name, startBlockIndex, endBlockIndex } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Subsection ID is required" },
                { status: 400 }
            );
        }

        // Get existing subsection with its parent section
        // @ts-ignore
        const existing = await prisma.subsection.findUnique({
            where: { id },
            include: { section: true }
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Subsection not found" },
                { status: 404 }
            );
        }

        // If name is being updated, validate the new name
        if (name !== undefined && name.trim() !== existing.name) {
            const newName = name.trim();
            
            // RULE: Subsection cannot have the same name as its parent Section
            if ((existing as any).section.name.toLowerCase().trim() === newName.toLowerCase()) {
                return NextResponse.json(
                    { error: "Subsection cannot have the same name as its parent Section" },
                    { status: 400 }
                );
            }

            // RULE: Check for duplicate name within section
            // @ts-ignore
            const duplicate = await prisma.subsection.findFirst({
                where: {
                    section_id: existing.section_id,
                    name: newName,
                    NOT: { id: id }
                }
            });

            if (duplicate) {
                return NextResponse.json(
                    { error: "Subsection name must be unique within the section" },
                    { status: 400 }
                );
            }
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name.trim();
        if (startBlockIndex !== undefined) updateData.start_block_index = startBlockIndex;
        if (endBlockIndex !== undefined) updateData.end_block_index = endBlockIndex;

        // @ts-ignore
        const subsection = await prisma.subsection.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({
            success: true,
            subsection: {
                id: subsection.id,
                sectionId: subsection.section_id,
                name: subsection.name,
                startBlockIndex: subsection.start_block_index,
                endBlockIndex: subsection.end_block_index,
            },
        });
    } catch (error: any) {
        console.error("Update subsection error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update subsection" },
            { status: 500 }
        );
    }
}

// DELETE - Delete a subsection
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "Subsection ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        await prisma.subsection.delete({
            where: { id }
        });

        return NextResponse.json({
            success: true,
            message: "Subsection deleted",
        });
    } catch (error: any) {
        console.error("Delete subsection error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete subsection" },
            { status: 500 }
        );
    }
}

