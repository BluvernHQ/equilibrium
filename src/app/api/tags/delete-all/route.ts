import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError } from "@/lib/errors";
import { logger } from "@/lib/logger";

// DELETE - Remove all tags from the database
export async function DELETE(req: NextRequest) {
    try {
        logger.info("Starting to delete all tags", { path: "/api/tags/delete-all" });

        // Delete in order to respect foreign key constraints
        // Note: Due to cascade deletes, deleting MasterTag will automatically delete
        // PrimaryTag, BranchTag, SecondaryTag, and TagImpression
        
        // First, get counts for reporting
        // @ts-ignore
        const tagImpressionCount = await prisma.tagImpression.count();
        // @ts-ignore
        const masterTagCount = await prisma.masterTag.count();
        // @ts-ignore
        const primaryTagCount = await prisma.primaryTag.count();
        // @ts-ignore
        const secondaryTagCount = await prisma.secondaryTag.count();
        // @ts-ignore
        const branchTagCount = await prisma.branchTag.count();

        logger.info("Tag counts before deletion", {
            tagImpressionCount,
            masterTagCount,
            primaryTagCount,
            secondaryTagCount,
            branchTagCount,
        });

        // Delete all tag impressions first (they reference tags)
        // @ts-ignore
        const deletedImpressions = await prisma.tagImpression.deleteMany({});
        logger.debug("Deleted tag impressions", { count: deletedImpressions.count });

        const deletedSecondary = await prisma.secondaryTag.deleteMany({});
        logger.debug("Deleted secondary tags", { count: deletedSecondary.count });

        const deletedPrimary = await prisma.primaryTag.deleteMany({});
        logger.debug("Deleted primary tags", { count: deletedPrimary.count });

        const deletedBranch = await prisma.branchTag.deleteMany({});
        logger.debug("Deleted branch tags", { count: deletedBranch.count });

        const deletedMaster = await prisma.masterTag.deleteMany({});
        logger.debug("Deleted master tags", { count: deletedMaster.count });

        return NextResponse.json({
            success: true,
            message: "All tags have been successfully deleted",
            deleted: {
                tagImpressions: deletedImpressions.count,
                secondaryTags: deletedSecondary.count,
                primaryTags: deletedPrimary.count,
                branchTags: deletedBranch.count,
                masterTags: deletedMaster.count,
            },
            beforeDeletion: {
                tagImpressions: tagImpressionCount,
                masterTags: masterTagCount,
                primaryTags: primaryTagCount,
                secondaryTags: secondaryTagCount,
                branchTags: branchTagCount,
            }
        });
    } catch (error: unknown) {
        logger.error(
            "Delete all tags failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/tags/delete-all" }
        );
        return handleError(error);
    }
}

