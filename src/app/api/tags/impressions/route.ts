import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, ValidationError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// POST - Create a tag impression (the actual tagging action)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            transcriptId,
            blockIds,
            masterTagName,
            masterTagId, // Added: explicit ID for reuse
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
            let masterTag = null;

            if (masterTagId) {
                // If ID is provided, reuse the existing Master Tag
                masterTag = await tx.masterTag.findUnique({
                    where: { id: masterTagId }
                });
            }

            // If no ID provided OR provided ID not found, create a NEW Master Tag
            // Rule 1.2: No auto-merge on name
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

            // Check if we have primary tags or highlights
            const hasTagsToCreate = primaryTags && Array.isArray(primaryTags) && primaryTags.length > 0;

            if (hasTagsToCreate) {
                // Create impressions for each tag (primary tag or highlight)
                for (const primaryTag of primaryTags) {
                    const name = primaryTag.name?.trim() || null;

                    let primary = null;
                    let instanceIndex = null;
                    let displayName = null;

                    if (name) {
                        // Determine if we should reuse an existing primary tag or create a new one
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
                        instanceIndex = await tx.primaryTag.count({
                            where: {
                                master_tag_id: masterTag.id,
                                name: name,
                                created_at: {
                                    lte: primary.created_at
                                }
                            }
                        });
                        displayName = `${name} (${instanceIndex})`;
                    }

                    // Create secondary tags if provided (only for primary tags)
                    const secondaryTagIds: string[] = [];
                    if (primary && primaryTag.secondaryTags && Array.isArray(primaryTag.secondaryTags)) {
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

                    // Create tag impression
                    const impressionData: any = {
                        transcript: {
                            connect: { id: transcriptId }
                        },
                        block_ids: primaryTag.blockId ? [primaryTag.blockId] : (primaryTag.blockIds || blockIds),
                        selected_text: primaryTag.selectedText || selectedText || null,
                        selection_ranges: primaryTag.selectionRange
                            ? [primaryTag.selectionRange]
                            : (primaryTag.selectionRanges || selectionRanges || null),
                        master_tag: {
                            connect: { id: masterTag.id }
                        },
                        secondary_tag_ids: secondaryTagIds,
                        created_by: createdBy || null,
                        section_id: sectionId || null,
                        subsection_id: subsectionId || null,
                        comment: primaryTag.comment || null,
                    };

                    if (primary) {
                        impressionData.primary_tag = {
                            connect: { id: primary.id }
                        };
                    }

                    const impression = await tx.tagImpression.create({
                        data: impressionData
                    });

                    impressions.push({
                        id: impression.id,
                        masterTagId: masterTag.id,
                        masterTagName: masterTag.name,
                        primaryTagId: primary ? primary.id : null,
                        primaryTagName: name,
                        instanceIndex,
                        displayName,
                        comment: primaryTag.comment || null,
                        secondaryTagIds: secondaryTagIds,
                        blockIds: impressionData.block_ids,
                        selectedText: impressionData.selected_text,
                        selectionRanges: impressionData.selection_ranges,
                    });
                }
            } else {
                // No tags at all - fallback to just a master tag impression if possible
                const impressionData: any = {
                    transcript: { connect: { id: transcriptId } },
                    block_ids: blockIds,
                    selected_text: selectedText || null,
                    selection_ranges: selectionRanges || null,
                    master_tag: { connect: { id: masterTag.id } },
                    secondary_tag_ids: [],
                    created_by: createdBy || null,
                    section_id: sectionId || null,
                    subsection_id: subsectionId || null,
                    comment: null,
                };

                const impression = await tx.tagImpression.create({ data: impressionData });

                impressions.push({
                    id: impression.id,
                    masterTagId: masterTag.id,
                    masterTagName: masterTag.name,
                    primaryTagId: null,
                    primaryTagName: null,
                    instanceIndex: null,
                    displayName: null,
                    comment: null,
                    secondaryTagIds: [],
                    blockIds: blockIds,
                    selectedText: selectedText || null,
                    selectionRanges: selectionRanges || null,
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
    } catch (error: unknown) {
        logger.error(
            "Create tag impression failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/tags/impressions" }
        );
        return handleError(error);
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
    } catch (error: unknown) {
        if (error instanceof ValidationError || error instanceof NotFoundError) {
            return handleError(error);
        }
        logger.error(
            "Update tag impression failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/tags/impressions" }
        );
        return handleError(error);
    }
}

