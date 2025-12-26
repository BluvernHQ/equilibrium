import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List primary tags for a master tag
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        let masterTagId = searchParams.get("masterTagId");
        const masterTagName = searchParams.get("masterTagName");
        const search = searchParams.get("search");

        if (!masterTagId && !masterTagName) {
            return NextResponse.json({ success: true, primaryTags: [] });
        }

        // If we have a master tag name but no ID, find the ID first
        if (!masterTagId && masterTagName) {
            // @ts-ignore
            const master = await prisma.masterTag.findFirst({
                where: { 
                    name: {
                        equals: masterTagName.trim(),
                        mode: 'insensitive'
                    }
                }
            });
            if (!master) {
                return NextResponse.json({ success: true, primaryTags: [] });
            }
            masterTagId = master.id;
        }

        // Fetch all primary tags for this master tag to determine numbering
        // @ts-ignore
        const allPrimaryTags = await prisma.primaryTag.findMany({
            where: {
                master_tag_id: masterTagId!,
            },
            orderBy: { created_at: 'asc' },
            include: {
                master_tag: {
                    select: { id: true, name: true }
                },
                secondary_tags: {
                    select: { id: true, name: true }
                },
                _count: {
                    select: { tag_impressions: true }
                }
            }
        });

        // Group by name and assign indices (1, 2, 3...)
        const nameToIndices = new Map<string, number>();
        const processedTags = allPrimaryTags.map((tag: any) => {
            const currentCount = (nameToIndices.get(tag.name) || 0) + 1;
            nameToIndices.set(tag.name, currentCount);
            return {
                id: tag.id,
                name: tag.name,
                displayName: `${tag.name} (${currentCount})`,
                instanceIndex: currentCount,
                masterTag: tag.master_tag,
                secondaryTags: tag.secondary_tags,
                impressionCount: tag._count.tag_impressions,
                createdAt: tag.created_at
            };
        });

        // Filter by search if provided
        let filteredTags = search 
            ? processedTags.filter((tag: any) => tag.name.toLowerCase().includes(search.toLowerCase()))
            : processedTags;

        // Sorting: by relevance (impression count desc, then recent)
        filteredTags.sort((a, b) => {
            if (b.impressionCount !== a.impressionCount) {
                return b.impressionCount - a.impressionCount;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // Cap to 20 results to prevent overload as per requirement
        const cappedTags = filteredTags.slice(0, 20);

        return NextResponse.json({
            success: true,
            primaryTags: cappedTags,
        });
    } catch (error: any) {
        console.error("Get primary tags error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get primary tags" },
            { status: 500 }
        );
    }
}

// POST - Create a NEW primary tag instance (explicit creation)
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { masterTagId, name } = body;

        if (!masterTagId) {
            return NextResponse.json(
                { error: "Master tag ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Primary tag name is required" },
                { status: 400 }
            );
        }

        const trimmedName = name.trim();

        // ALWAYS create a new primary tag instance
        // Per requirement: Multiple Primary Tag instances with the same name can exist
        // Each instance represents a separate impression.
        // @ts-ignore
        const primaryTag = await prisma.primaryTag.create({
            data: {
                master_tag_id: masterTagId,
                name: trimmedName,
            }
        });

        return NextResponse.json({
            success: true,
            primaryTag: {
                id: primaryTag.id,
                name: primaryTag.name,
                masterTagId: primaryTag.master_tag_id,
                isNew: true,
            },
        });
    } catch (error: any) {
        console.error("Create primary tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create primary tag" },
            { status: 500 }
        );
    }
}

// PATCH - Update a primary tag (rename)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, name } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Primary tag ID is required" },
                { status: 400 }
            );
        }

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Primary tag name is required" },
                { status: 400 }
            );
        }

        // @ts-ignore
        const primaryTag = await prisma.primaryTag.update({
            where: { id },
            data: { name: name.trim() }
        });

        return NextResponse.json({
            success: true,
            primaryTag: {
                id: primaryTag.id,
                name: primaryTag.name,
            },
        });
    } catch (error: any) {
        console.error("Update primary tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update primary tag" },
            { status: 500 }
        );
    }
}
