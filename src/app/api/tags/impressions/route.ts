import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Create a tag impression (the actual tagging action)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            transcriptId,
            blockIds,
            masterTagName,
            masterTagDescription,
            branchNames, // Added: Array of strings
            primaryTags, // Array of { name: string, comment?: string, secondaryTags?: string[], selectedText?: string, selectionRange?: object }
            createdBy,
            sectionId,      // Optional: Section context for analytics
            subsectionId,   // Optional: Subsection context for analytics
            selectedText,   // The exact selected text (combined from all selections)
            selectionRanges, // Array of { blockId: string, startOffset: number, endOffset: number }
        } = body;

        if (!transcriptId) {
            return NextResponse.json(
                { error: "Transcript ID is required" },
                { status: 400 }
            );
        }

        if (!blockIds || !Array.isArray(blockIds) || blockIds.length === 0) {
            return NextResponse.json(
                { error: "At least one block ID is required" },
                { status: 400 }
            );
        }

        if (!masterTagName?.trim()) {
            return NextResponse.json(
                { error: "Master tag name is required" },
                { status: 400 }
            );
        }

        // Use transaction for atomicity
        // @ts-ignore
        const result = await prisma.$transaction(async (tx: any) => {
            // 1. Create or get Master Tag
            let masterTag = await tx.masterTag.findUnique({
                where: { name: masterTagName.trim() }
            });

            if (!masterTag) {
                masterTag = await tx.masterTag.create({
                    data: {
                        name: masterTagName.trim(),
                        description: masterTagDescription || null,
                        created_by: createdBy || null,
                    }
                });
            }

            // 1.5 Create Branch Tags if provided
            if (branchNames && Array.isArray(branchNames)) {
                for (const branchName of branchNames) {
                    if (!branchName?.trim()) continue;

                    // Check if branch tag already exists for this master tag
                    const existingBranch = await tx.branchTag.findFirst({
                        where: {
                            master_tag_id: masterTag.id,
                            name: branchName.trim()
                        }
                    });

                    if (!existingBranch) {
                        await tx.branchTag.create({
                            data: {
                                master_tag: { connect: { id: masterTag.id } },
                                name: branchName.trim()
                            }
                        });
                    }
                }
            }

            // 2. Create Primary Tags and Tag Impressions
            const impressions = [];
            const primaryNameCounters: Record<string, number> = {};

            for (const primaryTag of (primaryTags || [])) {
                if (!primaryTag.name?.trim()) continue;

                const name = primaryTag.name.trim();

                // Determine if we should reuse an existing primary tag or create a new one
                let primary = null;

                if (primaryTag.id) {
                    // Use existing primary tag instance
                    primary = await tx.primaryTag.findUnique({
                        where: { id: primaryTag.id }
                    });
                }

                if (!primary) {
                    // Create NEW primary tag instance
                    primary = await tx.primaryTag.create({
                        data: {
                            master_tag: {
                                connect: { id: masterTag.id }
                            },
                            name: name,
                        }
                    });
                }

                // Calculate instance index for this primary tag name under this master tag
                // We count all primary tags with this name that were created at or before this one
                const instanceIndex = await tx.primaryTag.count({
                    where: {
                        master_tag_id: masterTag.id,
                        name: name,
                        created_at: {
                            lte: primary.created_at
                        }
                    }
                });

                // Create secondary tags if provided
                const secondaryTagIds: string[] = [];
                if (primaryTag.secondaryTags && Array.isArray(primaryTag.secondaryTags)) {
                    for (const secondaryName of primaryTag.secondaryTags) {
                        if (!secondaryName?.trim()) continue;

                        // Create secondary tag under this primary
                        const secondary = await tx.secondaryTag.create({
                            data: {
                                primary_tag: {
                                    connect: { id: primary.id }
                                },
                                name: secondaryName.trim(),
                            }
                        });
                        secondaryTagIds.push(secondary.id);
                    }
                }

                // Create tag impression - using connect syntax for relations
                const impression = await tx.tagImpression.create({
                    data: {
                        transcript: {
                            connect: { id: transcriptId }
                        },
                        // Use specific block ID for this primary tag if provided, 
                        // otherwise fallback to the session-wide blockIds list
                        block_ids: primaryTag.blockId ? [primaryTag.blockId] : blockIds,
                        // Selection data for precise highlight persistence
                        selected_text: primaryTag.selectedText || selectedText || null,
                        selection_ranges: primaryTag.selectionRange
                            ? [primaryTag.selectionRange]
                            : (selectionRanges || null),
                        master_tag: {
                            connect: { id: masterTag.id }
                        },
                        primary_tag: {
                            connect: { id: primary.id }
                        },
                        secondary_tag_ids: secondaryTagIds,
                        created_by: createdBy || null,
                        // Optional section context for analytics
                        section_id: sectionId || null,
                        subsection_id: subsectionId || null,
                        comment: primaryTag.comment || null,
                    }
                });

                impressions.push({
                    id: impression.id,
                    masterTagId: masterTag.id,
                    masterTagName: masterTag.name,
                    primaryTagId: primary.id,
                    primaryTagName: name,
                    instanceIndex,
                    displayName: `${name} (${instanceIndex})`,
                    comment: primaryTag.comment,
                    secondaryTagIds: secondaryTagIds,
                    blockIds: primaryTag.blockId ? [primaryTag.blockId] : blockIds,
                    selectedText: primaryTag.selectedText || selectedText || null,
                    selectionRanges: primaryTag.selectionRange
                        ? [primaryTag.selectionRange]
                        : (selectionRanges || null),
                });
            }

            return {
                masterTag: {
                    id: masterTag.id,
                    name: masterTag.name,
                    description: masterTag.description,
                },
                impressions,
            };
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        console.error("Create tag impression error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create tag impression" },
            { status: 500 }
        );
    }
}

