import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - List all master tags (optionally filter by transcript)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search");
        const includeStats = searchParams.get("includeStats") === "true";

        // @ts-ignore
        const masterTags = await prisma.masterTag.findMany({
            where: search ? {
                name: { contains: search, mode: 'insensitive' }
            } : undefined,
            orderBy: { name: 'asc' },
            include: {
                primary_tags: {
                    select: { 
                        id: true, 
                        name: true,
                        _count: includeStats ? {
                            select: { tag_impressions: true }
                        } : undefined
                    }
                },
                _count: {
                    select: { 
                        tag_impressions: true,
                        primary_tags: true
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            masterTags: masterTags.map((tag: any) => ({
                id: tag.id,
                name: tag.name,
                description: tag.description,
                color: tag.color,
                icon: tag.icon,
                isClosed: tag.is_closed || false,
                closedAt: tag.closed_at,
                primaryTags: tag.primary_tags.map((pt: any) => ({
                    id: pt.id,
                    name: pt.name,
                    impressionCount: pt._count?.tag_impressions || 0
                })),
                // Analytics counts
                masterImpressionCount: tag._count.tag_impressions,
                primaryTagCount: tag._count.primary_tags,
            })),
        });
    } catch (error: any) {
        console.error("Get master tags error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get master tags" },
            { status: 500 }
        );
    }
}

// POST - Create or get existing master tag
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, description, color, icon, created_by, forceNew } = body;

        if (!name?.trim()) {
            return NextResponse.json(
                { error: "Master tag name is required" },
                { status: 400 }
            );
        }

        const trimmedName = name.trim();

        // Try to find existing master tag (globally unique, case-insensitive)
        // @ts-ignore
        let masterTag = await prisma.masterTag.findFirst({
            where: { 
                name: {
                    equals: trimmedName,
                    mode: 'insensitive'
                }
            }
        });

        // If master tag exists and forceNew is true, return error (uniqueness violation)
        if (masterTag && forceNew) {
            return NextResponse.json(
                { 
                    error: `Master tag "${trimmedName}" already exists`, 
                    exists: true,
                    existingTag: {
                        id: masterTag.id,
                        name: masterTag.name,
                        isClosed: (masterTag as any).is_closed || false,
                    }
                },
                { status: 409 } // Conflict
            );
        }

        let isNew = false;
        if (!masterTag) {
            // Create new master tag
            // @ts-ignore
            masterTag = await prisma.masterTag.create({
                data: {
                    name: trimmedName,
                    description: description || null,
                    color: color || null,
                    icon: icon || null,
                    created_by: created_by || null,
                    // is_closed defaults to false via schema @default(false)
                }
            });
            isNew = true;
        }

        return NextResponse.json({
            success: true,
            masterTag: {
                id: masterTag.id,
                name: masterTag.name,
                description: masterTag.description,
                color: masterTag.color,
                icon: masterTag.icon,
                isClosed: (masterTag as any).is_closed || false,
                closedAt: (masterTag as any).closed_at,
                isNew,
            },
        });
    } catch (error: any) {
        console.error("Create master tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to create master tag" },
            { status: 500 }
        );
    }
}

// PATCH - Update master tag (close/reopen, update description)
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, action, description, color, icon, name } = body;

        if (!id) {
            return NextResponse.json(
                { error: "Master tag ID is required" },
                { status: 400 }
            );
        }

        // Find existing master tag
        // @ts-ignore
        const existingTag = await prisma.masterTag.findUnique({
            where: { id }
        });

        if (!existingTag) {
            return NextResponse.json(
                { error: "Master tag not found" },
                { status: 404 }
            );
        }

        // Handle different actions
        const updateData: any = {};

        if (action === 'close') {
            updateData.is_closed = true;
            updateData.closed_at = new Date();
        } else if (action === 'reopen') {
            updateData.is_closed = false;
            updateData.closed_at = null;
        }

        // Allow name change
        if (name && name.trim() !== existingTag.name) {
            // Check if new name already exists (case-insensitive)
            // @ts-ignore
            const nameExists = await prisma.masterTag.findFirst({
                where: { 
                    name: {
                        equals: name.trim(),
                        mode: 'insensitive'
                    }
                }
            });
            
            if (nameExists && nameExists.id !== id) {
                return NextResponse.json(
                    { error: `Master tag "${name.trim()}" already exists` },
                    { status: 409 }
                );
            }
            
            updateData.name = name.trim();
        }

        // Allow description, color, icon updates regardless of closed status
        if (description !== undefined) updateData.description = description;
        if (color !== undefined) updateData.color = color;
        if (icon !== undefined) updateData.icon = icon;

        // Update the tag
        // @ts-ignore
        const updatedTag = await prisma.masterTag.update({
            where: { id },
            data: updateData,
            include: {
                _count: {
                    select: { 
                        tag_impressions: true,
                        primary_tags: true
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            masterTag: {
                id: updatedTag.id,
                name: updatedTag.name,
                description: updatedTag.description,
                color: updatedTag.color,
                icon: updatedTag.icon,
                isClosed: (updatedTag as any).is_closed || false,
                closedAt: (updatedTag as any).closed_at,
                masterImpressionCount: (updatedTag as any)._count.tag_impressions,
                primaryTagCount: (updatedTag as any)._count.primary_tags,
            },
        });
    } catch (error: any) {
        console.error("Update master tag error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to update master tag" },
            { status: 500 }
        );
    }
}

