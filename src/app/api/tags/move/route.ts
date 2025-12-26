import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST - Move a tag (Primary between Masters, or update Section context)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { 
            action,           // 'move_primary' | 'move_to_section' | 'detach_from_section'
            primaryTagId,     // For moving primary tags
            impressionId,     // For moving section context
            targetMasterTagId,// Target master tag (for move_primary)
            targetSectionId,  // Target section (for move_to_section)
            targetSubsectionId, // Target subsection (optional)
        } = body;

        if (!action) {
            return NextResponse.json(
                { error: "Action is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const result = await prisma.$transaction(async (tx: any) => {
            switch (action) {
                case 'move_primary': {
                    // Move a Primary tag from one Master to another
                    if (!primaryTagId || !targetMasterTagId) {
                        throw new Error("Primary tag ID and target Master tag ID are required");
                    }

                    // Verify target master exists
                    const targetMaster = await tx.masterTag.findUnique({
                        where: { id: targetMasterTagId }
                    });

                    if (!targetMaster) {
                        throw new Error("Target master tag not found");
                    }

                    // Get current primary tag
                    const primaryTag = await tx.primaryTag.findUnique({
                        where: { id: primaryTagId }
                    });

                    if (!primaryTag) {
                        throw new Error("Primary tag not found");
                    }

                    // Update the primary tag's master
                    const updated = await tx.primaryTag.update({
                        where: { id: primaryTagId },
                        data: { master_tag_id: targetMasterTagId }
                    });

                    // Update all impressions that reference this primary tag
                    // to also reference the new master tag
                    await tx.tagImpression.updateMany({
                        where: { primary_tag_id: primaryTagId },
                        data: { master_tag_id: targetMasterTagId }
                    });

                    return {
                        action: 'move_primary',
                        primaryTag: {
                            id: updated.id,
                            name: updated.name,
                            newMasterTagId: targetMasterTagId,
                        },
                        message: "Primary tag moved to new master"
                    };
                }

                case 'move_to_section': {
                    // Move a tag impression to a different section
                    if (!impressionId) {
                        throw new Error("Impression ID is required");
                    }

                    // Verify section exists if provided
                    if (targetSectionId) {
                        const section = await tx.section.findUnique({
                            where: { id: targetSectionId }
                        });
                        if (!section) {
                            throw new Error("Target section not found");
                        }
                    }

                    // Verify subsection exists if provided
                    if (targetSubsectionId) {
                        const subsection = await tx.subsection.findUnique({
                            where: { id: targetSubsectionId }
                        });
                        if (!subsection) {
                            throw new Error("Target subsection not found");
                        }
                    }

                    // Update the impression's section context
                    const updated = await tx.tagImpression.update({
                        where: { id: impressionId },
                        data: {
                            section_id: targetSectionId || null,
                            subsection_id: targetSubsectionId || null,
                        }
                    });

                    return {
                        action: 'move_to_section',
                        impression: {
                            id: updated.id,
                            sectionId: updated.section_id,
                            subsectionId: updated.subsection_id,
                        },
                        message: "Tag moved to new section"
                    };
                }

                case 'detach_from_section': {
                    // Detach a tag impression from any section
                    if (!impressionId) {
                        throw new Error("Impression ID is required");
                    }

                    const updated = await tx.tagImpression.update({
                        where: { id: impressionId },
                        data: {
                            section_id: null,
                            subsection_id: null,
                        }
                    });

                    return {
                        action: 'detach_from_section',
                        impression: {
                            id: updated.id,
                            sectionId: null,
                            subsectionId: null,
                        },
                        message: "Tag detached from section"
                    };
                }

                default:
                    throw new Error(`Unknown action: ${action}`);
            }
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error: any) {
        console.error("Move tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to move tag" },
            { status: 500 }
        );
    }
}