// DELETE - Remove a tag impression
export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const impressionId = searchParams.get("id");

        if (!impressionId) {
            return NextResponse.json(
                { error: "Impression ID is required" },
                { status: 400 }
            );
        }

        // First check if the impression exists
        // @ts-ignore
        const existing = await prisma.tagImpression.findUnique({
            where: { id: impressionId }
        });

        if (!existing) {
            // Record doesn't exist - could be already deleted or never saved
            // Return success anyway to allow frontend to clean up state
            return NextResponse.json({
                success: true,
                message: "Tag impression not found (may have been already deleted)",
                alreadyDeleted: true,
            });
        }

        // @ts-ignore
        await prisma.tagImpression.delete({
            where: { id: impressionId }
        });

        return NextResponse.json({
            success: true,
            message: "Tag impression deleted",
        });
    } catch (error: any) {
        console.error("Delete tag impression error:", error);

        // Handle "record not found" error gracefully
        if (error.code === 'P2025') {
            return NextResponse.json({
                success: true,
                message: "Tag impression not found (may have been already deleted)",
                alreadyDeleted: true,
            });
        }

        return NextResponse.json(
            { error: error.message || "Failed to delete tag impression" },
            { status: 500 }
        );
    }
}

// PATCH - Update a tag impression (comment or secondary tags)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, comment, secondaryTagName } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Impression ID is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const existing = await prisma.tagImpression.findUnique({
            where: { id }
        });

        if (!existing) {
            return NextResponse.json(
                { error: "Tag impression not found" },
                { status: 404 }
            );
        }

        let updatedImpression;

        if (secondaryTagName) {
            // Add a secondary tag to this impression
            // For JSON field, we need to handle it carefully
            const existingSecondaryIds = Array.isArray(existing.secondary_tag_ids)
                ? (existing.secondary_tag_ids as string[])
                : [];

            // First create the secondary tag if needed
            // @ts-ignore
            const secondary = await prisma.secondaryTag.create({
                data: {
                    primary_tag: { connect: { id: existing.primary_tag_id! } },
                    name: secondaryTagName.trim()
                }
            });

            // @ts-ignore
            updatedImpression = await prisma.tagImpression.update({
                where: { id },
                data: {
                    secondary_tag_ids: [...existingSecondaryIds, secondary.id]
                }
            });
        } else {
            // Update comment
            // @ts-ignore
            updatedImpression = await prisma.tagImpression.update({
                where: { id },
                data: {
                    // @ts-ignore
                    comment: comment !== undefined ? comment : existing.comment
                }
            });
        }

        return NextResponse.json({
            success: true,
            impression: updatedImpression
        });
    } catch (error: any) {
        console.error("Update tag impression error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update tag impression" },
            { status: 500 }
        );
    }
}

