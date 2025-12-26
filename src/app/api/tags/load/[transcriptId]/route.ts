import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Load all tags and impressions for a transcript
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ transcriptId: string }> }
) {
    try {
        const { transcriptId } = await params;

        // Get all tag impressions for this transcript
        const impressions = await prisma.tagImpression.findMany({
            where: { transcript_id: transcriptId },
            include: {
                master_tag: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        color: true,
                        icon: true,
                        is_closed: true,
                        branch_tags: {
                            select: { id: true, name: true }
                        }
                    }
                },
                primary_tag: {
                    select: {
                        id: true,
                        name: true,
                        secondary_tags: {
                            select: { id: true, name: true }
                        }
                    }
                },
            },
            orderBy: { created_at: 'asc' }
        });

        // Get sections for this transcript
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

        // Group impressions by (master tag + selection) to keep separate tagging events distinct
        const tagGroups: Record<string, any> = {};
        const masterPrimaryNameCounters: Record<string, Record<string, number>> = {};

        for (const impression of impressions) {
            // Cast to any to access all fields including new ones
            const imp = impression as any;
            const masterTagId = imp.master_tag.id;
            
            // Use masterTagId + selection_ranges as grouping key to keep distinct selections separate
            // even if they use the same master tag
            const selectionKey = JSON.stringify(imp.selection_ranges || imp.block_ids);
            const groupingKey = `${masterTagId}-${selectionKey}`;
            
            if (!tagGroups[groupingKey]) {
                tagGroups[groupingKey] = {
                    id: imp.id, // Use the first impression ID as the group ID
                    masterTag: imp.master_tag,
                    branchTags: imp.master_tag.branch_tags || [],
                    primaryTags: [],
                    blockIds: new Set(),
                };
            }

            if (!masterPrimaryNameCounters[masterTagId]) {
                masterPrimaryNameCounters[masterTagId] = {};
            }

            if (imp.primary_tag) {
                const name = imp.primary_tag.name;
                // Calculate instance index based on creation order (impressions are sorted by created_at asc)
                const index = (masterPrimaryNameCounters[masterTagId][name] || 0) + 1;
                masterPrimaryNameCounters[masterTagId][name] = index;

                tagGroups[groupingKey].primaryTags.push({
                    id: imp.primary_tag.id,
                    name: name,
                    instanceIndex: index,
                    displayName: `${name} (${index})`,
                    impressionId: imp.id,
                    blockIds: imp.block_ids,
                    selectedText: imp.selected_text, // The exact text that was selected
                    selectionRanges: imp.selection_ranges, // Array of {blockId, startOffset, endOffset}
                    secondaryTags: imp.primary_tag.secondary_tags || [],
                    comment: imp.comment,
                    sectionId: imp.section_id,
                    subsectionId: imp.subsection_id,
                    createdAt: imp.created_at,
                });
            }

            // Collect all block IDs
            if (Array.isArray(imp.block_ids)) {
                (imp.block_ids as string[]).forEach((blockId: string) => {
                    tagGroups[groupingKey].blockIds.add(blockId);
                });
            }
        }

        // Convert Sets to arrays
        const formattedTagGroups = Object.values(tagGroups).map((group: any) => ({
            ...group,
            blockIds: Array.from(group.blockIds),
        }));

        return NextResponse.json({
            success: true,
            transcriptId,
            tagGroups: formattedTagGroups,
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
            impressionCount: impressions.length,
        });
    } catch (error: any) {
        console.error("Load tags error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to load tags" },
            { status: 500 }
        );
    }
}

