import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Get tag analytics (impression counts for master and primary tags)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const transcriptId = searchParams.get("transcriptId");
        const masterTagId = searchParams.get("masterTagId");

        // Build where clause based on filters
        const where: any = {};
        if (transcriptId) {
            where.transcript_id = transcriptId;
        }
        if (masterTagId) {
            where.master_tag_id = masterTagId;
        }

        // Get master tag impression counts
        // @ts-ignore
        const masterTagStats = await prisma.masterTag.findMany({
            where: masterTagId ? { id: masterTagId } : undefined,
            include: {
                _count: {
                    select: { 
                        tag_impressions: true,
                        primary_tags: true
                    }
                },
                primary_tags: {
                    include: {
                        _count: {
                            select: { tag_impressions: true }
                        }
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Calculate totals
        let totalMasterImpressions = 0;
        let totalPrimaryImpressions = 0;
        let totalPrimaryTags = 0;

        const formattedStats = masterTagStats.map((master: any) => {
            const masterImpressions = master._count.tag_impressions;
            totalMasterImpressions += masterImpressions;
            totalPrimaryTags += master._count.primary_tags;

            const primaryStats = master.primary_tags.map((primary: any) => {
                const primaryImpressions = primary._count.tag_impressions;
                totalPrimaryImpressions += primaryImpressions;
                
                return {
                    id: primary.id,
                    name: primary.name,
                    impressionCount: primaryImpressions,
                };
            });

            return {
                id: master.id,
                name: master.name,
                description: master.description,
                color: master.color,
                isClosed: master.is_closed || false,
                // Master tag stats
                masterImpressionCount: masterImpressions,
                primaryTagCount: master._count.primary_tags,
                // Primary tag breakdown
                primaryTags: primaryStats,
            };
        });

        // If filtering by transcript, get transcript-specific counts
        let transcriptStats = null;
        if (transcriptId) {
            // @ts-ignore
            const impressions = await prisma.tagImpression.groupBy({
                by: ['master_tag_id', 'primary_tag_id'],
                where: { transcript_id: transcriptId },
                _count: { id: true }
            });

            // Group by master tag
            const byMaster: Record<string, { count: number; primaries: Record<string, number> }> = {};
            
            for (const imp of impressions) {
                const masterId = imp.master_tag_id;
                if (!byMaster[masterId]) {
                    byMaster[masterId] = { count: 0, primaries: {} };
                }
                byMaster[masterId].count += imp._count.id;
                
                if (imp.primary_tag_id) {
                    byMaster[masterId].primaries[imp.primary_tag_id] = imp._count.id;
                }
            }

            transcriptStats = {
                transcriptId,
                byMasterTag: byMaster,
                totalImpressions: impressions.reduce((sum, imp) => sum + imp._count.id, 0),
            };
        }

        return NextResponse.json({
            success: true,
            analytics: {
                // Global totals
                totals: {
                    masterTags: masterTagStats.length,
                    primaryTags: totalPrimaryTags,
                    masterImpressions: totalMasterImpressions,
                    primaryImpressions: totalPrimaryImpressions,
                },
                // Per-master-tag breakdown
                masterTags: formattedStats,
                // Transcript-specific stats (if filtered)
                transcriptStats,
            },
        });
    } catch (error: any) {
        console.error("Get tag analytics error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get tag analytics" },
            { status: 500 }
        );
    }
}

